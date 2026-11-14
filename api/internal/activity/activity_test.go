package activity

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

const search = `{"items": [
  {"title": "Run the agent stack without root", "number": 92, "html_url": "https://github.com/hyscale-lab/ARIES/pull/92",
   "repository_url": "https://api.github.com/repos/hyscale-lab/ARIES", "state": "closed", "created_at": "2026-11-01T00:00:00Z",
   "pull_request": {"merged_at": "2026-11-10T08:00:00Z"}},
  {"title": " Plugins for the harness ", "number": 96, "html_url": "https://github.com/hyscale-lab/ARIES/pull/96",
   "repository_url": "https://api.github.com/repos/hyscale-lab/ARIES", "state": "open", "created_at": "2026-11-11T09:00:00Z",
   "pull_request": {"merged_at": null}},
  {"title": "A draft", "number": 97, "html_url": "https://github.com/hyscale-lab/ARIES/pull/97", "draft": true,
   "repository_url": "https://api.github.com/repos/hyscale-lab/ARIES", "state": "open", "created_at": "2026-11-12T09:00:00Z",
   "pull_request": {"merged_at": null}},
  {"title": "Closed without merging", "number": 5, "html_url": "https://github.com/whupdido/mdp/pull/5",
   "repository_url": "https://api.github.com/repos/whupdido/mdp", "state": "closed", "created_at": "2026-09-01T00:00:00Z",
   "pull_request": {"merged_at": null}},
  {"title": "An issue, not a pull request", "number": 7, "html_url": "https://github.com/whupdido/mdp/issues/7",
   "repository_url": "https://api.github.com/repos/whupdido/mdp", "state": "open", "created_at": "2026-11-13T00:00:00Z"},
  {"title": "A link off GitHub", "number": 8, "html_url": "javascript:alert(1)",
   "repository_url": "https://api.github.com/repos/whupdido/mdp", "state": "closed", "created_at": "2026-09-01T00:00:00Z",
   "pull_request": {"merged_at": "2026-09-02T00:00:00Z"}},
  {"title": "Map sync between the tablet and the Pi", "number": 41, "html_url": "https://github.com/whupdido/mdp/pull/41",
   "repository_url": "https://api.github.com/repos/whupdido/mdp", "state": "closed", "created_at": "2026-10-01T00:00:00Z",
   "pull_request": {"merged_at": "2026-10-02T03:00:00Z"}}
]}`

const releases = `[
  {"tag_name": "v1.1.0", "html_url": "https://github.com/zhenxi0901/dora-card/releases/tag/v1.1.0", "published_at": "2026-11-13T08:37:54Z"},
  {"tag_name": "v1.2.0-rc1", "html_url": "https://github.com/zhenxi0901/dora-card/releases/tag/v1.2.0-rc1", "prerelease": true, "published_at": "2026-11-14T00:00:00Z"},
  {"tag_name": "v9", "html_url": "https://github.com/zhenxi0901/dora-card/releases/tag/v9", "draft": true, "published_at": null}
]`

var cfg = Config{User: "zhenxi0901", Releases: []string{"zhenxi0901/dora-card"}}

// fakeGitHub answers the two endpoints the service reads, counting requests; fail makes it 503.
func fakeGitHub(t *testing.T, fail *atomic.Bool) (*httptest.Server, *atomic.Int64) {
	t.Helper()
	var calls atomic.Int64
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.Header.Get("User-Agent") == "" {
			t.Error("request without a User-Agent; GitHub refuses those")
		}
		if fail != nil && fail.Load() {
			http.Error(w, "unavailable", http.StatusServiceUnavailable)
			return
		}
		switch r.URL.Path {
		case "/search/issues":
			if q := r.URL.Query().Get("q"); q != "author:zhenxi0901 is:pr is:public" {
				t.Errorf("search q = %q", q)
			}
			_, _ = io.WriteString(w, search)
		case "/repos/zhenxi0901/dora-card/releases":
			_, _ = io.WriteString(w, releases)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(ts.Close)
	return ts, &calls
}

func newService(base string, snapshot Feed, live bool, clock *time.Time) *Service {
	s := New(cfg, snapshot, live, slog.New(slog.NewTextHandler(io.Discard, nil)))
	s.base = base
	s.now = func() time.Time { return *clock }
	return s
}

func at(s string) time.Time {
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		panic(err)
	}
	return t
}

func TestReadsPullRequestsAndReleases(t *testing.T) {
	ts, _ := fakeGitHub(t, nil)
	clock := at("2026-11-14T03:00:00Z")
	f := newService(ts.URL, Feed{}, true, &clock).Feed(context.Background())

	if f.Source != "live" || !f.Updated.Equal(clock) {
		t.Fatalf("source %q updated %v, want live at %v", f.Source, f.Updated, clock)
	}
	want := []Item{
		{Kind: "release", Title: "dora-card v1.1.0", Repo: "zhenxi0901/dora-card", URL: "https://github.com/zhenxi0901/dora-card/releases/tag/v1.1.0", At: at("2026-11-13T08:37:54Z")},
		{Kind: "review", Title: "Plugins for the harness", Repo: "hyscale-lab/ARIES", Number: 96, URL: "https://github.com/hyscale-lab/ARIES/pull/96", At: at("2026-11-11T09:00:00Z")},
		{Kind: "merged", Title: "Run the agent stack without root", Repo: "hyscale-lab/ARIES", Number: 92, URL: "https://github.com/hyscale-lab/ARIES/pull/92", At: at("2026-11-10T08:00:00Z")},
		{Kind: "merged", Title: "Map sync between the tablet and the Pi", Repo: "whupdido/mdp", Number: 41, URL: "https://github.com/whupdido/mdp/pull/41", At: at("2026-10-02T03:00:00Z")},
	}
	if len(f.Items) != len(want) {
		t.Fatalf("got %d items, want %d (drafts, unmerged closes, issues, prereleases and links off GitHub left out): %+v", len(f.Items), len(want), f.Items)
	}
	for i := range want {
		if f.Items[i] != want[i] {
			t.Errorf("item %d = %+v, want %+v", i, f.Items[i], want[i])
		}
	}
}

func TestServesTheSnapshotWhenNotLive(t *testing.T) {
	ts, calls := fakeGitHub(t, nil)
	clock := at("2026-11-14T03:00:00Z")
	snap := Feed{Items: []Item{{Kind: "merged", Title: "x", URL: "https://github.com/a/b/pull/1"}}, Updated: at("2026-11-13T00:00:00Z")}
	f := newService(ts.URL, snap, false, &clock).Feed(context.Background())
	if f.Source != "snapshot" || len(f.Items) != 1 || calls.Load() != 0 {
		t.Errorf("not live: source %q, %d items, %d calls to GitHub; want the snapshot and none", f.Source, len(f.Items), calls.Load())
	}
	if empty := newService(ts.URL, Feed{}, false, &clock).Feed(context.Background()); empty.Items == nil {
		t.Error("an empty snapshot should still answer items: [] rather than null")
	}
}

// GitHub is read at most once an hour; after a failure, ten minutes later, and meanwhile the last
// good list (the snapshot until the first read succeeds) is what everyone gets.
func TestReadsHourlyAndKeepsTheLastListOnFailure(t *testing.T) {
	var fail atomic.Bool
	fail.Store(true)
	ts, calls := fakeGitHub(t, &fail)
	clock := at("2026-11-14T03:00:00Z")
	snap := Feed{Items: []Item{{Kind: "merged", Title: "from the build", URL: "https://github.com/a/b/pull/1"}}}
	s := newService(ts.URL, snap, true, &clock)

	if f := s.Feed(context.Background()); f.Source != "snapshot" || f.Items[0].Title != "from the build" {
		t.Fatalf("GitHub down at the start: got %q %+v, want the snapshot", f.Source, f.Items)
	}
	first := calls.Load()
	clock = clock.Add(5 * time.Minute)
	s.Feed(context.Background())
	if calls.Load() != first {
		t.Error("read GitHub again within ten minutes of a failure")
	}

	fail.Store(false)
	clock = clock.Add(6 * time.Minute)
	if f := s.Feed(context.Background()); f.Source != "live" || len(f.Items) != 4 {
		t.Fatalf("after the retry interval: %q with %d items, want live with 4", f.Source, len(f.Items))
	}
	afterSuccess := calls.Load()
	clock = clock.Add(59 * time.Minute)
	s.Feed(context.Background())
	if calls.Load() != afterSuccess {
		t.Error("read GitHub again within the hour")
	}

	fail.Store(true)
	clock = clock.Add(2 * time.Minute)
	if f := s.Feed(context.Background()); f.Source != "live" || len(f.Items) != 4 {
		t.Errorf("GitHub down after a good read: %q with %d items, want the last live list", f.Source, len(f.Items))
	}
}

// While one request reads GitHub, everyone else gets the last list at once rather than waiting.
func TestOthersDoNotWaitOnARead(t *testing.T) {
	release := make(chan struct{})
	entered := make(chan struct{}, 1)
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case entered <- struct{}{}:
		default:
		}
		<-release
		http.Error(w, "late", http.StatusServiceUnavailable)
	}))
	t.Cleanup(ts.Close)
	t.Cleanup(func() { close(release) })
	clock := at("2026-11-14T03:00:00Z")
	snap := Feed{Items: []Item{{Kind: "merged", Title: "from the build", URL: "https://github.com/a/b/pull/1"}}}
	s := newService(ts.URL, snap, true, &clock)

	go s.Feed(context.Background())
	<-entered
	done := make(chan Feed, 1)
	go func() { done <- s.Feed(context.Background()) }()
	select {
	case f := <-done:
		if f.Source != "snapshot" {
			t.Errorf("during a read: got %q, want the snapshot", f.Source)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("a second request waited on the first one's read")
	}
}

func TestNewestSortsDedupesAndKeeps(t *testing.T) {
	var items []Item
	for i := 0; i < Keep+3; i++ {
		items = append(items, Item{URL: "https://github.com/a/b/pull/" + string(rune('a'+i)), At: at("2026-11-01T00:00:00Z").Add(time.Duration(i) * time.Hour)})
	}
	items = append(items, items[len(items)-1]) // a repeat of the newest
	got := Newest(items)
	if len(got) != Keep {
		t.Fatalf("kept %d, want %d", len(got), Keep)
	}
	for i := 1; i < len(got); i++ {
		if got[i].At.After(got[i-1].At) || got[i].URL == got[i-1].URL {
			t.Fatalf("not newest first without repeats: %+v", got)
		}
	}
}

func TestLoadSnapshot(t *testing.T) {
	dir := t.TempDir()
	good := filepath.Join(dir, "activity.json")
	if err := os.WriteFile(good, []byte(`{"items":[{"kind":"release","title":"dora-card v1.1.0","repo":"zhenxi0901/dora-card","url":"https://github.com/zhenxi0901/dora-card/releases/tag/v1.1.0","at":"2026-11-13T08:37:54Z"}],"updated":"2026-11-14T00:00:00Z","source":"snapshot"}`), 0o644); err != nil {
		t.Fatal(err)
	}
	f, err := LoadSnapshot(good)
	if err != nil || len(f.Items) != 1 || f.Items[0].Title != "dora-card v1.1.0" {
		t.Errorf("LoadSnapshot = %+v, %v", f, err)
	}
	if _, err := LoadSnapshot(filepath.Join(dir, "missing.json")); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("missing file: err = %v, want os.ErrNotExist", err)
	}
	bad := filepath.Join(dir, "bad.json")
	if err := os.WriteFile(bad, []byte("{"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadSnapshot(bad); err == nil || !strings.Contains(err.Error(), "parse") {
		t.Errorf("bad file: err = %v, want a parse error", err)
	}
}

func TestRepoNameAndLinks(t *testing.T) {
	for in, want := range map[string]string{
		"https://api.github.com/repos/hyscale-lab/ARIES": "hyscale-lab/ARIES",
		"https://api.github.com/repos/only-owner":        "",
		"https://api.github.com/repos/a/b/c":             "",
		"https://example.com/nothing":                    "",
	} {
		if got := repoName(in); got != want {
			t.Errorf("repoName(%q) = %q, want %q", in, got, want)
		}
	}
	for link, want := range map[string]bool{
		"https://github.com/a/b/pull/1":   true,
		"http://github.com/a/b/pull/1":    false,
		"https://gist.github.com/a/1":     false,
		"javascript:alert(1)":             false,
		"https://github.com.evil.example": false,
	} {
		if got := onGitHub(link); got != want {
			t.Errorf("onGitHub(%q) = %v, want %v", link, got, want)
		}
	}
}
