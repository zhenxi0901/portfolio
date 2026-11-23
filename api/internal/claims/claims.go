// Package claims is what became of the site's claims when they were last tested: /claims in the repository has
// a test for each one that can be checked from outside, a GitHub workflow runs them after every deploy and on a
// schedule, and it records the results on the commit it tested, as a check run named "claims". The server reads
// that record back, so the results it shows are GitHub's and not its own.
//
// GitHub is read without a token, like internal/activity: a check run on a public repository is public.
package claims

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"strings"
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
	// The most of a response body this reads. A check run's text is at most 64 KB, and there are a few.
	maxBody = 1 << 20
	// More than this site will ever claim; a longer list is not one of its own.
	maxClaims = 100
	maxSaw    = 300
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

type checkRuns struct {
	CheckRuns []struct {
		Name        string    `json:"name"`
		CompletedAt time.Time `json:"completed_at"`
		DetailsURL  string    `json:"details_url"`
		App         struct {
			Slug string `json:"slug"`
		} `json:"app"`
		Output struct {
			Text string `json:"text"`
		} `json:"output"`
	} `json:"check_runs"`
}

// read finds the newest "claims" check on this release. None yet is an answer, not a failure.
func (s *Service) read(ctx context.Context, now time.Time) (Report, error) {
	var runs checkRuns
	path := "/repos/" + s.cfg.Repo + "/commits/" + s.cfg.Commit + "/check-runs?" + url.Values{"check_name": {"claims"}, "status": {"completed"}, "per_page": {"20"}}.Encode()
	if err := s.get(ctx, path, &runs); err != nil {
		return Report{}, err
	}
	best := -1
	for i, r := range runs.CheckRuns {
		// The workflow's own checks only (any app may add one called "claims"), and only those with results in
		// them: GitHub makes a check for every job too, and a job of that name would have nothing to say.
		if r.Name != "claims" || r.App.Slug != "github-actions" || r.Output.Text == "" {
			continue
		}
		if best < 0 || r.CompletedAt.After(runs.CheckRuns[best].CompletedAt) {
			best = i
		}
	}
	if best < 0 {
		r := unavailable("This release has not been tested yet.")
		r.Updated = now.UTC()
		return r, nil
	}
	run := runs.CheckRuns[best]
	r, err := parse(run.Output.Text)
	if err != nil {
		return Report{}, err
	}
	if onGitHub(run.DetailsURL) {
		r.Run = run.DetailsURL
	}
	r.Updated = now.UTC()
	return r, nil
}

var (
	fullCommit = regexp.MustCompile(`^[0-9a-f]{40}$`)
	anyCommit  = regexp.MustCompile(`^[0-9a-f]{7,40}$`)
	claimID    = regexp.MustCompile(`^[a-z0-9-]{1,40}$`)
)

// parse reads the results out of a check run's text, and refuses anything that is not what run.mjs writes: the
// page shows them without anyone reading them first.
func parse(text string) (Report, error) {
	var in struct {
		Commit      string    `json:"commit"`
		Tested      time.Time `json:"tested"`
		Trustworthy bool      `json:"trustworthy"`
		Claims      []Result  `json:"claims"`
		FalseClaim  *Result   `json:"false_claim"`
	}
	if err := json.Unmarshal([]byte(text), &in); err != nil {
		return Report{}, fmt.Errorf("the check's results do not parse: %w", err)
	}
	if !anyCommit.MatchString(in.Commit) || in.Tested.IsZero() || in.FalseClaim == nil || len(in.Claims) == 0 || len(in.Claims) > maxClaims {
		return Report{}, errors.New("the check's results are not in the expected form")
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
