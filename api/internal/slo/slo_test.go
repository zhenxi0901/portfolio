package slo

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/zhenxi0901/portfolio/api/internal/gcp"
)

var quiet = slog.New(slog.NewTextHandler(io.Discard, nil))

func near(a, b float64) bool { return math.Abs(a-b) < 1e-6 }

func TestSummariseBudget(t *testing.T) {
	end := time.Date(2026, 10, 30, 12, 0, 0, 0, time.UTC)
	days := make([]Day, WindowDays)
	for i := range days {
		days[i].End = end.Add(-time.Duration(WindowDays-1-i) * day)
	}
	// Ten full days measured, 3 checkers a minute: 43,200 checks, 30 of them failed.
	for i := WindowDays - 10; i < WindowDays; i++ {
		days[i].Checks, days[i].Passed = 4320, 4320
	}
	days[WindowDays-1].Passed -= 30

	r := Summarise(days, end.Add(-10*day), end)
	if !r.Available || r.Checks != 43200 || r.Passed != 43170 {
		t.Fatalf("counts: %+v", r)
	}
	if want := 43170.0 / 43200; !near(r.Availability, want) {
		t.Errorf("availability %v, want %v", r.Availability, want)
	}
	if !near(r.BudgetMinutes, 43.2) {
		t.Errorf("budget %v min, want 43.2", r.BudgetMinutes)
	}
	// 30 failed checks of 43,200 over 10 days (14,400 min) is 10 minutes of downtime.
	if !near(r.DowntimeMinutes, 10) {
		t.Errorf("downtime %v min, want 10", r.DowntimeMinutes)
	}
	if want := 1 - 10/43.2; !near(r.BudgetRemaining, want) {
		t.Errorf("budget remaining %v, want %v", r.BudgetRemaining, want)
	}
	if r.Since == nil || !r.Since.Equal(end.Add(-10*day)) {
		t.Errorf("since %v, want %v", r.Since, end.Add(-10*day))
	}
	if r.Releases != ReleasesOpen {
		t.Errorf("releases %q with budget left, want open", r.Releases)
	}
}

func TestSpentBudgetFreezesReleases(t *testing.T) {
	end := time.Date(2026, 10, 30, 12, 0, 0, 0, time.UTC)
	days := make([]Day, WindowDays)
	// One day measured with 5% of checks failing: 72 minutes down, more than the 43.2-minute budget.
	days[WindowDays-1] = Day{End: end, Checks: 4320, Passed: 4104}
	r := Summarise(days, end.Add(-day), end)
	if r.BudgetRemaining > 0 || r.Releases != ReleasesFrozen {
		t.Errorf("budget remaining %v, releases %q; want spent and frozen", r.BudgetRemaining, r.Releases)
	}
	if u := Summarise(make([]Day, WindowDays), time.Time{}, end); u.Releases != ReleasesUnknown {
		t.Errorf("nothing measured: releases %q, want unknown", u.Releases)
	}
	if u := unavailable("down"); u.Releases != ReleasesUnknown {
		t.Errorf("unavailable: releases %q, want unknown", u.Releases)
	}
}

func TestSummariseWithoutData(t *testing.T) {
	r := Summarise(make([]Day, WindowDays), time.Time{}, time.Now())
	if r.Available || r.Reason == "" {
		t.Errorf("an empty window should be unavailable with a reason: %+v", r)
	}
}

type fakeSource struct {
	calls int
	err   error
}

func (f *fakeSource) Days(_ context.Context, end time.Time) ([]Day, time.Time, error) {
	f.calls++
	if f.err != nil {
		return nil, time.Time{}, f.err
	}
	return []Day{{End: end, Checks: 10, Passed: 10}}, end.Add(-time.Hour), nil
}

func TestReportCachesAndKeepsLastGood(t *testing.T) {
	src := &fakeSource{}
	s := New(src, quiet)
	clock := time.Date(2026, 10, 19, 0, 0, 0, 0, time.UTC)
	s.now = func() time.Time { return clock }

	if r := s.Report(context.Background()); !r.Available || r.Availability != 1 {
		t.Fatalf("first report: %+v", r)
	}
	clock = clock.Add(time.Minute)
	s.Report(context.Background())
	if src.calls != 1 {
		t.Fatalf("fetched %d times inside the cache window, want 1", src.calls)
	}

	// After the cache expires a failed fetch serves the last good report, marked stale.
	clock = clock.Add(cacheFor)
	src.err = errors.New("monitoring down")
	if r := s.Report(context.Background()); !r.Available || !r.Stale {
		t.Fatalf("want last good report marked stale, got %+v", r)
	}
	// And it does not hammer the API while failing.
	s.Report(context.Background())
	if src.calls != 2 {
		t.Fatalf("fetched %d times, want 2", src.calls)
	}
}

func TestReportWithoutSource(t *testing.T) {
	if r := New(nil, quiet).Report(context.Background()); r.Available || r.Target != Target {
		t.Errorf("no source: %+v", r)
	}
}

func TestMonitoringReadsCounts(t *testing.T) {
	end := time.Date(2026, 10, 19, 6, 30, 0, 0, time.UTC)
	meta := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Metadata-Flavor") != "Google" {
			http.Error(w, "missing header", http.StatusForbidden)
			return
		}
		switch r.URL.Path {
		case "/project/project-id":
			_, _ = io.WriteString(w, "demo-project")
		case "/instance/service-accounts/default/token":
			_, _ = io.WriteString(w, `{"access_token":"tok","expires_in":3600}`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer meta.Close()
	var aligners []string
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer tok" || r.URL.Path != "/projects/demo-project/timeSeries" {
			http.Error(w, "bad request", http.StatusUnauthorized)
			return
		}
		q := r.URL.Query()
		if !strings.Contains(q.Get("filter"), "uptime_check/check_passed") || q.Get("aggregation.crossSeriesReducer") != "REDUCE_SUM" {
			http.Error(w, "bad query", http.StatusBadRequest)
			return
		}
		aligners = append(aligners, q.Get("aggregation.perSeriesAligner"))
		n := map[string]string{"ALIGN_COUNT": "4320", "ALIGN_COUNT_TRUE": "4318"}[q.Get("aggregation.perSeriesAligner")]
		// Hourly points: one this morning, one yesterday morning.
		_, _ = io.WriteString(w, `{"timeSeries":[{"points":[
			{"interval":{"endTime":"2026-10-19T06:00:00Z"},"value":{"int64Value":"`+n+`"}},
			{"interval":{"endTime":"2026-10-18T06:00:00Z"},"value":{"int64Value":"`+n+`"}}]}]}`)
	}))
	defer api.Close()

	m := NewMonitoring(gcp.NewMetadata())
	m.meta.Base, m.api = meta.URL, api.URL
	days, first, err := m.Days(context.Background(), end)
	if err != nil {
		t.Fatal(err)
	}
	if want := time.Date(2026, 10, 18, 5, 0, 0, 0, time.UTC); !first.Equal(want) {
		t.Errorf("first check %v, want %v (start of the earliest hour)", first, want)
	}
	if len(days) != WindowDays {
		t.Fatalf("%d buckets, want %d", len(days), WindowDays)
	}
	last, prev := days[WindowDays-1], days[WindowDays-2]
	if last.Checks != 4320 || last.Passed != 4318 || prev.Checks != 4320 || days[0].Checks != 0 {
		t.Errorf("buckets: first %+v, yesterday %+v, today %+v", days[0], prev, last)
	}
	if len(aligners) != 2 {
		t.Errorf("aligners asked for: %v", aligners)
	}
}

func TestMonitoringReportsAPIErrors(t *testing.T) {
	meta := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "project-id") {
			_, _ = io.WriteString(w, "p")
			return
		}
		_, _ = io.WriteString(w, `{"access_token":"tok","expires_in":3600}`)
	}))
	defer meta.Close()
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, `{"error":{"status":"PERMISSION_DENIED"}}`, http.StatusForbidden)
	}))
	defer api.Close()

	m := NewMonitoring(gcp.NewMetadata())
	m.meta.Base, m.api = meta.URL, api.URL
	if _, _, err := m.Days(context.Background(), time.Now()); err == nil || !strings.Contains(err.Error(), "403") {
		t.Fatalf("want a 403 error, got %v", err)
	}
}

func TestBadge(t *testing.T) {
	cases := []struct {
		r             Report
		message, colr string
	}{
		{Report{}, "measuring", "lightgrey"},
		{Report{Available: true, Availability: 1}, "100.00%", "brightgreen"},
		// Rounded down, so 99.899% never shows as meeting a 99.9% objective.
		{Report{Available: true, Availability: 0.99899}, "99.89%", "yellow"},
		{Report{Available: true, Availability: 0.95}, "95.00%", "red"},
	}
	for _, c := range cases {
		b := Badge(c.r)
		if b.SchemaVersion != 1 || b.Message != c.message || b.Color != c.colr {
			t.Errorf("Badge(%v) = %+v, want %s %s", c.r.Availability, b, c.message, c.colr)
		}
	}
}

type ctxSource struct{ err error }

func (c *ctxSource) Days(ctx context.Context, end time.Time) ([]Day, time.Time, error) {
	c.err = ctx.Err()
	return []Day{{End: end, Checks: 1, Passed: 1}}, end, nil
}

// The first caller leaving must not cancel the fetch every other caller is waiting on.
func TestFetchSurvivesTheCallerLeaving(t *testing.T) {
	src := &ctxSource{}
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	if r := New(src, quiet).Report(ctx); !r.Available || src.err != nil {
		t.Errorf("report %+v, fetch context error %v", r, src.err)
	}
}

func TestFloorPct(t *testing.T) {
	for _, c := range []struct {
		x    float64
		d    int
		want float64
	}{
		{0.9984, 2, 99.84}, // 0.9984*10000 is 9983.999... in binary
		{0.99996, 2, 99.99},
		{1, 2, 100},
		{0.9961, 1, 99.6},
		{0.97, 1, 97},
		{0, 1, 0},
	} {
		if got := FloorPct(c.x, c.d); !near(got, c.want) {
			t.Errorf("FloorPct(%v, %d) = %v, want %v", c.x, c.d, got, c.want)
		}
	}
}

// A few hours of checks must not be labelled as a month.
func TestUptimeLabel(t *testing.T) {
	end := time.Date(2026, 10, 19, 12, 0, 0, 0, time.UTC)
	start := end.Add(-6 * time.Hour)
	if got := (Report{Since: &start, Updated: end}).UptimeLabel(); got != "uptime since 19 Oct" {
		t.Errorf("6 h measured: %q", got)
	}
	full := end.Add(-30 * day)
	if got := (Report{Since: &full, Updated: end}).UptimeLabel(); got != "uptime, 30 days" {
		t.Errorf("full window: %q", got)
	}
	days := make([]Day, WindowDays)
	days[WindowDays-1] = Day{End: end, Checks: 100, Passed: 100}
	if b := Badge(Summarise(days, start, end)); b.Label != "uptime since 19 Oct" {
		t.Errorf("badge label %q", b.Label)
	}
}
