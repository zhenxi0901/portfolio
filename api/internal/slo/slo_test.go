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

	m := NewMonitoring()
	m.metadata, m.api = meta.URL, api.URL
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

	m := NewMonitoring()
	m.metadata, m.api = meta.URL, api.URL
	if _, _, err := m.Days(context.Background(), time.Now()); err == nil || !strings.Contains(err.Error(), "403") {
		t.Fatalf("want a 403 error, got %v", err)
	}
}
