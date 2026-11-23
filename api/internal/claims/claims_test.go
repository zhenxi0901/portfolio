package claims

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

const commit = "4a87353b381a6eba3daf3d532504b07d7f2211b0"

var (
	quiet  = slog.New(slog.DiscardHandler)
	tested = time.Date(2026, 11, 23, 7, 0, 0, 0, time.UTC)
)

// What the workflow leaves, in two parts: one claim of each verdict, and the false one failing.
const (
	one = `{"part":1,"of":2,"commit":"4a87353","tested":"2026-11-23T07:00:00.123Z","trustworthy":true,
		"claims":[{"id":"commit","verdict":"holds","saw":"4a87353 is running."},{"id":"releases","verdict":"fails","saw":"55 of 56"}],
		"false_claim":{"id":"php","verdict":"fails","saw":"The server says it runs go1.27.3."}}`
	two = `{"part":2,"of":2,"commit":"4a87353","tested":"2026-11-23T07:00:00.123Z","trustworthy":true,
		"claims":[{"id":"iccv","verdict":"unknown","saw":"Could not be checked."}],
		"false_claim":{"id":"php","verdict":"fails","saw":"The server says it runs go1.27.3."}}`
)

// left is the job's annotations: the results, among what the runner adds itself.
func left(parts ...string) []annotation {
	notes := []annotation{{Title: "", Message: "Process completed with exit code 1."}}
	for i, p := range parts {
		notes = append(notes, annotation{Title: fmt.Sprintf("claims %d of %d", i+1, len(parts)), Message: p})
	}
	return append(notes, annotation{Title: "Result", Message: "1 of 3 claims hold"})
}

// github is a GitHub with one repository in it.
type github struct {
	code  int
	runs  []workflowRun
	notes map[int64][]annotation // by run
	calls atomic.Int32
}

func (g *github) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	g.calls.Add(1)
	if g.code != 0 {
		w.WriteHeader(g.code)
		return
	}
	answer := func(v any) { _ = json.NewEncoder(w).Encode(v) }
	var run int64
	switch path := r.URL.Path; {
	case path == "/repos/o/r/actions/workflows/claims.yml/runs" && r.URL.Query().Get("branch") == "main" && r.URL.Query().Get("status") == "completed":
		answer(map[string]any{"workflow_runs": g.runs})
	case scan(path, "/repos/o/r/actions/runs/%d/jobs", &run):
		answer(map[string]any{"jobs": []map[string]any{{"id": run * 100, "name": "claims"}, {"id": 7, "name": "something else"}}})
	case scan(path, "/repos/o/r/check-runs/%d/annotations", &run):
		answer(g.notes[run/100])
	default:
		w.WriteHeader(http.StatusNotFound)
	}
}

func scan(path, format string, id *int64) bool {
	_, err := fmt.Sscanf(path, format, id)
	return err == nil && path == fmt.Sprintf(format, *id)
}

func run(id int64, conclusion string) workflowRun {
	return workflowRun{ID: id, Conclusion: conclusion, URL: fmt.Sprintf("https://github.com/o/r/actions/runs/%d", id)}
}

func newService(t *testing.T, g *github, clock *time.Time) *Service {
	t.Helper()
	ts := httptest.NewServer(g)
	t.Cleanup(ts.Close)
	s := New(Config{Repo: "o/r", Commit: commit}, true, quiet)
	s.base = ts.URL
	s.now = func() time.Time { return *clock }
	return s
}

func TestReportsTheLastRun(t *testing.T) {
	g := &github{
		// Newest first. One that was overtaken and one with nothing to test left nothing; the one before last is old.
		runs: []workflowRun{run(5, "cancelled"), run(4, "skipped"), run(3, "failure"), run(2, "success")},
		notes: map[int64][]annotation{
			3: left(one, two),
			2: left(strings.NewReplacer(`"of":2`, `"of":1`, `"fails"`, `"holds"`).Replace(one)),
		},
	}
	clock := tested.Add(time.Hour)
	r := newService(t, g, &clock).Report(context.Background())
	if !r.Available || r.Stale || r.Total != 3 || r.Holding != 1 || r.Failing != 1 || r.Unknown != 1 || !r.Trustworthy {
		t.Fatalf("report: %+v", r)
	}
	if r.Commit != "4a87353" || !r.Tested.Equal(tested.Add(123*time.Millisecond)) || r.Run != "https://github.com/o/r/actions/runs/3" || r.FalseClaim.ID != "php" {
		t.Errorf("report: %+v", r)
	}
	if ids := fmt.Sprint(r.Claims[0].ID, r.Claims[1].ID, r.Claims[2].ID); ids != "commitreleasesiccv" {
		t.Errorf("claims out of order: %s", ids)
	}
}

// A release's results come a few minutes after it. Until then the newest run is the last release's, which is an
// answer, and the next read is soon; what that run left is not read again.
func TestAReleaseNotTestedYet(t *testing.T) {
	old := strings.NewReplacer(`"commit":"4a87353"`, `"commit":"0000000"`, `"of":2`, `"of":1`).Replace(one)
	g := &github{runs: []workflowRun{run(1, "success")}, notes: map[int64][]annotation{1: left(old), 2: left(one, two)}}
	clock := tested
	s := newService(t, g, &clock)
	if r := s.Report(context.Background()); r.Available || r.Reason != "This release has not been tested yet." || r.Claims == nil {
		t.Fatalf("before its first run: %+v", r)
	}
	clock = clock.Add(time.Minute)
	if s.Warm(context.Background(), time.Second) {
		t.Error("asked again within a minute")
	}
	before := g.calls.Load()
	clock = clock.Add(retry)
	if !s.Warm(context.Background(), time.Second) || g.calls.Load() != before+1 {
		t.Errorf("want one request to see that nothing is new, and there were %d", g.calls.Load()-before)
	}
	g.runs = append([]workflowRun{run(2, "failure")}, g.runs...)
	clock = clock.Add(retry)
	if !s.Warm(context.Background(), time.Second) {
		t.Error("did not ask again soon")
	}
	if r := s.Report(context.Background()); !r.Available || r.Commit != "4a87353" {
		t.Errorf("after its first run: %+v", r)
	}
	// With results to show, the next read is the usual half an hour away.
	clock = clock.Add(retry)
	if s.Warm(context.Background(), time.Second) {
		t.Error("asked again at once")
	}
}

func TestBeforeTheWorkflowHasEverRun(t *testing.T) {
	clock := tested
	if r := newService(t, &github{}, &clock).Report(context.Background()); r.Available || r.Reason != "This release has not been tested yet." {
		t.Errorf("%+v", r)
	}
}

func TestKeepsTheLastRunWhenGitHubFails(t *testing.T) {
	g := &github{runs: []workflowRun{run(1, "success")}, notes: map[int64][]annotation{1: left(one, two)}}
	clock := tested
	s := newService(t, g, &clock)
	s.Report(context.Background())
	g.code = http.StatusForbidden
	clock = clock.Add(due)
	s.Warm(context.Background(), time.Second)
	if r := s.Report(context.Background()); !r.Available || !r.Stale || r.Holding != 1 {
		t.Errorf("want the last good report, marked stale: %+v", r)
	}
	if r := newService(t, g, &clock).Report(context.Background()); r.Available || r.Reason == "" {
		t.Errorf("nothing to show, and GitHub refuses: %+v", r)
	}
}

// A run that died before it could say anything is not a run of the tests: the last one that did stands.
func TestARunWithoutResults(t *testing.T) {
	g := &github{runs: []workflowRun{run(1, "success")}, notes: map[int64][]annotation{1: left(one, two), 2: left()}}
	clock := tested
	s := newService(t, g, &clock)
	s.Report(context.Background())
	g.runs = append([]workflowRun{run(2, "failure")}, g.runs...)
	clock = clock.Add(due)
	s.Warm(context.Background(), time.Second)
	if r := s.Report(context.Background()); !r.Available || !r.Stale {
		t.Errorf("%+v", r)
	}
}

func TestNotLive(t *testing.T) {
	for name, s := range map[string]*Service{
		"off Cloud Run":    New(Config{Repo: "o/r", Commit: commit}, false, quiet),
		"no full commit":   New(Config{Repo: "o/r", Commit: "unknown"}, true, quiet),
		"a path in commit": New(Config{Repo: "o/r", Commit: "../../../user"}, true, quiet),
	} {
		if r := s.Report(context.Background()); r.Available || r.Reason == "" || s.Warm(context.Background(), time.Second) {
			t.Errorf("%s: %+v", name, r)
		}
	}
}

// The tests decide nothing if the false claim passes, whatever the run says about itself.
func TestAFalseClaimThatHoldsIsNotTrustworthy(t *testing.T) {
	passed := func(s string) string {
		return strings.Replace(s, `"id":"php","verdict":"fails"`, `"id":"php","verdict":"holds"`, 1)
	}
	r, err := parse(left(passed(one), passed(two)))
	if err != nil || r.Trustworthy {
		t.Errorf("trustworthy %v, err %v", r.Trustworthy, err)
	}
	for _, parts := range [][]string{{strings.Replace(one, "true", "false", 1), two}, {one, strings.Replace(two, "true", "false", 1)}} {
		if r, err := parse(left(parts...)); err != nil || r.Trustworthy {
			t.Errorf("the run says it is not: trustworthy %v, err %v", r.Trustworthy, err)
		}
	}
}

func TestParseRefusesWhatIsNotARun(t *testing.T) {
	whole := strings.Replace(one, `"of":2`, `"of":1`, 1)
	if _, err := parse(left(whole)); err != nil {
		t.Fatalf("the control: %v", err)
	}
	for name, notes := range map[string][]annotation{
		"nothing":              nil,
		"only the runner's":    left(),
		"not JSON":             left(`15 of 15 hold`),
		"nothing in it":        left(`{}`),
		"no false claim":       left(`{"part":1,"of":1,"commit":"4a87353","tested":"2026-11-23T07:00:00Z","claims":[{"id":"a","verdict":"holds"}]}`),
		"no claims":            left(`{"part":1,"of":1,"commit":"4a87353","tested":"2026-11-23T07:00:00Z","claims":[],"false_claim":{"id":"php","verdict":"fails"}}`),
		"the first part only":  left(one),
		"the last part only":   left(two),
		"a part twice":         left(one, one),
		"parts of two runs":    left(one, strings.Replace(two, "07:00:00", "08:00:00", 1)),
		"parts of two commits": left(one, strings.Replace(two, "4a87353", "4a87354", 1)),
		"a strange id":         left(strings.Replace(whole, `"id":"commit"`, `"id":"<img src=x>"`, 1)),
		"a strange verdict":    left(strings.Replace(whole, `"holds"`, `"probably"`, 1)),
		"a strange commit":     left(strings.Replace(whole, `"commit":"4a87353"`, `"commit":"main"`, 1)),
		"too many": left(`{"part":1,"of":1,"commit":"4a87353","tested":"2026-11-23T07:00:00Z","false_claim":{"id":"php","verdict":"fails"},"claims":[` +
			strings.TrimSuffix(strings.Repeat(`{"id":"a","verdict":"holds"},`, maxClaims+1), ",") + `]}`),
	} {
		if r, err := parse(notes); err == nil {
			t.Errorf("%s: accepted %+v", name, r)
		}
	}
}

// GitHub does not say in what order it lists annotations.
func TestPartsInAnyOrder(t *testing.T) {
	notes := left(one, two)
	notes[1], notes[2] = notes[2], notes[1]
	if r, err := parse(notes); err != nil || r.Total != 3 || r.Claims[0].ID != "commit" {
		t.Errorf("%+v, err %v", r, err)
	}
}

func TestWhatATestSawIsTidied(t *testing.T) {
	long := strings.Repeat("é", maxSaw+50)
	r, err := parse(left(strings.NewReplacer(`"of":2`, `"of":1`, "4a87353 is running.", "line one\\nline  two "+long).Replace(one)))
	if err != nil {
		t.Fatal(err)
	}
	if saw := r.Claims[0].Saw; !strings.HasPrefix(saw, "line one line two é") || len([]rune(saw)) != maxSaw || !strings.HasSuffix(saw, "…") {
		t.Errorf("saw %q", saw)
	}
}

func TestOnlyGitHubLinks(t *testing.T) {
	for link, want := range map[string]bool{
		"https://github.com/o/r/actions/runs/1": true,
		"http://github.com/o/r":                 false,
		"https://github.com.example.com/o/r":    false,
		"javascript:alert(1)":                   false,
	} {
		if got := onGitHub(link); got != want {
			t.Errorf("onGitHub(%q) = %v", link, got)
		}
	}
}
