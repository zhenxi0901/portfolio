package claims

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
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

// text is what the workflow puts in the check: one claim of each verdict, and the false one failing.
const text = `{"commit":"4a87353","tested":"2026-11-23T07:00:00.123Z","trustworthy":true,
	"claims":[{"id":"commit","verdict":"holds","saw":"4a87353 is running."},{"id":"releases","verdict":"fails","saw":"55 of 56"},{"id":"iccv","verdict":"unknown","saw":"Could not be checked."}],
	"false_claim":{"id":"php","verdict":"fails","saw":"The server says it runs go1.27.3."}}`

// check is one check run as GitHub lists it.
func check(name, app, done, text string) string {
	t, _ := json.Marshal(text)
	return fmt.Sprintf(`{"name":%q,"completed_at":%q,"details_url":"https://github.com/o/r/actions/runs/1","app":{"slug":%q},"output":{"text":%s}}`, name, done, app, t)
}

// fakeGitHub lists whatever checks says, and counts how often it is asked.
func fakeGitHub(t *testing.T, checks func() (int, []string)) (string, *atomic.Int32) {
	t.Helper()
	var calls atomic.Int32
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.Header.Get("User-Agent") == "" || r.URL.Path != "/repos/o/r/commits/"+commit+"/check-runs" || r.URL.Query().Get("check_name") != "claims" {
			t.Errorf("asked for %s", r.URL)
		}
		code, list := checks()
		w.WriteHeader(code)
		_, _ = io.WriteString(w, `{"check_runs":[`+strings.Join(list, ",")+`]}`)
	}))
	t.Cleanup(ts.Close)
	return ts.URL, &calls
}

func newService(base string, clock *time.Time) *Service {
	s := New(Config{Repo: "o/r", Commit: commit}, true, quiet)
	s.base = base
	s.now = func() time.Time { return *clock }
	return s
}

func TestReportsTheLastRun(t *testing.T) {
	url, _ := fakeGitHub(t, func() (int, []string) {
		return 200, []string{
			check("claims", "github-actions", "2026-11-23T06:00:00Z", strings.ReplaceAll(text, `"holds"`, `"fails"`)),
			check("claims", "github-actions", "2026-11-23T07:00:01Z", text),
			// Newer, but not the workflow's, so not read.
			check("claims", "some-app", "2026-11-23T08:00:00Z", strings.ReplaceAll(text, `"fails"`, `"holds"`)),
			// Newer, but a job's own check, which GitHub makes with no text at all.
			strings.Replace(check("claims", "github-actions", "2026-11-23T09:00:00Z", ""), `"text":""`, `"text":null`, 1),
		}
	})
	clock := tested.Add(time.Hour)
	r := newService(url, &clock).Report(context.Background())
	if !r.Available || r.Stale || r.Total != 3 || r.Holding != 1 || r.Failing != 1 || r.Unknown != 1 || !r.Trustworthy {
		t.Fatalf("report: %+v", r)
	}
	if r.Commit != "4a87353" || !r.Tested.Equal(tested.Add(123*time.Millisecond)) || r.Run != "https://github.com/o/r/actions/runs/1" || r.FalseClaim.ID != "php" {
		t.Errorf("report: %+v", r)
	}
}

// A release's results come a few minutes after it. Until then that is the answer, and it is asked again soon.
func TestAReleaseNotTestedYet(t *testing.T) {
	var list []string
	url, calls := fakeGitHub(t, func() (int, []string) { return 200, list })
	clock := tested
	s := newService(url, &clock)
	if r := s.Report(context.Background()); r.Available || r.Reason != "This release has not been tested yet." || r.Claims == nil {
		t.Fatalf("before the first run: %+v", r)
	}
	clock = clock.Add(time.Minute)
	if s.Warm(context.Background(), time.Second) {
		t.Error("asked again within a minute")
	}
	list = []string{check("claims", "github-actions", "2026-11-23T07:00:01Z", text)}
	clock = clock.Add(retry)
	if !s.Warm(context.Background(), time.Second) {
		t.Error("did not ask again soon")
	}
	if r := s.Report(context.Background()); !r.Available {
		t.Errorf("after the first run: %+v", r)
	}
	// With results to show, the next read is the usual half an hour away.
	clock = clock.Add(retry)
	if s.Warm(context.Background(), time.Second) || calls.Load() != 2 {
		t.Errorf("%d reads, want 2", calls.Load())
	}
}

func TestKeepsTheLastRunWhenGitHubFails(t *testing.T) {
	code := 200
	url, _ := fakeGitHub(t, func() (int, []string) {
		return code, []string{check("claims", "github-actions", "2026-11-23T07:00:01Z", text)}
	})
	clock := tested
	s := newService(url, &clock)
	s.Report(context.Background())
	code = http.StatusForbidden
	clock = clock.Add(due)
	s.Warm(context.Background(), time.Second)
	if r := s.Report(context.Background()); !r.Available || !r.Stale || r.Holding != 1 {
		t.Errorf("want the last good report, marked stale: %+v", r)
	}
	if r := newService(url, &clock).Report(context.Background()); r.Available || r.Reason == "" {
		t.Errorf("nothing to show, and GitHub refuses: %+v", r)
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
	r, err := parse(strings.Replace(text, `"id":"php","verdict":"fails"`, `"id":"php","verdict":"holds"`, 1))
	if err != nil || r.Trustworthy {
		t.Errorf("trustworthy %v, err %v", r.Trustworthy, err)
	}
	r, err = parse(strings.Replace(text, `"trustworthy":true`, `"trustworthy":false`, 1))
	if err != nil || r.Trustworthy {
		t.Errorf("the run says it is not: trustworthy %v, err %v", r.Trustworthy, err)
	}
}

func TestParseRefusesWhatIsNotARun(t *testing.T) {
	for name, in := range map[string]string{
		"empty":             ``,
		"not JSON":          `15 of 15 hold`,
		"nothing in it":     `{}`,
		"no false claim":    `{"commit":"4a87353","tested":"2026-11-23T07:00:00Z","claims":[{"id":"a","verdict":"holds"}]}`,
		"no claims":         `{"commit":"4a87353","tested":"2026-11-23T07:00:00Z","claims":[],"false_claim":{"id":"php","verdict":"fails"}}`,
		"a strange id":      strings.Replace(text, `"id":"commit"`, `"id":"<img src=x>"`, 1),
		"a strange verdict": strings.Replace(text, `"holds"`, `"probably"`, 1),
		"a strange commit":  strings.Replace(text, `"commit":"4a87353"`, `"commit":"main"`, 1),
		"too many": `{"commit":"4a87353","tested":"2026-11-23T07:00:00Z","false_claim":{"id":"php","verdict":"fails"},"claims":[` +
			strings.TrimSuffix(strings.Repeat(`{"id":"a","verdict":"holds"},`, maxClaims+1), ",") + `]}`,
	} {
		if r, err := parse(in); err == nil {
			t.Errorf("%s: accepted %+v", name, r)
		}
	}
}

func TestWhatATestSawIsTidied(t *testing.T) {
	long := strings.Repeat("é", maxSaw+50)
	r, err := parse(strings.Replace(text, "4a87353 is running.", "line one\\nline  two "+long, 1))
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
