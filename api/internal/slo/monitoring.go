package slo

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
	"time"

	"github.com/zhenxi0901/portfolio/api/internal/gcp"
)

// Monitoring reads uptime-check results from the Cloud Monitoring API with the runtime identity's
// token from the metadata server. Standard library only: no client libraries in the image.
//
// It counts every uptime check in the project; this project has one, on /api/health.
type Monitoring struct {
	meta *gcp.Metadata
	api  string // Monitoring API base URL
}

func NewMonitoring(meta *gcp.Metadata) *Monitoring {
	return &Monitoring{meta: meta, api: "https://monitoring.googleapis.com/v3"}
}

const filter = `metric.type = "monitoring.googleapis.com/uptime_check/check_passed" AND resource.type = "uptime_url"`

// Days returns WindowDays 24-hour buckets ending at end, oldest first (empty buckets are zero),
// and the start of the first hour with a check in it. Counts are read hourly so that start is
// accurate to the hour, then summed into days.
func (m *Monitoring) Days(ctx context.Context, end time.Time) ([]Day, time.Time, error) {
	project, token, err := m.meta.Credentials(ctx)
	if err != nil {
		return nil, time.Time{}, err
	}
	start := end.Add(-WindowDays * day)
	checks, err := m.counts(ctx, project, token, start, end, "ALIGN_COUNT")
	if err != nil {
		return nil, time.Time{}, err
	}
	passed, err := m.counts(ctx, project, token, start, end, "ALIGN_COUNT_TRUE")
	if err != nil {
		return nil, time.Time{}, err
	}
	var first time.Time
	for t, n := range checks {
		if n > 0 && (first.IsZero() || t.Before(first)) {
			first = t
		}
	}
	if !first.IsZero() {
		first = first.Add(-time.Hour)
	}
	return buckets(end, checks, passed), first, nil
}

// buckets lays the counts onto WindowDays slots, keyed by each point's end time. Monitoring aligns
// points to its own period boundaries, so a point lands in the slot whose 24 hours contain its end.
func buckets(end time.Time, checks, passed map[time.Time]int64) []Day {
	days := make([]Day, WindowDays)
	for i := range days {
		days[i].End = end.Add(-time.Duration(WindowDays-1-i) * day).UTC()
	}
	slot := func(t time.Time) int {
		ago := end.Sub(t)
		if ago < 0 {
			// Aligned to a period boundary just past the window's end: today's bucket.
			if -ago < day {
				return WindowDays - 1
			}
			return -1
		}
		if i := WindowDays - 1 - int(ago/day); i >= 0 {
			return i
		}
		return -1
	}
	for t, n := range checks {
		if i := slot(t); i >= 0 {
			days[i].Checks += n
		}
	}
	for t, n := range passed {
		if i := slot(t); i >= 0 {
			days[i].Passed += n
		}
	}
	return days
}

func (m *Monitoring) counts(ctx context.Context, project, token string, start, end time.Time, aligner string) (map[time.Time]int64, error) {
	q := url.Values{}
	q.Set("filter", filter)
	q.Set("interval.startTime", start.UTC().Format(time.RFC3339))
	q.Set("interval.endTime", end.UTC().Format(time.RFC3339))
	q.Set("aggregation.alignmentPeriod", "3600s")
	q.Set("aggregation.perSeriesAligner", aligner)
	q.Set("aggregation.crossSeriesReducer", "REDUCE_SUM")
	u := fmt.Sprintf("%s/projects/%s/timeSeries?%s", m.api, url.PathEscape(project), q.Encode())

	var body struct {
		TimeSeries []struct {
			Points []struct {
				Interval struct {
					EndTime time.Time `json:"endTime"`
				} `json:"interval"`
				Value struct {
					Int64Value string `json:"int64Value"`
				} `json:"value"`
			} `json:"points"`
		} `json:"timeSeries"`
	}
	b, err := gcp.Get(ctx, m.meta.Client, u, map[string]string{"Authorization": "Bearer " + token})
	if err == nil {
		err = json.Unmarshal(b, &body)
	}
	if err != nil {
		return nil, fmt.Errorf("timeSeries %s: %w", aligner, err)
	}
	out := map[time.Time]int64{}
	for _, ts := range body.TimeSeries {
		for _, p := range ts.Points {
			n, err := strconv.ParseInt(p.Value.Int64Value, 10, 64)
			if err != nil {
				return nil, fmt.Errorf("timeSeries %s: bad value %q", aligner, p.Value.Int64Value)
			}
			out[p.Interval.EndTime] += n
		}
	}
	return out, nil
}
