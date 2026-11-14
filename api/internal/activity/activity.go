// Package activity is the home page's "Recently" list: the site owner's latest public work on
// GitHub, that is pull requests in public repositories (merged, or open and in review) and releases
// of their own projects. The build bakes a snapshot into the image (/activity.json, written by
// web/scripts/activity.mjs, which keeps the same rules); on Cloud Run the server refreshes it from
// GitHub at most once an hour and keeps the last good list whenever GitHub is slow or refuses.
//
// GitHub is read without a token, so only public data can ever come back, whatever is searched for.
// And only from repositories the config names: the list goes on the home page without anyone reading
// it first, so a pull request anywhere else (whatever its repository or title says) never appears by
// itself. A new repository is a line in the config, here and in the snapshot script.
package activity

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strings"
	"sync"
	"time"
)

// Item is one entry. Kind is "merged" (a pull request merged), "review" (one open and not a draft)
// or "release".
type Item struct {
	Kind   string    `json:"kind"`
	Title  string    `json:"title"`
	Repo   string    `json:"repo"`
	Number int       `json:"number,omitempty"`
	URL    string    `json:"url"`
	At     time.Time `json:"at"`
}

// Feed is the list as /api/activity answers it, newest first.
type Feed struct {
	Items   []Item    `json:"items"`
	Updated time.Time `json:"updated"`
	// Source is "live" when this server read the list from GitHub, "snapshot" when it is the one the
	// build baked in.
	Source string `json:"source"`
}

const (
	// Keep is how many entries a feed holds.
	Keep = 8
	// Between reads of GitHub, and after a failed one.
	every = time.Hour
	retry = 10 * time.Minute
	// One read's deadline: the visitor whose request reads GitHub waits for it.
	readFor = 8 * time.Second
	// The most of a response body this reads; GitHub's pages here are a few tens of kilobytes.
	maxBody = 2 << 20
)

// Config says whose work to list, and from where.
type Config struct {
	User     string   // the GitHub login whose pull requests are listed
	Repos    []string // where they may come from: owner/name, or owner/* for all of an owner's repositories
	Releases []string // owner/name repositories whose releases are listed
}

// Allowed reports whether pull requests in repo (owner/name) may be listed. GitHub's names ignore case.
func (c Config) Allowed(repo string) bool {
	owner, name, ok := strings.Cut(repo, "/")
	if !ok || owner == "" || name == "" || strings.Contains(name, "/") {
		return false
	}
	for _, r := range c.Repos {
		if strings.EqualFold(r, repo) || strings.EqualFold(r, owner+"/*") {
			return true
		}
	}
	return false
}

// Service serves the feed.
type Service struct {
	cfg    Config
	base   string // the GitHub API root; tests point it at their own server
	client *http.Client
	live   bool
	log    *slog.Logger
	now    func() time.Time

	mu      sync.Mutex
	last    Feed
	next    time.Time
	reading bool
}

// New serves snapshot and, when live is set, refreshes it from GitHub at most once an hour.
func New(cfg Config, snapshot Feed, live bool, log *slog.Logger) *Service {
	if snapshot.Items == nil {
		snapshot.Items = []Item{}
	}
	snapshot.Source = "snapshot"
	return &Service{
		cfg: cfg, base: "https://api.github.com", client: &http.Client{Timeout: readFor},
		live: live, log: log, now: time.Now, last: snapshot,
	}
}

// LoadSnapshot reads the feed the build baked in. A missing file is os.ErrNotExist (the feed starts
// empty); one that does not parse is an error worth logging.
func LoadSnapshot(path string) (Feed, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return Feed{}, err
	}
	var f Feed
	if err := json.Unmarshal(raw, &f); err != nil {
		return Feed{}, fmt.Errorf("parse %s: %w", path, err)
	}
	return f, nil
}

// Feed is the list. One request at a time reads GitHub, inside its own request (with request-based
// billing, Cloud Run throttles the CPU once a response has gone); everyone else gets the last list
// meanwhile. There is always a list to give, the snapshot, so nobody else waits on a read.
func (s *Service) Feed(ctx context.Context) Feed {
	s.mu.Lock()
	if !s.live || s.reading || s.now().Before(s.next) {
		defer s.mu.Unlock()
		return s.last
	}
	s.reading = true
	s.mu.Unlock()

	// A deadline of its own: the visitor who started the read may leave before it ends.
	rctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), readFor)
	defer cancel()
	items, err := s.read(rctx)

	s.mu.Lock()
	defer s.mu.Unlock()
	s.reading = false
	now := s.now()
	if err != nil {
		s.next = now.Add(retry)
		s.log.Warn("activity: reading GitHub failed; serving the last list", "err", err, "source", s.last.Source)
		return s.last
	}
	s.next = now.Add(every)
	s.last = Feed{Items: items, Updated: now.UTC(), Source: "live"}
	return s.last
}

// read asks GitHub for the pull requests and releases. A panic in it becomes an error like any
// other, so the read is marked finished: left as it was, no later visitor would ever read again.
func (s *Service) read(ctx context.Context) (items []Item, err error) {
	defer func() {
		if v := recover(); v != nil {
			err = fmt.Errorf("reading GitHub panicked: %v", v)
		}
	}()
	items, err = s.pulls(ctx)
	if err != nil {
		return nil, err
	}
	for _, repo := range s.cfg.Releases {
		rs, err := s.releases(ctx, repo)
		if err != nil {
			return nil, err
		}
		items = append(items, rs...)
	}
	return Newest(items), nil
}

type searchResult struct {
	Items []struct {
		Title         string    `json:"title"`
		Number        int       `json:"number"`
		HTMLURL       string    `json:"html_url"`
		RepositoryURL string    `json:"repository_url"`
		State         string    `json:"state"`
		Draft         bool      `json:"draft"`
		CreatedAt     time.Time `json:"created_at"`
		PullRequest   *struct {
			MergedAt *time.Time `json:"merged_at"`
		} `json:"pull_request"`
	} `json:"items"`
}

// pulls is the user's pull requests in public repositories, recently updated first: merged ones
// dated by their merge, open ones (not drafts) by when they were opened. Closed without merging, or
// anything that is not a pull request, is left out.
func (s *Service) pulls(ctx context.Context) ([]Item, error) {
	q := url.Values{}
	q.Set("q", "author:"+s.cfg.User+" is:pr is:public")
	q.Set("sort", "updated")
	q.Set("order", "desc")
	q.Set("per_page", "30")
	var res searchResult
	if err := s.get(ctx, "/search/issues?"+q.Encode(), &res); err != nil {
		return nil, err
	}
	out := []Item{}
	for _, it := range res.Items {
		repo := repoName(it.RepositoryURL)
		if it.PullRequest == nil || repo == "" || !s.cfg.Allowed(repo) || !onGitHub(it.HTMLURL) {
			continue
		}
		item := Item{Title: strings.TrimSpace(it.Title), Repo: repo, Number: it.Number, URL: it.HTMLURL}
		switch {
		case it.PullRequest.MergedAt != nil:
			item.Kind, item.At = "merged", it.PullRequest.MergedAt.UTC()
		case it.State == "open" && !it.Draft:
			item.Kind, item.At = "review", it.CreatedAt.UTC()
		default:
			continue
		}
		out = append(out, item)
	}
	return out, nil
}

type release struct {
	TagName     string     `json:"tag_name"`
	HTMLURL     string     `json:"html_url"`
	Draft       bool       `json:"draft"`
	Prerelease  bool       `json:"prerelease"`
	PublishedAt *time.Time `json:"published_at"`
}

// releases is a repository's published releases (not drafts or prereleases), titled "name tag".
func (s *Service) releases(ctx context.Context, repo string) ([]Item, error) {
	var rs []release
	if err := s.get(ctx, "/repos/"+repo+"/releases?per_page=5", &rs); err != nil {
		return nil, err
	}
	name := repo[strings.LastIndex(repo, "/")+1:]
	out := []Item{}
	for _, r := range rs {
		if r.Draft || r.Prerelease || r.PublishedAt == nil || !onGitHub(r.HTMLURL) {
			continue
		}
		out = append(out, Item{Kind: "release", Title: name + " " + r.TagName, Repo: repo, URL: r.HTMLURL, At: r.PublishedAt.UTC()})
	}
	return out, nil
}

func (s *Service) get(ctx context.Context, path string, v any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.base+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "portfolio-activity") // GitHub refuses requests without one
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

// Newest sorts items newest first, drops repeats of a link and keeps the first Keep.
func Newest(items []Item) []Item {
	sort.SliceStable(items, func(i, j int) bool { return items[i].At.After(items[j].At) })
	seen := map[string]bool{}
	out := []Item{}
	for _, it := range items {
		if seen[it.URL] {
			continue
		}
		seen[it.URL] = true
		out = append(out, it)
		if len(out) == Keep {
			break
		}
	}
	return out
}

// repoName turns https://api.github.com/repos/owner/name into owner/name.
func repoName(apiURL string) string {
	_, rest, ok := strings.Cut(apiURL, "/repos/")
	if !ok || strings.Count(rest, "/") != 1 {
		return ""
	}
	return rest
}

// onGitHub is true for an https link to github.com: the page renders these as links.
func onGitHub(link string) bool {
	u, err := url.Parse(link)
	return err == nil && u.Scheme == "https" && u.Host == "github.com"
}
