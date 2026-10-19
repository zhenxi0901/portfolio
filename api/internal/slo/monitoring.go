package slo

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Monitoring reads uptime-check results from the Cloud Monitoring API with the runtime identity's
// token from the metadata server. Standard library only: no client libraries in the image.
//
// It counts every uptime check in the project; this project has one, on /api/health.
type Monitoring struct {
	client   *http.Client
	metadata string // metadata server base URL
	api      string // Monitoring API base URL

	mu      sync.Mutex
	project string
	token   string
	expires time.Time
}

func NewMonitoring() *Monitoring {
	return &Monitoring{
		client:   &http.Client{Timeout: 8 * time.Second},
		metadata: "http://metadata.google.internal/computeMetadata/v1",
		api:      "https://monitoring.googleapis.com/v3",
	}
}

const filter = `metric.type = "monitoring.googleapis.com/uptime_check/check_passed" AND resource.type = "uptime_url"`

// Days returns WindowDays 24-hour buckets ending at end, oldest first; buckets with no data are zero.
func (m *Monitoring) Days(ctx context.Context, end time.Time) ([]Day, error) {
	project, token, err := m.credentials(ctx)
	if err != nil {
		return nil, err
	}
	start := end.Add(-WindowDays * day)
	checks, err := m.counts(ctx, project, token, start, end, "ALIGN_COUNT")
	if err != nil {
		return nil, err
	}
	passed, err := m.counts(ctx, project, token, start, end, "ALIGN_COUNT_TRUE")
	if err != nil {
		return nil, err
	}
	return buckets(end, checks, passed), nil
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
	q.Set("aggregation.alignmentPeriod", "86400s")
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
	if err := m.getJSON(ctx, u, map[string]string{"Authorization": "Bearer " + token}, &body); err != nil {
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

// credentials returns the project ID and an access token, both from the metadata server.
func (m *Monitoring) credentials(ctx context.Context) (string, string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	meta := map[string]string{"Metadata-Flavor": "Google"}
	if m.project == "" {
		b, err := m.get(ctx, m.metadata+"/project/project-id", meta)
		if err != nil {
			return "", "", fmt.Errorf("project id: %w", err)
		}
		m.project = strings.TrimSpace(string(b))
	}
	if m.token == "" || time.Now().After(m.expires) {
		var tok struct {
			AccessToken string `json:"access_token"`
			ExpiresIn   int    `json:"expires_in"`
		}
		if err := m.getJSON(ctx, m.metadata+"/instance/service-accounts/default/token", meta, &tok); err != nil {
			return "", "", fmt.Errorf("token: %w", err)
		}
		m.token = tok.AccessToken
		// Refresh a minute early so a token never expires mid-request.
		m.expires = time.Now().Add(time.Duration(tok.ExpiresIn)*time.Second - time.Minute)
	}
	return m.project, m.token, nil
}

func (m *Monitoring) getJSON(ctx context.Context, u string, headers map[string]string, v any) error {
	b, err := m.get(ctx, u, headers)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, v)
}

func (m *Monitoring) get(ctx context.Context, u string, headers map[string]string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := m.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(b[:min(len(b), 200)])))
	}
	return b, nil
}
