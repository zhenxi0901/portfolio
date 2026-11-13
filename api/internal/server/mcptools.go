package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/zhenxi0901/portfolio/api/internal/ask"
	"github.com/zhenxi0901/portfolio/api/internal/mcp"
	"github.com/zhenxi0901/portfolio/api/internal/slo"
)

// mcpServer exposes this site to AI agents (POST /mcp): the same facts the Ask console answers
// from, and the same live numbers the status page shows. Every tool is read-only. The answers are
// retrieval only, with no LLM of ours in the loop: the calling agent brings its own model.
func (s *Server) mcpServer() *mcp.Server {
	object := func(props map[string]any, required ...string) map[string]any {
		schema := map[string]any{"type": "object", "properties": props, "additionalProperties": false}
		if len(required) > 0 {
			schema["required"] = required
		}
		return schema
	}
	noArgs := map[string]any{"type": "object", "additionalProperties": false}

	tools := []mcp.Tool{
		{
			Name:  "ask",
			Title: "Ask about Li ZhenXi",
			Description: "Answer a question about Li ZhenXi's work, experience, projects or this site, from the site's own facts. " +
				"Returns a short answer and the sources it came from, with links. Use search_facts instead when you want the full text of the matching facts.",
			InputSchema: object(map[string]any{
				"question": map[string]any{"type": "string", "description": "A question in plain words, 3 to 300 characters.", "minLength": 3, "maxLength": 300},
			}, "question"),
			Call: s.toolAsk,
		},
		{
			Name:        "search_facts",
			Title:       "Search the site's facts",
			Description: "Return the facts most relevant to a query, whole, ranked by BM25: case studies, roles, research results, postmortems and how this site is run. Each has a title, the full text and a link.",
			InputSchema: object(map[string]any{
				"query": map[string]any{"type": "string", "description": "Keywords or a question, 2 to 300 characters.", "minLength": 2, "maxLength": 300},
				"limit": map[string]any{"type": "integer", "description": "How many facts to return, 1 to 5. Default 3.", "minimum": 1, "maximum": 5},
			}, "query"),
			Call: s.toolSearch,
		},
		{
			Name:        "list_topics",
			Title:       "List what the site covers",
			Description: "List every fact the site holds, by id and title with a link. Call this first to see what can be asked about.",
			InputSchema: noArgs,
			Call:        s.toolTopics,
		},
		{
			Name:        "get_status",
			Title:       "Live status of this site",
			Description: "What is running right now: the commit, region and uptime of the instance that answered, and the site's own SLO as measured from outside (availability, error budget left, and whether releases are open or frozen).",
			InputSchema: noArgs,
			Call:        s.toolStatus,
		},
		{
			Name:        "get_delivery",
			Title:       "How this site ships",
			Description: "DORA metrics for this site over the last 30 days, computed by its pipeline from its own deploy history: deploys, median lead time, change failure rate, and the last rollback drill.",
			InputSchema: noArgs,
			Call:        s.toolDelivery,
		},
	}
	srv := mcp.New("li-zhenxi-portfolio", "Li ZhenXi: portfolio", short(s.cfg.Commit),
		"Read-only tools over the portfolio of Li ZhenXi (SRE, cloud and AI infrastructure). Use list_topics to see what it covers, ask or search_facts "+
			"for anything about the work, and get_status or get_delivery for live numbers about the site itself. Answers come only from the site's own facts.",
		tools)
	srv.AllowedOrigins = s.cfg.AllowedOrigins
	return srv
}

// factURL is where a fact lives on the site: a case study's own page, or its section on the page
// that section is on. Facts carry that link since the home page was split into chapters.
func factURL(base string, f ask.Fact) string {
	if id, ok := strings.CutPrefix(f.ID, "case-"); ok {
		return base + "/work/" + id
	}
	if f.Href != "" {
		return base + f.Href
	}
	return base + "/#" + f.Anchor
}

type factRef struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	URL   string `json:"url"`
	Text  string `json:"text,omitempty"`
}

func stringArg(args json.RawMessage, field string, minLen, maxLen int) (string, error) {
	var m map[string]json.RawMessage
	if err := json.Unmarshal(args, &m); err != nil {
		return "", errors.New("arguments must be a JSON object")
	}
	var v string
	if err := json.Unmarshal(m[field], &v); err != nil {
		return "", fmt.Errorf("%q is required and must be a string", field)
	}
	v = strings.TrimSpace(v)
	if n := utf8.RuneCountInString(v); n < minLen || n > maxLen {
		return "", fmt.Errorf("%q must be %d to %d characters; got %d", field, minLen, maxLen, n)
	}
	return v, nil
}

// limitArg reads the optional "limit": a whole number from 1 to 5. JSON Schema counts 5.0 as an
// integer, so it is accepted; anything else is refused with what was actually sent.
func limitArg(args json.RawMessage, def int) (int, error) {
	var m map[string]json.RawMessage
	if err := json.Unmarshal(args, &m); err != nil {
		return 0, errors.New("arguments must be a JSON object")
	}
	raw, ok := m["limit"]
	if !ok || string(raw) == "null" {
		return def, nil
	}
	var n float64
	if err := json.Unmarshal(raw, &n); err != nil || n != math.Trunc(n) || n < 1 || n > 5 {
		return 0, fmt.Errorf(`"limit" must be a whole number from 1 to 5; got %s`, raw)
	}
	return int(n), nil
}

func (s *Server) toolAsk(ctx context.Context, base string, args json.RawMessage) (mcp.Result, error) {
	q, err := stringArg(args, "question", 3, 300)
	if err != nil {
		return mcp.Result{}, err
	}
	res := s.ask.Answer(ctx, q)
	refs := make([]factRef, len(res.Sources))
	var b strings.Builder
	b.WriteString(res.Answer)
	for i, f := range res.Sources {
		refs[i] = factRef{ID: f.ID, Title: f.Title, URL: factURL(base, f)}
		if i == 0 {
			b.WriteString("\n\nSources:")
		}
		fmt.Fprintf(&b, "\n- %s: %s", f.Title, refs[i].URL)
	}
	return mcp.Result{Text: b.String(), Structured: map[string]any{"answer": res.Answer, "sources": refs}}, nil
}

func (s *Server) toolSearch(_ context.Context, base string, args json.RawMessage) (mcp.Result, error) {
	q, err := stringArg(args, "query", 2, 300)
	if err != nil {
		return mcp.Result{}, err
	}
	limit, err := limitArg(args, 3)
	if err != nil {
		return mcp.Result{}, err
	}
	facts := s.ask.Search(q, limit)
	refs := make([]factRef, len(facts))
	var b strings.Builder
	if len(facts) == 0 {
		b.WriteString("Nothing on the site matches that. list_topics shows what it covers.")
	}
	for i, f := range facts {
		refs[i] = factRef{ID: f.ID, Title: f.Title, URL: factURL(base, f), Text: f.Text}
		fmt.Fprintf(&b, "## %s\n%s\n%s\n\n", f.Title, refs[i].URL, f.Text)
	}
	return mcp.Result{Text: strings.TrimSpace(b.String()), Structured: map[string]any{"facts": refs}}, nil
}

func (s *Server) toolTopics(_ context.Context, base string, _ json.RawMessage) (mcp.Result, error) {
	facts := s.ask.Facts()
	refs := make([]factRef, len(facts))
	var b strings.Builder
	for i, f := range facts {
		refs[i] = factRef{ID: f.ID, Title: f.Title, URL: factURL(base, f)}
		fmt.Fprintf(&b, "- %s (%s)\n", f.Title, f.ID)
	}
	return mcp.Result{Text: strings.TrimSpace(b.String()), Structured: map[string]any{"topics": refs}}, nil
}

func (s *Server) toolStatus(ctx context.Context, base string, _ json.RawMessage) (mcp.Result, error) {
	rep := s.slo.Report(ctx)
	local := s.cfg.Region == "local"
	out := map[string]any{
		"commit": short(s.cfg.Commit), "region": s.cfg.Region, "revision": s.cfg.Revision, "local": local,
		"instance_started": s.started.UTC().Format(time.RFC3339), "instance_uptime_seconds": int(time.Since(s.started).Seconds()),
		"status_page": base + "/status",
	}
	var b strings.Builder
	up := time.Since(s.started).Round(time.Second)
	if local {
		fmt.Fprintf(&b, "Commit %s is running on a local copy, not the live site; this process has been up %s.", short(s.cfg.Commit), up)
	} else {
		fmt.Fprintf(&b, "Commit %s is live on Cloud Run in %s; this instance has been up %s.", short(s.cfg.Commit), s.cfg.Region, up)
	}
	text, data := sloSummary(rep)
	out["slo"] = data
	b.WriteString(text)
	fmt.Fprintf(&b, " Status page: %s/status", base)
	return mcp.Result{Text: b.String(), Structured: out}, nil
}

// sloSummary is the SLO part of get_status: one or two sentences, and the same as data. Numbers
// kept from before Cloud Monitoring stopped answering are labelled with the time they were read.
func sloSummary(rep slo.Report) (string, map[string]any) {
	if !rep.Available {
		return " No availability figures right now: " + rep.Reason, map[string]any{"available": false, "reason": rep.Reason}
	}
	var b strings.Builder
	sloOut := map[string]any{
		"objective": slo.Target, "window_days": slo.WindowDays, "availability": rep.Availability,
		"error_budget_remaining": rep.BudgetRemaining, "downtime_minutes": rep.DowntimeMinutes, "releases": rep.Releases,
		"stale": rep.Stale, "updated": rep.Updated.UTC().Format(time.RFC3339),
	}
	if rep.Since != nil {
		sloOut["measured_since"] = rep.Since.Format(time.RFC3339)
	}
	// The window is 30 days; until it has filled, say when measuring began.
	measured := ""
	if since, ok := strings.CutPrefix(rep.UptimeLabel(), "uptime since "); ok {
		measured = ", measured since " + since
	}
	fmt.Fprintf(&b, " Availability %s against a %.1f%% objective over %d days%s; %.1f%% of the error budget is left, and releases are %s.",
		slo.Uptime(rep.Availability), slo.Target*100, slo.WindowDays, measured, slo.FloorPct(max(rep.BudgetRemaining, 0), 1), rep.Releases)
	// A reading kept from before Cloud Monitoring stopped answering is old news; say how old.
	if rep.Stale {
		fmt.Fprintf(&b, " These are the last good numbers, read %s; Cloud Monitoring is not answering right now.", rep.Updated.UTC().Format("2 Jan 15:04 UTC"))
	}
	return b.String(), sloOut
}

func (s *Server) toolDelivery(_ context.Context, base string, _ json.RawMessage) (mcp.Result, error) {
	d := s.delivery
	if d == nil {
		return mcp.Result{}, errors.New("delivery metrics are not part of this build; see the changelog at " + base + "/changelog")
	}
	out := map[string]any{"window_days": d.WindowDays, "deploys": d.Deploys, "changelog": base + "/changelog"}
	var b strings.Builder
	fmt.Fprintf(&b, "%d deploys to production in the last %d days.", d.Deploys, d.WindowDays)
	if m := d.LeadTimeMinutes.Median; m != nil {
		out["lead_time_minutes_median"] = *m
		fmt.Fprintf(&b, " Median lead time from commit to live: %.1f minutes.", *m)
	}
	if r := d.ChangeFailureRate; r != nil {
		out["change_failure_rate"] = *r
		// Half up, like the cards and the site (Go's %.0f alone rounds 12.5 to even).
		fmt.Fprintf(&b, " Change failure rate: %.0f%%.", math.Round(*r*100))
	}
	if dr := d.Safeguards.LastDrill; dr != nil {
		drill := map[string]any{"ended": dr.Ended.UTC().Format(time.RFC3339)}
		fmt.Fprintf(&b, " Last rollback drill: %s", dr.Ended.UTC().Format("2 Jan 2006"))
		if dr.RestoreSeconds != nil {
			drill["restore_seconds"] = *dr.RestoreSeconds
			fmt.Fprintf(&b, ", traffic back on the previous revision %d s after the switch", *dr.RestoreSeconds)
		}
		b.WriteString(".")
		out["last_rollback_drill"] = drill
	}
	// The numbers name the commit they were computed for; they describe this build only when that
	// is the commit running (a local or test build carries the committed snapshot).
	if h := d.Head; h != nil && h.SHA == short(s.cfg.Commit) {
		out["built_from"] = map[string]any{"commit": h.SHA, "title": h.Title}
		b.WriteString(" Computed by the pipeline when it built this image.")
	} else if h != nil {
		out["computed_for"] = h.SHA
		fmt.Fprintf(&b, " Computed for commit %s, not the one running, so they may be out of date.", h.SHA)
	}
	fmt.Fprintf(&b, " Every release: %s/changelog", base)
	return mcp.Result{Text: b.String(), Structured: out}, nil
}
