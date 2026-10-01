// Package metrics holds the Prometheus collectors and the rolling latency window behind /api/status.
package metrics

import (
	"slices"
	"sync"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
)

type Metrics struct {
	Requests    *prometheus.CounterVec
	Duration    *prometheus.HistogramVec
	RateLimited *prometheus.CounterVec
	Ask         *prometheus.CounterVec
	LLMDuration prometheus.Histogram
	LLMTokens   *prometheus.CounterVec
	Contact     *prometheus.CounterVec
	Window      *Window
}

func New(reg prometheus.Registerer, version, commit string) *Metrics {
	m := &Metrics{
		Requests: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "http_requests_total", Help: "HTTP requests by route, method and status code.",
		}, []string{"route", "method", "code"}),
		Duration: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Name:    "http_request_duration_seconds",
			Help:    "HTTP request latency by route.",
			Buckets: []float64{.001, .0025, .005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10},
		}, []string{"route"}),
		RateLimited: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "ratelimit_rejections_total", Help: "Requests rejected by the per-client rate limiter.",
		}, []string{"route"}),
		Ask: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "ask_requests_total", Help: "Ask console answers by mode (llm or retrieval) and cache hit.",
		}, []string{"mode", "cached"}),
		LLMDuration: prometheus.NewHistogram(prometheus.HistogramOpts{
			Name: "ask_llm_duration_seconds", Help: "Latency of upstream LLM completions.",
			Buckets: prometheus.ExponentialBuckets(0.1, 2, 9),
		}),
		LLMTokens: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "ask_llm_tokens_total", Help: "Tokens used by upstream LLM completions.",
		}, []string{"kind"}),
		Contact: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "contact_submissions_total", Help: "Contact form submissions by result.",
		}, []string{"result"}),
		Window: NewWindow(512),
	}
	buildInfo := prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "portfolio_build_info", Help: "Build metadata.",
		ConstLabels: prometheus.Labels{"version": version, "commit": commit},
	})
	buildInfo.Set(1)
	reg.MustRegister(m.Requests, m.Duration, m.RateLimited, m.Ask, m.LLMDuration, m.LLMTokens, m.Contact, buildInfo,
		collectors.NewGoCollector(), collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}))
	return m
}

// Window keeps the last N request latencies (ms) for the live status panel.
type Window struct {
	mu    sync.Mutex
	buf   []float64
	next  int
	full  bool
	total uint64
}

func NewWindow(size int) *Window { return &Window{buf: make([]float64, size)} }

func (w *Window) Add(ms float64) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.buf[w.next] = ms
	w.next = (w.next + 1) % len(w.buf)
	if w.next == 0 {
		w.full = true
	}
	w.total++
}

func (w *Window) Total() uint64 {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.total
}

// ordered returns the samples oldest first.
func (w *Window) ordered() []float64 {
	if !w.full {
		return slices.Clone(w.buf[:w.next])
	}
	return append(slices.Clone(w.buf[w.next:]), w.buf[:w.next]...)
}

// Recent returns up to n of the newest samples, oldest first.
func (w *Window) Recent(n int) []float64 {
	w.mu.Lock()
	defer w.mu.Unlock()
	all := w.ordered()
	if len(all) > n {
		all = all[len(all)-n:]
	}
	if all == nil {
		all = []float64{}
	}
	return all
}

// Percentiles returns p50, p95 and p99 over the window (nearest-rank).
func (w *Window) Percentiles() (p50, p95, p99 float64) {
	w.mu.Lock()
	s := w.ordered()
	w.mu.Unlock()
	if len(s) == 0 {
		return 0, 0, 0
	}
	slices.Sort(s)
	at := func(q float64) float64 {
		i := int(q*float64(len(s))+0.999999) - 1
		return s[max(0, min(i, len(s)-1))]
	}
	return at(0.50), at(0.95), at(0.99)
}
