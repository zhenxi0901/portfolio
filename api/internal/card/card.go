// Package card draws the live card the GitHub profile embeds (/api/card.svg): this server's own
// commit and region, its SLO as the uptime checks see it, and the delivery numbers the pipeline
// baked into the image. The profile reads from the production service rather than from a bot.
package card

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html"
	"math"
	"os"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/zhenxi0901/portfolio/api/internal/slo"
)

// Delivery is the part of /delivery.json (web/scripts/delivery-stats.mjs) the card shows.
type Delivery struct {
	WindowDays      int `json:"windowDays"`
	Deploys         int `json:"deploys"`
	LeadTimeMinutes struct {
		Median *float64 `json:"median"`
	} `json:"leadTimeMinutes"`
	ChangeFailureRate *float64 `json:"changeFailureRate"`
	Safeguards        struct {
		LastDrill *Drill `json:"lastDrill"`
	} `json:"safeguards"`
	// The commit the image was built from.
	Head *Head `json:"head"`
}

type Drill struct {
	Ended          time.Time `json:"ended"`
	RestoreSeconds *int      `json:"restoreSeconds"` // null if the run's steps could not be timed
}

type Head struct {
	SHA       string    `json:"sha"`
	Title     string    `json:"title"`
	Committed time.Time `json:"committed"`
}

// LoadDelivery reads the delivery numbers from the static export.
func LoadDelivery(path string) (*Delivery, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var d Delivery
	if err := json.Unmarshal(b, &d); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return &d, nil
}

// Data is everything one card shows.
type Data struct {
	Commit, Region  string
	SLOAvailable    bool
	Availability    float64
	BudgetRemaining float64
	SLOUpdated      time.Time // when the SLO numbers were read from Cloud Monitoring
	SLOStale        bool      // the latest read failed; these are the last good numbers
	SLOReason       string    // why there are no SLO numbers, when there are none
	UptimeLabel     string    // "uptime, 30 days", or "uptime since 19 Oct" while the window fills
	Releases        string    // "open", "frozen" or "unknown"
	Delivery        *Delivery
	Now             time.Time
}

type palette struct{ bg, border, text, muted, accent, good, warn, bad string }

var (
	dark  = palette{"#0d1117", "#30363d", "#e6edf3", "#8b949e", "#c2f75c", "#3fb950", "#d29922", "#f85149"}
	light = palette{"#ffffff", "#d0d7de", "#1f2328", "#59636e", "#3f6212", "#1a7f37", "#9a6700", "#cf222e"}
)

const (
	sans = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`
	mono = `ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`
	W    = 800
	H    = 214
)

// SVG renders the card. Every piece of text is escaped: commit titles come from git.
func SVG(d Data, darkTheme bool) []byte {
	p := light
	if darkTheme {
		p = dark
	}
	var b bytes.Buffer
	text := func(x, y int, size int, weight, fill, family, anchor, s string) {
		fmt.Fprintf(&b, `<text x="%d" y="%d" font-size="%d" font-weight="%s" fill="%s" font-family="%s" text-anchor="%s">%s</text>`+"\n",
			x, y, size, weight, fill, family, anchor, html.EscapeString(s))
	}

	up := d.SLOAvailable
	statusFill := p.good
	if d.Releases == "frozen" {
		statusFill = p.warn
	}

	fmt.Fprintf(&b, `<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d" role="img" aria-labelledby="t d">`+"\n", W, H, W, H)
	title := "Li ZhenXi's portfolio, live"
	if d.Region == "local" {
		title = "Li ZhenXi's portfolio, a local copy"
	}
	fmt.Fprintf(&b, "<title id=\"t\">%s</title>\n<desc id=\"d\">%s</desc>\n", html.EscapeString(title), html.EscapeString(summary(d)))
	fmt.Fprintf(&b, `<rect x="0.5" y="0.5" width="%d" height="%d" rx="14" fill="%s" stroke="%s"/>`+"\n", W-1, H-1, p.bg, p.border)

	// Header: who, where, and the state the server reports about itself.
	fmt.Fprintf(&b, `<circle cx="32" cy="35" r="6" fill="%s"/>`+"\n", statusFill)
	text(46, 41, 17, "600", p.text, sans, "start", "Li ZhenXi · portfolio")
	where := "live on Cloud Run · " + d.Region
	if d.Region == "local" {
		where = "a local copy, not the live site"
	}
	text(W-24, 41, 13, "400", p.muted, mono, "end", where)

	// What is running: the commit, and its title when the pipeline's record matches it.
	line := "commit " + d.Commit
	if h := d.Delivery.head(); h != nil && h.SHA == d.Commit {
		line += " · " + truncate(h.Title, 52) + " · committed " + ago(d.Now, h.Committed)
	}
	text(24, 72, 13, "400", p.muted, mono, "start", line)

	// Five numbers.
	type metric struct{ value, label, fill string }
	ms := []metric{
		{"measuring", "uptime, 30 days", p.muted},
		{"n/a", "error budget left", p.muted},
		{"n/a", "deploys, 30 days", p.text},
		{"n/a", "lead time, median", p.text},
		{"n/a", "change failure rate", p.text},
	}
	if up {
		label := d.UptimeLabel
		if label == "" {
			label = "uptime, 30 days"
		}
		ms[0] = metric{fmt.Sprintf("%.2f%%", slo.FloorPct(d.Availability, 2)), label, tone(p, d.Availability >= 0.999, d.Availability >= 0.99)}
		left := d.BudgetRemaining
		// One decimal, rounded down, as on the site: never "100%" with some of it spent.
		ms[1] = metric{fmt.Sprintf("%.1f%%", slo.FloorPct(max(left, 0), 1)), "error budget left", tone(p, left >= 0.5, left > 0)}
	}
	if dl := d.Delivery; dl != nil {
		ms[2].value = fmt.Sprint(dl.Deploys)
		if dl.WindowDays > 0 {
			ms[2].label = fmt.Sprintf("deploys, %d days", dl.WindowDays)
		}
		if m := dl.LeadTimeMinutes.Median; m != nil {
			ms[3].value = minutes(*m)
		}
		if r := dl.ChangeFailureRate; r != nil {
			// Half up, as the site's Math.round does (Go's %.0f would round 12.5 to even).
			ms[4].value = fmt.Sprintf("%.0f%%", math.Round(*r*100))
		}
	}
	for i, m := range ms {
		x := 24 + i*152
		text(x, 128, 28, "600", m.fill, sans, "start", m.value)
		text(x, 151, 12, "400", p.muted, sans, "start", m.label)
	}

	// Footer: the release policy and the last rollback drill.
	foot := "releases " + map[string]string{"open": "open", "frozen": "frozen: reliability fixes only"}[d.Releases]
	if d.Releases != "open" && d.Releases != "frozen" {
		foot = "release policy: not measured yet"
	}
	if dl := d.Delivery; dl != nil && dl.Safeguards.LastDrill != nil {
		dr := dl.Safeguards.LastDrill
		if dr.RestoreSeconds != nil {
			foot += fmt.Sprintf(" · last rollback drill: traffic back in %d s, %s", *dr.RestoreSeconds, dr.Ended.UTC().Format("2 Jan"))
		} else {
			foot += " · last rollback drill: " + dr.Ended.UTC().Format("2 Jan")
		}
	}
	fmt.Fprintf(&b, `<line x1="24" y1="174" x2="%d" y2="174" stroke="%s"/>`+"\n", W-24, p.border)
	text(24, 197, 12, "400", p.muted, sans, "start", foot)
	// The time the uptime numbers were read, which is older than now when Monitoring is unreachable.
	asOf := "as of " + d.Now.UTC().Format("15:04 UTC")
	if up && !d.SLOUpdated.IsZero() {
		asOf = "as of " + d.SLOUpdated.UTC().Format("15:04 UTC")
		if d.SLOStale {
			asOf = "last good reading " + d.SLOUpdated.UTC().Format("2 Jan 15:04 UTC")
		}
	}
	text(W-24, 197, 12, "400", p.accent, mono, "end", asOf)
	b.WriteString("</svg>\n")
	return b.Bytes()
}

func (d *Delivery) head() *Head {
	if d == nil {
		return nil
	}
	return d.Head
}

func summary(d Data) string {
	s := fmt.Sprintf("Commit %s live on Cloud Run in %s.", d.Commit, d.Region)
	if d.Region == "local" {
		s = fmt.Sprintf("Commit %s, on a local copy, not the live site.", d.Commit)
	}
	if d.SLOAvailable {
		// The same window the card's label names: "uptime since 19 Oct" until 30 days are measured.
		label := d.UptimeLabel
		if label == "" {
			label = "uptime, 30 days"
		}
		s += fmt.Sprintf(" %s%s: %.2f%%, error budget left %.1f%%.", strings.ToUpper(label[:1]), label[1:], slo.FloorPct(d.Availability, 2), slo.FloorPct(max(d.BudgetRemaining, 0), 1))
	}
	if d.Delivery != nil {
		s += fmt.Sprintf(" %d deploys in %d days.", d.Delivery.Deploys, d.Delivery.WindowDays)
	}
	return s
}

func tone(p palette, good, ok bool) string {
	switch {
	case good:
		return p.good
	case ok:
		return p.warn
	}
	return p.bad
}

func minutes(m float64) string {
	switch {
	case m < 60:
		return fmt.Sprintf("%.1f min", m)
	case m < 1440:
		return fmt.Sprintf("%.1f h", m/60)
	}
	return fmt.Sprintf("%.1f days", m/1440)
}

func ago(now, t time.Time) string {
	d := now.Sub(t)
	switch {
	case d < time.Minute:
		return "just now"
	case d < time.Hour:
		return fmt.Sprintf("%d min ago", int(d.Minutes()))
	case d < 48*time.Hour:
		return fmt.Sprintf("%d h ago", int(d.Hours()))
	}
	return fmt.Sprintf("%d days ago", int(d.Hours()/24))
}

func truncate(s string, n int) string {
	s = strings.TrimSpace(s)
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	r := []rune(s)
	return strings.TrimSpace(string(r[:n-1])) + "…"
}

// Terminal is the site's answer to curl: the same live numbers as the card, as text. ANSI colour
// only; no cursor movement, so it reads the same piped into a file.
func Terminal(d Data, base string) []byte {
	const (
		bold, dim, red, green, yellow, lime, reset = "\x1b[1m", "\x1b[2m", "\x1b[31m", "\x1b[32m", "\x1b[33m", "\x1b[38;5;155m", "\x1b[0m"
	)
	// The same thresholds as the SVG card's tone(): good, worth a look, or bad.
	shade := func(good, ok bool) string {
		switch {
		case good:
			return green
		case ok:
			return yellow
		}
		return red
	}
	var b bytes.Buffer
	row := func(label, value string) { fmt.Fprintf(&b, "    %s%-10s%s %s\n", dim, label, reset, value) }
	local := d.Region == "local"

	fmt.Fprintf(&b, "\n  %s%sLi ZhenXi%s  SRE, cloud and AI infrastructure\n", bold, lime, reset)
	fmt.Fprintf(&b, "  %sOpen to 2027 roles. This page is a live service; you asked from a terminal, so here it is as text.%s\n\n", dim, reset)

	if local {
		row("running", fmt.Sprintf("commit %s, on a local copy", d.Commit))
	} else {
		row("running", fmt.Sprintf("commit %s on Cloud Run, %s", d.Commit, d.Region))
	}
	switch {
	case d.SLOAvailable:
		label := d.UptimeLabel
		if label == "" {
			label = "uptime, 30 days"
		}
		span := strings.TrimLeft(strings.TrimPrefix(label, "uptime"), ", ") // "30 days" or "since 19 Oct"
		if !strings.HasPrefix(span, "since") {
			span = "over " + span
		}
		left := d.BudgetRemaining
		row("uptime", fmt.Sprintf("%s%.2f%%%s %s, measured from outside", shade(d.Availability >= 0.999, d.Availability >= 0.99), slo.FloorPct(d.Availability, 2), reset, span))
		row("budget", fmt.Sprintf("%s%.1f%%%s of the error budget left, releases %s", shade(left >= 0.5, left > 0), slo.FloorPct(max(left, 0), 1), reset, d.Releases))
		// Numbers kept from before Cloud Monitoring stopped answering are old news; say how old.
		if d.SLOStale && !d.SLOUpdated.IsZero() {
			row("reading", fmt.Sprintf("%slast good reading %s%s; Cloud Monitoring is not answering", yellow, d.SLOUpdated.UTC().Format("2 Jan 15:04 UTC"), reset))
		}
	case local:
		row("uptime", "not measured on a local copy")
	default:
		reason := d.SLOReason
		if reason == "" {
			reason = "Measurements are unavailable right now."
		}
		row("uptime", reason)
	}
	if dl := d.Delivery; dl != nil {
		line := fmt.Sprintf("%d deploys in %d days", dl.Deploys, dl.WindowDays)
		if m := dl.LeadTimeMinutes.Median; m != nil {
			line += ", lead time " + minutes(*m)
		}
		if r := dl.ChangeFailureRate; r != nil {
			line += fmt.Sprintf(", change failure rate %.0f%%", math.Round(*r*100))
		}
		row("shipping", line)
	}

	fmt.Fprintf(&b, "\n  %sMore from here:%s\n", bold, reset)
	for _, c := range [][2]string{
		{"curl -s " + base + "/api/slo", "the SLO as JSON"},
		{"curl -s " + base + "/llms.txt", "the whole site as Markdown, for agents"},
		{"POST    " + base + "/mcp", "an MCP server: point your agent at it"},
	} {
		fmt.Fprintf(&b, "    %s  %s%s%s\n", c[0], dim, c[1], reset)
	}
	fmt.Fprintf(&b, "\n  In a browser: %s%s%s\n\n", lime, base, reset)
	return b.Bytes()
}
