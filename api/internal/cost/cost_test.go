package cost

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/zhenxi0901/portfolio/api/internal/gcp"
)

var quiet = slog.New(slog.NewTextHandler(io.Discard, nil))

func near(a, b float64) bool { return math.Abs(a-b) < 1e-9*math.Max(1, math.Abs(b)) }

// What Cloud Monitoring reported for the first 11.4 days of November 2026.
var november = Usage{Requests: 69_488, BillableSeconds: 8880.2756, VCPUSeconds: 9063.8453, GiBSeconds: 2220.5280, EgressBytes: 418_610_593}

var (
	nov1  = time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	nov12 = time.Date(2026, 11, 12, 9, 6, 24, 0, time.UTC)
)

func TestEstimateReceipt(t *testing.T) {
	r := Estimate(november, nov1, nov12)
	if !r.Available || len(r.Lines) != 4 {
		t.Fatalf("report: %+v", r)
	}
	cpu := 9063.8453 * 0.0000336
	mem := 2220.5280 * 0.0000035
	req := 69_488.0 / 1e6 * 0.40
	egress := 418_610_593.0 / (1 << 30) * 0.12
	for i, want := range []float64{cpu, mem, req, egress} {
		if !near(r.Lines[i].Cost, want) {
			t.Errorf("%s costs %v, want %v", r.Lines[i].Item, r.Lines[i].Cost, want)
		}
	}
	// Compute stays inside the free tier, so the bill is the data sent to the internet.
	if !near(r.ListPrice, cpu+mem+req+egress) || !near(r.FreeTier, cpu+mem+req) || !near(r.Bill, egress) {
		t.Errorf("list %v free %v bill %v", r.ListPrice, r.FreeTier, r.Bill)
	}
	if r.Lines[3].Free != 0 {
		t.Errorf("egress from Singapore has no free allowance, got %v", r.Lines[3].Free)
	}
	if !near(r.MonthDays, 30) || math.Abs(r.Days-11.3794) > 1e-3 {
		t.Errorf("days %v of %v", r.Days, r.MonthDays)
	}
	// Projected requests and bytes are whole numbers, so the projection matches scaling to a few ppm.
	close := func(a, b float64) bool { return math.Abs(a-b) < 1e-6*b }
	if scale := 30 / r.Days; !close(r.ProjectedListPrice, r.ListPrice*scale) || !close(r.ProjectedBill, egress*scale) {
		t.Errorf("projected %v / %v", r.ProjectedListPrice, r.ProjectedBill)
	}
	if !near(r.PerTenThousand, r.ListPrice/69_488*10_000) {
		t.Errorf("per 10k %v", r.PerTenThousand)
	}
	if !near(r.BilledSecondsPerRequest, 8880.2756/69_488) {
		t.Errorf("billed per request %v", r.BilledSecondsPerRequest)
	}
	// Three checks a minute since 1 Nov: about seven in ten requests were the site's own monitoring.
	minutes := nov12.Sub(nov1).Minutes()
	if !near(r.ProbeRequests, 3*minutes) || math.Abs(r.ProbeShare-0.7074) > 1e-3 {
		t.Errorf("probes %v share %v", r.ProbeRequests, r.ProbeShare)
	}
	if !near(r.ProbeBilledShare, 3*minutes*0.1/8880.2756) {
		t.Errorf("probe billed share %v", r.ProbeBilledShare)
	}
}

func TestFreeTierIsADollarAllowance(t *testing.T) {
	// A million vCPU-seconds in Singapore list at $33.60; the free tier covers 180,000 of them at the
	// Tier 1 price, $4.32, and the rest is billed.
	r := Estimate(Usage{Requests: 3_000_000, VCPUSeconds: 1_000_000, GiBSeconds: 500_000}, nov1, nov12)
	cpu, mem, req := r.Lines[0], r.Lines[1], r.Lines[2]
	if !near(cpu.Cost, 33.6) || !near(cpu.Free, 4.32) {
		t.Errorf("cpu %v free %v", cpu.Cost, cpu.Free)
	}
	if !near(mem.Cost, 1.75) || !near(mem.Free, 0.9) {
		t.Errorf("memory %v free %v", mem.Cost, mem.Free)
	}
	if !near(req.Cost, 1.2) || !near(req.Free, 0.8) {
		t.Errorf("requests %v free %v", req.Cost, req.Free)
	}
	if !near(r.Bill, (33.6-4.32)+(1.75-0.9)+(1.2-0.8)) {
		t.Errorf("bill %v", r.Bill)
	}
}

func TestNoProjectionBeforeADay(t *testing.T) {
	r := Estimate(november, nov1, nov1.Add(12*time.Hour))
	if r.ProjectedListPrice != 0 || r.ProjectedBill != 0 {
		t.Errorf("projected from half a day: %v / %v", r.ProjectedListPrice, r.ProjectedBill)
	}
	if empty := Estimate(Usage{}, nov1, nov12); empty.ProbeShare != 0 || empty.PerTenThousand != 0 || empty.ProbeBilledShare != 0 {
		t.Errorf("no traffic: %+v", empty)
	}
}

func TestPriceList(t *testing.T) {
	p := PriceList()
	if !near(p.FreeCreditVCPU, 4.32) || !near(p.FreeCreditMemory, 0.9) || !near(p.FreeCreditRequests, 0.8) {
		t.Errorf("free credits %v %v %v", p.FreeCreditVCPU, p.FreeCreditMemory, p.FreeCreditRequests)
	}
	// Three instances flat out for 30 days: 3 x (1 x 0.0000336 + 0.25 x 0.0000035) x 2,592,000.
	if !near(p.CeilingPerMonth, 3*(0.0000336+0.25*0.0000035)*2_592_000) {
		t.Errorf("ceiling %v", p.CeilingPerMonth)
	}
}

func TestMonthStart(t *testing.T) {
	sgt := time.FixedZone("SGT", 8*3600)
	for _, c := range []struct{ now, want time.Time }{
		{nov12, nov1},
		{time.Date(2026, 12, 31, 23, 59, 0, 0, time.UTC), time.Date(2026, 12, 1, 0, 0, 0, 0, time.UTC)},
		// 1 Dec 07:00 in Singapore is still November in UTC.
		{time.Date(2026, 12, 1, 7, 0, 0, 0, sgt), nov1},
	} {
		if got := MonthStart(c.now); !got.Equal(c.want) {
			t.Errorf("MonthStart(%v) = %v, want %v", c.now, got, c.want)
		}
	}
	if r := Estimate(Usage{}, time.Date(2027, 2, 1, 0, 0, 0, 0, time.UTC), time.Date(2027, 2, 2, 0, 0, 0, 0, time.UTC)); r.MonthDays != 28 {
		t.Errorf("February 2027 has %v days", r.MonthDays)
	}
}

type fakeSource struct {
	mu    sync.Mutex
	calls int
	err   error
}

func (f *fakeSource) Usage(context.Context, time.Time, time.Time) (Usage, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	if f.err != nil {
		return Usage{}, f.err
	}
	return november, nil
}

func TestServiceCachesAndKeepsTheLastGoodReport(t *testing.T) {
	src := &fakeSource{}
	s := New(src, quiet)
	now := nov12
	s.now = func() time.Time { return now }

	first := s.Report(context.Background())
	if !first.Available || first.Usage != november {
		t.Fatalf("first report: %+v", first)
	}
	now = now.Add(30 * time.Minute)
	if s.Report(context.Background()); src.calls != 1 {
		t.Errorf("read the API again within the hour: %d calls", src.calls)
	}
	src.err = errors.New("monitoring is down")
	now = now.Add(time.Hour)
	stale := s.Report(context.Background())
	if src.calls != 2 || !stale.Available || !stale.Stale || stale.Usage != november {
		t.Errorf("after a failed read: calls %d, report %+v", src.calls, stale)
	}
	// A failed read is retried a minute later, not on every request.
	if s.Report(context.Background()); src.calls != 2 {
		t.Errorf("retried at once: %d calls", src.calls)
	}
}

func TestServiceWithoutASource(t *testing.T) {
	r := New(nil, quiet).Report(context.Background())
	if r.Available || r.Reason == "" || r.Prices.AsOf != PricesAsOf || r.Lines == nil {
		t.Errorf("report without a source: %+v", r)
	}
	broken := New(&fakeSource{err: errors.New("no")}, quiet).Report(context.Background())
	if broken.Available || broken.Stale || broken.Reason == "" {
		t.Errorf("first read failed: %+v", broken)
	}
}

func TestMonitoringReadsEachMetric(t *testing.T) {
	meta := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Metadata-Flavor") != "Google" {
			http.Error(w, "missing header", http.StatusForbidden)
			return
		}
		if strings.HasSuffix(r.URL.Path, "/project/project-id") {
			_, _ = io.WriteString(w, "demo-project")
			return
		}
		_, _ = io.WriteString(w, `{"access_token":"tok","expires_in":3600}`)
	}))
	defer meta.Close()

	var mu sync.Mutex
	var filters []string
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer tok" || !strings.Contains(r.URL.Path, "/projects/demo-project/timeSeries") {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		q := r.URL.Query()
		f := q.Get("filter")
		mu.Lock()
		filters = append(filters, f)
		mu.Unlock()
		if q.Get("aggregation.perSeriesAligner") != "ALIGN_DELTA" || q.Get("aggregation.crossSeriesReducer") != "REDUCE_SUM" {
			http.Error(w, "bad aggregation", http.StatusBadRequest)
			return
		}
		// Two revisions' worth of points, as the API returns when a window spans a deploy.
		switch {
		case strings.Contains(f, "request_count"):
			_, _ = io.WriteString(w, `{"timeSeries":[{"points":[{"value":{"int64Value":"40000"}}]},{"points":[{"value":{"int64Value":"29488"}}]}]}`)
		case strings.Contains(f, "billable_instance_time"):
			_, _ = io.WriteString(w, `{"timeSeries":[{"points":[{"value":{"doubleValue":8880.5}}]}]}`)
		case strings.Contains(f, "cpu/allocation_time"):
			_, _ = io.WriteString(w, `{"timeSeries":[{"points":[{"value":{"doubleValue":9000}}]},{"points":[{"value":{"doubleValue":63.5}}]}]}`)
		case strings.Contains(f, "memory/allocation_time"):
			_, _ = io.WriteString(w, `{"timeSeries":[{"points":[{"value":{"doubleValue":2220.5}}]}]}`)
		case strings.Contains(f, "sent_bytes_count"):
			_, _ = io.WriteString(w, `{"timeSeries":[{"points":[{"value":{"int64Value":"418610593"}}]}]}`)
		default:
			_, _ = io.WriteString(w, `{}`)
		}
	}))
	defer api.Close()

	m := NewMonitoring(gcp.NewMetadata(), "portfolio")
	m.meta.Base, m.api = meta.URL, api.URL
	u, err := m.Usage(context.Background(), nov1, nov12)
	if err != nil {
		t.Fatal(err)
	}
	want := Usage{Requests: 69_488, BillableSeconds: 8880.5, VCPUSeconds: 9063.5, GiBSeconds: 2220.5, EgressBytes: 418_610_593}
	if u != want {
		t.Errorf("usage %+v, want %+v", u, want)
	}
	if len(filters) != 5 {
		t.Fatalf("%d reads, want 5", len(filters))
	}
	for _, f := range filters {
		if !strings.Contains(f, `resource.label.service_name = "portfolio"`) {
			t.Errorf("filter not limited to the service: %s", f)
		}
	}
	if sent := filters[4]; !strings.Contains(sent, `metric.label.kind = "internet"`) {
		t.Errorf("egress counts more than internet traffic: %s", sent)
	}
}

func TestMonitoringErrors(t *testing.T) {
	meta := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/project/project-id") {
			_, _ = io.WriteString(w, "demo-project")
			return
		}
		_, _ = io.WriteString(w, `{"access_token":"tok","expires_in":3600}`)
	}))
	defer meta.Close()
	for name, body := range map[string]string{
		"denied":    "",
		"not json":  "<html>",
		"bad value": `{"timeSeries":[{"points":[{"value":{"int64Value":"many"}}]}]}`,
	} {
		api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			if body == "" {
				http.Error(w, `{"error":{"code":403}}`, http.StatusForbidden)
				return
			}
			_, _ = io.WriteString(w, body)
		}))
		m := NewMonitoring(gcp.NewMetadata(), "portfolio")
		m.meta.Base, m.api = meta.URL, api.URL
		if _, err := m.Usage(context.Background(), nov1, nov12); err == nil {
			t.Errorf("%s: no error", name)
		}
		api.Close()
	}
}

// The constants describe the service Terraform deploys. When infra/ is checked out (CI), they must
// agree with it, or the receipt and its what-if price a service that isn't running.
func TestConstantsMatchInfra(t *testing.T) {
	dir := filepath.Join("..", "..", "..", "infra")
	read := func(name string) string {
		b, err := os.ReadFile(filepath.Join(dir, name))
		if errors.Is(err, os.ErrNotExist) {
			t.Skipf("infra/ is not checked out next to api/ (%v)", err)
		}
		if err != nil {
			t.Fatal(err)
		}
		return string(b)
	}
	main, vars, slo := read("main.tf"), read("variables.tf"), read("slo.tf")
	for _, want := range []string{`cpu = "1"`, `memory = "256Mi"`, `cpu_idle          = true`, `max_instance_request_concurrency = 80`} {
		if !strings.Contains(main, want) {
			t.Errorf("infra/main.tf no longer has %s", want)
		}
	}
	maxInstances := regexp.MustCompile(`(?s)variable "max_instances" \{.*?default\s*=\s*(\d+)`).FindStringSubmatch(vars)
	if maxInstances == nil || maxInstances[1] != "3" {
		t.Errorf("max_instances default is %v, want %d", maxInstances, MaxInstances)
	}
	if !strings.Contains(slo, `period           = "60s"`) {
		t.Errorf("the uptime check no longer runs every 60s")
	}
	regions := regexp.MustCompile(`selected_regions = \[([^\]]*)\]`).FindStringSubmatch(slo)
	if regions == nil || strings.Count(regions[1], `"`)/2 != ProbesPerMinute {
		t.Errorf("uptime check regions %v, want %d", regions, ProbesPerMinute)
	}
}
