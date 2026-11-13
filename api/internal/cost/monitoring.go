package cost

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/url"
	"strconv"
	"sync"
	"time"

	"github.com/zhenxi0901/portfolio/api/internal/gcp"
)

// Monitoring reads the service's own usage metrics from the Cloud Monitoring API with the runtime
// identity's token (monitoring.viewer, which /api/slo already uses). Standard library only.
type Monitoring struct {
	meta    *gcp.Metadata
	api     string
	service string // the Cloud Run service's name (K_SERVICE)
}

func NewMonitoring(meta *gcp.Metadata, service string) *Monitoring {
	return &Monitoring{meta: meta, api: "https://monitoring.googleapis.com/v3", service: service}
}

// The metrics Cloud Run bills by: https://cloud.google.com/run/docs/monitoring (run.googleapis.com/...).
const (
	metricRequests = "request_count"
	metricBillable = "container/billable_instance_time"
	metricCPU      = "container/cpu/allocation_time"
	metricMemory   = "container/memory/allocation_time"
	metricSent     = "container/network/sent_bytes_count"
)

func (m *Monitoring) Usage(ctx context.Context, start, end time.Time) (Usage, error) {
	project, token, err := m.meta.Credentials(ctx)
	if err != nil {
		return Usage{}, err
	}
	reads := []struct{ metric, extra string }{
		{metricRequests, ""},
		{metricBillable, ""},
		{metricCPU, ""},
		{metricMemory, ""},
		// Only bytes to the internet are billed as egress; "google" and "private" traffic is not.
		{metricSent, ` AND metric.label.kind = "internet"`},
	}
	// All at once: the read takes as long as the slowest metric, not the five added up.
	vals := make([]float64, len(reads))
	errs := make([]error, len(reads))
	var wg sync.WaitGroup
	for i, r := range reads {
		wg.Go(func() { vals[i], errs[i] = m.sum(ctx, project, token, r.metric, r.extra, start, end) })
	}
	wg.Wait()
	if err := errors.Join(errs...); err != nil {
		return Usage{}, err
	}
	return Usage{
		Requests:        int64(math.Round(vals[0])),
		BillableSeconds: vals[1],
		VCPUSeconds:     vals[2],
		GiBSeconds:      vals[3],
		EgressBytes:     int64(math.Round(vals[4])),
	}, nil
}

// sum adds up one delta metric over [start, end] across every revision of the service: a single
// alignment period the length of the window gives one point per series.
func (m *Monitoring) sum(ctx context.Context, project, token, metric, extra string, start, end time.Time) (float64, error) {
	period := int64(end.Sub(start).Seconds())
	if period < 60 {
		period = 60 // the API's minimum alignment period
	}
	q := url.Values{}
	q.Set("filter", fmt.Sprintf(`metric.type = "run.googleapis.com/%s" AND resource.type = "cloud_run_revision" AND resource.label.service_name = %q%s`, metric, m.service, extra))
	q.Set("interval.startTime", start.UTC().Format(time.RFC3339))
	q.Set("interval.endTime", end.UTC().Format(time.RFC3339))
	q.Set("aggregation.alignmentPeriod", strconv.FormatInt(period, 10)+"s")
	q.Set("aggregation.perSeriesAligner", "ALIGN_DELTA")
	q.Set("aggregation.crossSeriesReducer", "REDUCE_SUM")
	u := fmt.Sprintf("%s/projects/%s/timeSeries?%s", m.api, url.PathEscape(project), q.Encode())

	var body struct {
		TimeSeries []struct {
			Points []struct {
				Value struct {
					Int64Value  *string  `json:"int64Value"`
					DoubleValue *float64 `json:"doubleValue"`
				} `json:"value"`
			} `json:"points"`
		} `json:"timeSeries"`
	}
	b, err := gcp.Get(ctx, m.meta.Client, u, map[string]string{"Authorization": "Bearer " + token})
	if err == nil {
		err = json.Unmarshal(b, &body)
	}
	if err != nil {
		return 0, fmt.Errorf("timeSeries %s: %w", metric, err)
	}
	var total float64
	for _, ts := range body.TimeSeries {
		for _, p := range ts.Points {
			switch {
			case p.Value.DoubleValue != nil:
				total += *p.Value.DoubleValue
			case p.Value.Int64Value != nil:
				n, err := strconv.ParseInt(*p.Value.Int64Value, 10, 64)
				if err != nil {
					return 0, fmt.Errorf("timeSeries %s: bad value %q", metric, *p.Value.Int64Value)
				}
				total += float64(n)
			}
		}
	}
	return total, nil
}
