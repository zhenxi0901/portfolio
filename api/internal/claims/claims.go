// Package claims is what became of the site's claims when they were last tested: /claims in the repository has
// a test for each one that can be checked from outside, and a GitHub workflow runs them after every deploy and on
// a schedule. The results are annotations on the workflow's job, so they are part of GitHub's own record of the
// run. The server reads that record back, and the results it shows are GitHub's and not its own.
//
// GitHub is read without a token, like internal/activity: a workflow's runs in a public repository are public.
package claims

import (
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"strings"
	"sync/atomic"
	"time"
	"unicode/utf8"

	"github.com/zhenxi0901/portfolio/api/internal/fresh"
)

// A claim's verdict.
const (
	Holds   = "holds"
	Fails   = "fails"
	Unknown = "unknown" // the record it is checked against could not be read
)

// Result is one claim's.
type Result struct {
	ID      string `json:"id"`
	Verdict string `json:"verdict"`
	Saw     string `json:"saw"` // what the test found, in a sentence
}

// Report is the last run's results as /api/claims answers them.
type Report struct {
	Available bool   `json:"available"`
	Reason    string `json:"reason,omitempty"`
	// The release that was tested, and when.
	Commit string    `json:"commit,omitempty"`
	Tested time.Time `json:"tested,omitzero"`
	// The workflow run, with every test's answer in it.
	Run     string `json:"run,omitempty"`
	Total   int    `json:"total"`
	Holding int    `json:"holding"`
	Failing int    `json:"failing"`
	Unknown int    `json:"unknown"`
	// Whether the claim that is false on purpose failed. If it passed, the tests cannot tell true from false,
	// and nothing else here counts.
	Trustworthy bool      `json:"trustworthy"`
	FalseClaim  *Result   `json:"false_claim,omitempty"`
	Claims      []Result  `json:"claims"`
	Updated     time.Time `json:"updated,omitzero"` // when GitHub was read
	// Set when the latest read failed and this is the last good report.
	Stale bool `json:"stale,omitempty"`
}

const (
	// See fresh.Reading. A release's first results come a few minutes after it, so while there are none the
	// next read is soon.
	due     = 30 * time.Minute
	limit   = 2 * time.Hour
	retry   = 3 * time.Minute
	readFor = 8 * time.Second
	// The most of a response body this reads: a page of runs is the largest, at a few hundred kilobytes.
	maxBody = 1 << 20
	// More than this site will ever claim; a longer list is not one of its own.
	maxClaims = 100
	maxSaw    = 300
	// The workflow, and the job in it that the results are on.
	workflow = "claims.yml"
	job      = "claims"
)

// Config says whose claims, on which release.
type Config struct {
	Repo   string // owner/name
	Commit string // the running release's full commit id
}

// Service serves the report.
type Service struct {
	cfg     Config
	base    string // the GitHub API root; tests point it at their own server
	client  *http.Client
	live    bool
	now     func() time.Time
	reading *fresh.Reading[Report]
	// The newest run, once it is known to have tested another release: what is in it need not be read again.
	other atomic.Int64
}

// New reads the results of cfg's release from GitHub when live is set, and has none to give otherwise.
func New(cfg Config, live bool, log *slog.Logger) *Service {
	s := &Service{
		cfg: cfg, base: "https://api.github.com", client: &http.Client{Timeout: readFor},
		live: live && fullCommit.MatchString(cfg.Commit), now: time.Now,
	}
	s.reading = &fresh.Reading[Report]{
		Due: due, Limit: limit, Retry: retry, For: readFor,
		Read:  s.read,
		Again: func(r Report) bool { return !r.Available },
		Now:   func() time.Time { return s.now() }, Log: log, Failed: "claims: could not read the last run",
	}
	return s
}

// Report is the last reading of the results.
func (s *Service) Report(ctx context.Context) Report {
	if !s.live {
		return unavailable("Tested on the live site only.")
	}
	r, ok, failed := s.reading.Get(ctx)
	switch {
	case !ok && failed:
		return unavailable("The results are unavailable right now.")
	case !ok:
		return unavailable("Still reading the results.")
	}
	r.Stale = failed && r.Available
	return r
}

// Warm reads GitHub again if that is due, for no longer than limit, and reports whether it did.
func (s *Service) Warm(ctx context.Context, limit time.Duration) bool {
	return s.live && s.reading.Warm(ctx, limit)
}

func unavailable(reason string) Report { return Report{Reason: reason, Claims: []Result{}} }

type workflowRun struct {
	ID         int64  `json:"id"`
	Conclusion string `json:"conclusion"`
	URL        string `json:"html_url"`
}

type annotation struct {
	Title   string `json:"title"`
	Message string `json:"message"`
}

// read finds the newest run of the tests and what it left. A run of another release is an answer too: this one has
// not been tested yet.
func (s *Service) read(ctx context.Context, now time.Time) (Report, error) {
	notYet := unavailable("This release has not been tested yet.")
	notYet.Updated = now.UTC()

	var runs struct {
		Runs []workflowRun `json:"workflow_runs"`
	}
	query := url.Values{"branch": {"main"}, "status": {"completed"}, "per_page": {"10"}}
	if err := s.get(ctx, "/repos/"+s.cfg.Repo+"/actions/workflows/"+workflow+"/runs?"+query.Encode(), &runs); err != nil {
		return Report{}, err
	}
	// Newest first. A cancelled run was overtaken by a newer one, and a skipped one had nothing to test.
	i := slices.IndexFunc(runs.Runs, func(r workflowRun) bool { return r.Conclusion == "success" || r.Conclusion == "failure" })
	if i < 0 || runs.Runs[i].ID == s.other.Load() {
		return notYet, nil
	}
	run := runs.Runs[i]

	var jobs struct {
		Jobs []struct {
			ID   int64  `json:"id"` // also its check's
			Name string `json:"name"`
		} `json:"jobs"`
	}
	if err := s.get(ctx, fmt.Sprintf("/repos/%s/actions/runs/%d/jobs", s.cfg.Repo, run.ID), &jobs); err != nil {
		return Report{}, err
	}
	var notes []annotation
	for _, j := range jobs.Jobs {
		if j.Name != job {
			continue
		}
		if err := s.get(ctx, fmt.Sprintf("/repos/%s/check-runs/%d/annotations?per_page=50", s.cfg.Repo, j.ID), &notes); err != nil {
			return Report{}, err
		}
	}
	r, err := parse(notes)
	if err != nil {
		return Report{}, err
	}
	if !strings.HasPrefix(s.cfg.Commit, r.Commit) {
		s.other.Store(run.ID)
		return notYet, nil
	}
	if onGitHub(run.URL) {
		r.Run = run.URL
	}
	r.Updated = now.UTC()
	return r, nil
}

var (
	fullCommit = regexp.MustCompile(`^[0-9a-f]{40}$`)
	anyCommit  = regexp.MustCompile(`^[0-9a-f]{7,40}$`)
	claimID    = regexp.MustCompile(`^[a-z0-9-]{1,40}$`)
	// The titles run.mjs gives its annotations. Any other is the runner's own: a step that failed, a deprecation.
	partTitle = regexp.MustCompile(`^claims [0-9]+ of [0-9]+$`)
)

// part is one annotation's share of the results.
type part struct {
	Part        int       `json:"part"`
	Of          int       `json:"of"`
	Commit      string    `json:"commit"`
	Tested      time.Time `json:"tested"`
	Trustworthy bool      `json:"trustworthy"`
	Claims      []Result  `json:"claims"`
	FalseClaim  *Result   `json:"false_claim"`
}

// parse puts the results back together, and refuses anything that is not what run.mjs writes: the page shows them
// without anyone reading them first.
func parse(notes []annotation) (Report, error) {
	var parts []part
	for _, n := range notes {
		if !partTitle.MatchString(n.Title) {
			continue
		}
		var p part
		if err := json.Unmarshal([]byte(n.Message), &p); err != nil {
			return Report{}, fmt.Errorf("the run's results do not parse: %w", err)
		}
		parts = append(parts, p)
	}
	if len(parts) == 0 {
		return Report{}, errors.New("the run left no results")
	}
	slices.SortFunc(parts, func(a, b part) int { return cmp.Compare(a.Part, b.Part) })
	in := parts[0]
	for i, p := range parts {
		if p.Part != i+1 || p.Of != len(parts) || p.Commit != in.Commit || !p.Tested.Equal(in.Tested) {
			return Report{}, errors.New("some of the run's results are missing")
		}
		if i > 0 {
			in.Claims = append(in.Claims, p.Claims...)
			in.Trustworthy = in.Trustworthy && p.Trustworthy
		}
	}
	if !anyCommit.MatchString(in.Commit) || in.Tested.IsZero() || in.FalseClaim == nil || len(in.Claims) == 0 || len(in.Claims) > maxClaims {
		return Report{}, errors.New("the run's results are not in the expected form")
	}
	r := Report{Available: true, Commit: in.Commit, Tested: in.Tested.UTC(), Total: len(in.Claims), Claims: in.Claims, FalseClaim: in.FalseClaim}
	for i := range r.Claims {
		if err := tidy(&r.Claims[i]); err != nil {
			return Report{}, err
		}
		switch r.Claims[i].Verdict {
		case Holds:
			r.Holding++
		case Fails:
			r.Failing++
		case Unknown:
			r.Unknown++
		}
	}
	if err := tidy(r.FalseClaim); err != nil {
		return Report{}, err
	}
	// Said by the run, and true of what it says.
	r.Trustworthy = in.Trustworthy && r.FalseClaim.Verdict == Fails
	return r, nil
}

// tidy checks one result and cuts its sentence to a length the page has room for.
func tidy(r *Result) error {
	if !claimID.MatchString(r.ID) || r.Verdict != Holds && r.Verdict != Fails && r.Verdict != Unknown {
		return fmt.Errorf("a result is not in the expected form: %.40q %.20q", r.ID, r.Verdict)
	}
	r.Saw = strings.Join(strings.Fields(strings.ToValidUTF8(r.Saw, "")), " ")
	if utf8.RuneCountInString(r.Saw) > maxSaw {
		r.Saw = string([]rune(r.Saw)[:maxSaw-1]) + "…"
	}
	return nil
}

func (s *Service) get(ctx context.Context, path string, v any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.base+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "portfolio-claims") // GitHub refuses requests without one
	res, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("GitHub %s: HTTP %d", strings.SplitN(path, "?", 2)[0], res.StatusCode)
	}
	return json.NewDecoder(io.LimitReader(res.Body, maxBody)).Decode(v)
}

// onGitHub is true for an https link to github.com: the page renders it as one.
func onGitHub(link string) bool {
	u, err := url.Parse(link)
	return err == nil && u.Scheme == "https" && u.Host == "github.com"
}
