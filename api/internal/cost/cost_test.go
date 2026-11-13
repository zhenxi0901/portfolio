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
	"sync/atomic"
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

func TestEgressIsTiered(t *testing.T) {
	for _, c := range []struct{ gib, want float64 }{
		{0, 0},
		{0.39, 0.39 * 0.12},
		{1024, 1024 * 0.12},
		{2048, 1024*0.12 + 1024*0.11},
		{20 * 1024, 1024*0.12 + 9*1024*0.11 + 10*1024*0.085},
	} {
		if got := EgressCost(c.gib); !near(got, c.want) {
			t.Errorf("EgressCost(%v) = %v, want %v", c.gib, got, c.want)
		}
	}
	// Past the first TiB the receipt shows the average price, so its line still adds up.
	r := Estimate(Usage{EgressBytes: 2048 * gib}, nov1, nov12)
	if l := r.Lines[3]; !near(l.Cost, 1024*0.12+1024*0.11) || !near(l.Price*l.Quantity, l.Cost) {
		t.Errorf("2 TiB: %+v", l)
	}
	if p := PriceList(); len(p.EgressTiers) != 3 || p.EgressTiers[0].PerGiB != p.PerGiBEgress || p.EgressTiers[2].UpToGiB != 0 {
		t.Errorf("tiers %+v", p.EgressTiers)
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

// slowSource answers once release is closed, unless the read's context ends first.
type slowSource struct {
	calls   atomic.Int32
	started chan struct{}
	release chan struct{}
}

func (f *slowSource) Usage(ctx context.Context, _, _ time.Time) (Usage, error) {
	f.calls.Add(1)
	if err := ctx.Err(); err != nil {
		return Usage{}, err
	}
	if d, ok := ctx.Deadline(); !ok || time.Until(d) > readFor {
		return Usage{}, errors.New("the read has no deadline of its own")
	}
	f.started <- struct{}{}
	select {
	case <-f.release:
		return november, nil
	case <-ctx.Done():
		return Usage{}, ctx.Err()
	}
}

func newSlowSource() *slowSource {
	return &slowSource{started: make(chan struct{}, 16), release: make(chan struct{})}
}

func TestServiceFirstVisitorsWaitForTheOneRead(t *testing.T) {
	src := newSlowSource()
	s := New(src, quiet)
	s.now = func() time.Time { return nov12 }
	reports := make(chan Report, 5)
	go func() { reports <- s.Report(context.Background()) }() // this one reads
	<-src.started
	// Visitors who arrive during the read have no report to be given, so they wait for that read
	// rather than starting their own or being turned away.
	const waiters = 4
	for range waiters {
		go func() { reports <- s.Report(context.Background()) }()
	}
	select {
	case r := <-reports:
		t.Fatalf("a visitor was answered before the read finished: %+v", r)
	case <-time.After(100 * time.Millisecond):
	}
	close(src.release)
	for range waiters + 1 {
		if r := <-reports; !r.Available || r.Usage != november {
			t.Errorf("a first visitor got %+v", r)
		}
	}
	if c := src.calls.Load(); c != 1 {
		t.Errorf("%d reads for visitors arriving together, want 1", c)
	}
}

// panickySource panics on its first read and answers after that.
type panickySource struct{ calls atomic.Int32 }

func (p *panickySource) Usage(context.Context, time.Time, time.Time) (Usage, error) {
	if p.calls.Add(1) == 1 {
		panic("boom")
	}
	return november, nil
}

func TestServiceRecoversFromAPanickingRead(t *testing.T) {
	src := &panickySource{}
	s := New(src, quiet)
	now := nov12
	s.now = func() time.Time { return now }
	if r := s.Report(context.Background()); r.Available || r.Reason == "" {
		t.Fatalf("after a read that panicked: %+v", r)
	}
	now = now.Add(retryAfter + time.Second)
	if r := s.Report(context.Background()); !r.Available || src.calls.Load() != 2 {
		t.Errorf("not read again after the panic: %+v, %d reads", r, src.calls.Load())
	}
}

func TestServiceNeverQueuesVisitorsBehindARead(t *testing.T) {
	src := newSlowSource()
	s := New(src, quiet)
	s.now = func() time.Time { return nov12 }
	old := Estimate(november, nov1, nov12.Add(-time.Hour))
	s.last, s.next = old, nov12 // an hour old, so the next visitor reads the API again

	reading := make(chan Report, 1)
	go func() { reading <- s.Report(context.Background()) }()
	<-src.started
	served := make(chan Report, 1)
	go func() { served <- s.Report(context.Background()) }()
	select {
	case r := <-served:
		if !r.Available || !r.Updated.Equal(old.Updated) {
			t.Errorf("served %+v while the read ran, want the last report", r)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("a visitor waited behind another visitor's read")
	}
	close(src.release)
	if r := <-reading; !r.Updated.Equal(nov12) {
		t.Errorf("the reader got a report from %v, want %v", r.Updated, nov12)
	}
	if c := src.calls.Load(); c != 1 {
		t.Errorf("%d reads, want 1", c)
	}
}

func TestServiceReadOutlivesTheVisitorWhoStartedIt(t *testing.T) {
	src := newSlowSource()
	close(src.release)
	gone, cancel := context.WithCancel(context.Background())
	cancel()
	s := New(src, quiet)
	s.now = func() time.Time { return nov12 }
	if r := s.Report(gone); !r.Available {
		t.Errorf("a visitor who left cancelled the read for everyone: %+v", r)
	}

	// And a first visitor who gives up waiting on someone else's read is answered at once.
	src2 := newSlowSource()
	s2 := New(src2, quiet)
	s2.now = func() time.Time { return nov12 }
	go s2.Report(context.Background())
	<-src2.started
	t0 := time.Now()
	waiter, stop := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer stop()
	if r, waited := s2.Report(waiter), time.Since(t0); r.Available || r.Reason == "" || waited < 40*time.Millisecond {
		t.Errorf("a visitor who gave up waiting got %+v after %v; it should wait until its own deadline", r, waited)
	}
	close(src2.release)
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
	var sent string
	for _, f := range filters {
		if !strings.Contains(f, `resource.label.service_name = "portfolio"`) {
			t.Errorf("filter not limited to the service: %s", f)
		}
		if strings.Contains(f, "sent_bytes_count") {
			sent = f
		}
	}
	if !strings.Contains(sent, `metric.label.kind = "internet"`) {
		t.Errorf("egress counts more than internet traffic: %q", sent)
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

// The cost page says which day the prices were read; it has to be the day these constants were.
func TestCostPageStatesWhenThePricesWereRead(t *testing.T) {
	b, err := os.ReadFile(filepath.Join("..", "..", "..", "web", "src", "app", "cost", "page.tsx"))
	if errors.Is(err, os.ErrNotExist) {
		t.Skipf("web/ is not checked out next to api/ (%v)", err)
	}
	if err != nil {
		t.Fatal(err)
	}
	d, err := time.Parse(time.DateOnly, PricesAsOf)
	if err != nil {
		t.Fatal(err)
	}
	if want := d.Format("2 January 2006"); !strings.Contains(string(b), want) {
		t.Errorf("web/src/app/cost/page.tsx does not give %s as the prices' date", want)
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
