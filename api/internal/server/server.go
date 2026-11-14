// Package server wires routes, middleware and the static site together.
package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/zhenxi0901/portfolio/api/internal/activity"
	"github.com/zhenxi0901/portfolio/api/internal/ask"
	"github.com/zhenxi0901/portfolio/api/internal/card"
	"github.com/zhenxi0901/portfolio/api/internal/contact"
	"github.com/zhenxi0901/portfolio/api/internal/cost"
	"github.com/zhenxi0901/portfolio/api/internal/gcp"
	"github.com/zhenxi0901/portfolio/api/internal/lab"
	"github.com/zhenxi0901/portfolio/api/internal/mcp"
	"github.com/zhenxi0901/portfolio/api/internal/metrics"
	"github.com/zhenxi0901/portfolio/api/internal/ratelimit"
	"github.com/zhenxi0901/portfolio/api/internal/slo"
	"github.com/zhenxi0901/portfolio/api/internal/tracing"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
)

type Server struct {
	cfg     Config
	log     *slog.Logger
	metrics *metrics.Metrics
	reg     *prometheus.Registry
	ask     *ask.Service
	contact *contact.Service
	slo     *slo.Service
	cost    *cost.Service
	// The home page's "Recently" list: the build's snapshot, refreshed from GitHub on Cloud Run.
	activity *activity.Service
	// Delivery numbers baked into the image (/delivery.json) for the profile card; nil if absent.
	delivery *card.Delivery
	started  time.Time
	// Flushes spans still waiting for export; called on shutdown.
	closeTraces func(context.Context) error
	visits      atomic.Int64 // requests other than probes, to spot an instance's first visitor
}

func New(cfg Config, log *slog.Logger) (*Server, error) {
	reg := prometheus.NewRegistry()
	m := metrics.New(reg, cfg.Version, cfg.Commit)

	facts, err := ask.LoadFacts(cfg.KnowledgePath)
	if err != nil {
		return nil, fmt.Errorf("load knowledge: %w", err)
	}
	var llm ask.Completer
	if cfg.LLMBaseURL != "" && cfg.LLMAPIKey != "" && cfg.LLMModel != "" {
		llm = ask.NewOpenAICompatible(cfg.LLMBaseURL, cfg.LLMAPIKey, cfg.LLMModel)
		log.Info("ask: LLM mode enabled", "model", cfg.LLMModel)
	} else {
		log.Info("ask: retrieval-only mode (set LLM_BASE_URL, LLM_API_KEY and LLM_MODEL to enable the LLM)")
	}

	meta := gcp.NewMetadata()
	var uptime slo.Source
	var usage cost.Source
	if cfg.SLOFromMonitoring {
		uptime = slo.NewMonitoring(meta)
		usage = cost.NewMonitoring(meta, cfg.Service)
	}
	var export sdktrace.SpanExporter
	if cfg.TraceExport {
		export = tracing.NewCloudTrace(meta)
	}
	rec, closeTraces := tracing.Setup("portfolio", cfg.Version+"@"+short(cfg.Commit), export)

	delivery, err := card.LoadDelivery(filepath.Join(cfg.StaticDir, "delivery.json"))
	switch {
	case errors.Is(err, os.ErrNotExist):
		log.Info("card: no delivery.json; the profile card shows the live numbers only")
	case err != nil:
		// The file is there but unreadable: the card would quietly show "n/a" everywhere.
		log.Error("card: delivery.json does not parse", "err", err)
	}

	recent, err := activity.LoadSnapshot(filepath.Join(cfg.StaticDir, "activity.json"))
	switch {
	case errors.Is(err, os.ErrNotExist):
		log.Info("activity: no activity.json; the Recently list starts empty")
	case err != nil:
		log.Error("activity: activity.json does not parse", "err", err)
	}

	return &Server{
		activity: activity.New(activity.Config{User: "zhenxi0901", Releases: []string{"zhenxi0901/dora-card"}}, recent, cfg.ActivityFromGitHub, log),
		delivery: delivery,
		cfg:      cfg,
		log:      log,
		metrics:  m,
		reg:      reg,
		ask:      ask.NewService(facts, llm, m, log).WithTraces(rec, cfg.TraceExport),
		contact:  contact.NewService(cfg.DataDir, cfg.ContactWebhook, cfg.ContactRequireWebhook, m, log).WithSyntheticToken(cfg.ContactSyntheticToken),
		slo:      slo.New(uptime, log),
		cost:     cost.New(usage, log),
		started:  time.Now(),

		closeTraces: closeTraces,
	}, nil
}

// Close flushes anything still buffered (spans waiting for export).
func (s *Server) Close(ctx context.Context) error { return s.closeTraces(ctx) }

// mcpPerMinute is how many MCP requests one client may send a minute (per instance).
const mcpPerMinute = 60

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		_, _ = w.Write([]byte("ok"))
	})
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, _ *http.Request) {
		if s.ask.FactCount() == 0 {
			http.Error(w, "no knowledge loaded", http.StatusServiceUnavailable)
			return
		}
		_, _ = w.Write([]byte("ready"))
	})
	// Cloud Run's front end reserves some paths ending in "z" (/healthz, /readyz), so they work for
	// container probes but never reach the app from outside. External checks use /api/health.
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if s.ask.FactCount() == 0 {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "not ready"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.Handle("GET /metrics", promhttp.HandlerFor(s.reg, promhttp.HandlerOpts{}))
	mux.HandleFunc("GET /api/status", s.handleStatus)
	// This site's availability as Cloud Monitoring's uptime checks saw it. Cached for 5 minutes.
	mux.HandleFunc("GET /api/slo", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=60")
		writeJSON(w, http.StatusOK, s.slo.Report(r.Context()))
	})
	// What the site has cost this month: its usage from Cloud Monitoring at list prices, and the
	// price list for the page's what-if. Usage is read at most once an hour.
	mux.HandleFunc("GET /api/cost", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=300")
		writeJSON(w, http.StatusOK, s.cost.Report(r.Context()))
	})
	// Recent public work on GitHub for the home page's "Recently" list: pull requests merged or in
	// review, and releases. GitHub is read at most hourly, on Cloud Run only.
	mux.HandleFunc("GET /api/activity", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=300")
		writeJSON(w, http.StatusOK, s.activity.Feed(r.Context()))
	})
	// The same availability as a shields.io endpoint badge, for the GitHub profile.
	mux.HandleFunc("GET /api/badge/uptime", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=300")
		writeJSON(w, http.StatusOK, slo.Badge(s.slo.Report(r.Context())))
	})
	// The live card on the GitHub profile: ?theme=light for light mode.
	mux.HandleFunc("GET /api/card.svg", func(w http.ResponseWriter, r *http.Request) {
		svg := card.SVG(s.cardData(r.Context()), r.URL.Query().Get("theme") != "light")
		w.Header().Set("Content-Type", "image/svg+xml; charset=utf-8")
		w.Header().Set("Cache-Control", "public, max-age=300")
		_, _ = w.Write(svg)
	})
	// The same card as text, with ANSI colours: what `curl <site>` gets, at an address of its own.
	mux.HandleFunc("GET /api/card.txt", s.handleTextCard)
	// The live map on the GitHub profile: the request path, drawn with this instance's own numbers.
	mux.HandleFunc("GET /api/map.svg", func(w http.ResponseWriter, r *http.Request) {
		p50, p95, _ := s.metrics.Window.Percentiles()
		live := card.Live{P50: p50, P95: p95, Up: time.Since(s.started)}
		svg := card.Map(s.cardData(r.Context()), live, r.URL.Query().Get("theme") != "light")
		w.Header().Set("Content-Type", "image/svg+xml; charset=utf-8")
		w.Header().Set("Cache-Control", "public, max-age=300")
		_, _ = w.Write(svg)
	})

	askLimit := ratelimit.New(8, time.Minute)
	contactLimit := ratelimit.New(3, 10*time.Minute)
	// Rate limiting sits outside the trace, so a flood of 429s creates no spans.
	mux.Handle("POST /api/ask", s.limit("ask", askLimit, s.traced("POST /api/ask", http.HandlerFunc(s.ask.Handle))))
	mux.Handle("POST /api/contact", s.limit("contact", contactLimit, http.HandlerFunc(s.contact.Handle)))
	// Break it yourself (/break): delays and 503s a visitor asks for, on their own requests only.
	// 240 a minute per client covers comparing every client strategy in one go.
	labLimit := ratelimit.New(240, time.Minute)
	visitor := func(r *http.Request) string { return rateKey(clientIP(r, s.cfg.TrustProxy)) }
	mux.Handle("GET "+labRoute, s.limit("lab", labLimit, lab.New(visitor)))
	// The catch-all wins over a method-specific pattern, so a known path with the wrong method would
	// read as 404; answer 405 with the allowed method instead.
	apiMethods := map[string]string{
		"/api/health": "GET, HEAD", "/api/status": "GET, HEAD", "/api/slo": "GET, HEAD", "/api/cost": "GET, HEAD", "/api/badge/uptime": "GET, HEAD", "/api/card.svg": "GET, HEAD", "/api/card.txt": "GET, HEAD", "/api/map.svg": "GET, HEAD",
		"/api/ask": "POST", "/api/contact": "POST", labRoute: "GET, HEAD",
	}
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		if allow, ok := apiMethods[r.URL.Path]; ok {
			w.Header().Set("Allow", allow)
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no such endpoint"})
	})

	// The site as tools for AI agents: a Model Context Protocol server (internal/mcp, mcptools.go).
	// Not traced: one client at this limit would be ~10M spans a month, four times Cloud Trace's
	// free allowance, for a route whose work is the same retrieval /api/ask already traces.
	mcpLimit := ratelimit.New(mcpPerMinute, time.Minute)
	mux.Handle("/mcp", s.limit("mcp", mcpLimit, s.mcpServer()))

	mux.Handle("/", s.forTerminals(staticHandler(s.cfg.StaticDir)))

	var h http.Handler = mux
	h = s.timing(h)
	h = s.observe(h)
	h = cors(s.cfg.AllowedOrigins, h)
	h = securityHeaders(h)
	h = requestID(h)
	h = recoverer(s.log, h)
	return h
}

type statusResponse struct {
	Status        string    `json:"status"`
	Version       string    `json:"version"`
	Commit        string    `json:"commit"`
	Region        string    `json:"region"`
	StartedAt     time.Time `json:"started_at"`
	UptimeSeconds float64   `json:"uptime_seconds"`
	RequestsTotal uint64    `json:"requests_total"`
	LatencyMs     struct {
		P50 float64 `json:"p50"`
		P95 float64 `json:"p95"`
		P99 float64 `json:"p99"`
	} `json:"latency_ms"`
	RecentMs   []float64 `json:"recent_ms"`
	GoVersion  string    `json:"go_version"`
	Goroutines int       `json:"goroutines"`
	HeapMB     float64   `json:"heap_mb"`
}

func (s *Server) handleStatus(w http.ResponseWriter, _ *http.Request) {
	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)
	resp := statusResponse{
		Status:        "ok",
		Version:       s.cfg.Version,
		Commit:        short(s.cfg.Commit),
		Region:        s.cfg.Region,
		StartedAt:     s.started.UTC(),
		UptimeSeconds: time.Since(s.started).Seconds(),
		RequestsTotal: s.metrics.Window.Total(),
		RecentMs:      s.metrics.Window.Recent(60),
		GoVersion:     runtime.Version(),
		Goroutines:    runtime.NumGoroutine(),
		HeapMB:        float64(ms.HeapAlloc) / (1 << 20),
	}
	resp.LatencyMs.P50, resp.LatencyMs.P95, resp.LatencyMs.P99 = s.metrics.Window.Percentiles()
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, resp)
}

// limit applies a per-client token bucket and returns 429 with Retry-After when it is empty.
func (s *Server) limit(route string, l *ratelimit.Limiter, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ok, retry := l.Allow(rateKey(clientIP(r, s.cfg.TrustProxy)))
		if !ok {
			s.metrics.RateLimited.WithLabelValues(route).Inc()
			// An MCP client expects JSON-RPC even here; anything else could read as a broken server.
			if route == "mcp" {
				mcp.TooManyRequests(w, mcpPerMinute, retry)
				return
			}
			// Whole seconds, rounded up: %.0f of x+0.5 rounds half to even, so 12 s came out as 12, 13 s as 14.
			w.Header().Set("Retry-After", strconv.Itoa(int(math.Ceil(retry.Seconds()))))
			writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "Too many requests. Please wait a minute."})
			return
		}
		next.ServeHTTP(w, r)
	})
}

// traced starts the request's server span; the handler's own spans hang off it. Only the Ask API is
// traced: it is the one route with a pipeline worth looking inside.
func (s *Server) traced(route string, next http.Handler) http.Handler {
	tr := otel.Tracer("portfolio/http")
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx, span := tr.Start(r.Context(), route,
			trace.WithSpanKind(trace.SpanKindServer),
			trace.WithAttributes(attribute.String("http.request.method", r.Method), attribute.String("http.route", route)))
		defer span.End()
		rec := &statusRecorder{ResponseWriter: w, code: http.StatusOK}
		next.ServeHTTP(rec, r.WithContext(ctx))
		span.SetAttributes(attribute.Int("http.response.status_code", rec.code))
		if rec.code >= 500 {
			span.SetStatus(codes.Error, http.StatusText(rec.code))
		}
	})
}

// cardData is what the profile card and the terminal card both show.
func (s *Server) cardData(ctx context.Context) card.Data {
	rep := s.slo.Report(ctx)
	var through time.Time
	if n := len(rep.Days); n > 0 {
		through = rep.Days[n-1].End
	}
	return card.Data{
		Commit: short(s.cfg.Commit), Region: s.cfg.Region,
		SLOAvailable: rep.Available, Availability: rep.Availability, BudgetRemaining: rep.BudgetRemaining, Releases: rep.Releases,
		SLOUpdated: rep.Updated, SLOThrough: through, SLOStale: rep.Stale, SLOReason: rep.Reason, UptimeLabel: rep.UptimeLabel(),
		Delivery: s.delivery, Now: time.Now(),
	}
}

// forTerminals answers a command-line client that asks for the home page with a text card instead
// of HTML it cannot render. Only "/" and only when the client did not ask for HTML, so scripts that
// fetch pages (and say so in Accept) are unaffected.
func (s *Server) forTerminals(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" || (r.Method != http.MethodGet && r.Method != http.MethodHead) {
			next.ServeHTTP(w, r)
			return
		}
		// Either answer depends on who asked, and a cache in between has to know that.
		w.Header().Set("Vary", "User-Agent, Accept")
		if !isTerminal(r) {
			next.ServeHTTP(w, r)
			return
		}
		s.handleTextCard(w, r)
	})
}

func (s *Server) handleTextCard(w http.ResponseWriter, r *http.Request) {
	scheme := "http"
	if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(card.Terminal(s.cardData(r.Context()), scheme+"://"+r.Host))
}

func isTerminal(r *http.Request) bool {
	if acceptsHTML(r.Header.Values("Accept")) {
		return false
	}
	ua := strings.ToLower(r.UserAgent())
	for _, p := range []string{"curl/", "wget/", "httpie/"} {
		if strings.HasPrefix(ua, p) {
			return true
		}
	}
	return false
}

// acceptsHTML reports whether an Accept header names text/html (in any case) with a quality above
// zero. "text/html;q=0" is a client saying it does not want HTML, so it gets the text card; "*/*"
// alone does not count, or curl's default would get the page it cannot render.
func acceptsHTML(values []string) bool {
	for _, v := range values {
		for _, rng := range strings.Split(v, ",") {
			mediaType, params, _ := strings.Cut(rng, ";")
			if !strings.EqualFold(strings.TrimSpace(mediaType), "text/html") {
				continue
			}
			q := 1.0
			for _, p := range strings.Split(params, ";") {
				k, val, _ := strings.Cut(strings.TrimSpace(p), "=")
				if strings.EqualFold(strings.TrimSpace(k), "q") {
					if f, err := strconv.ParseFloat(strings.TrimSpace(val), 64); err == nil {
						q = f
					}
				}
			}
			if q > 0 {
				return true
			}
		}
	}
	return false
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func short(commit string) string {
	if len(commit) > 7 {
		return commit[:7]
	}
	return commit
}
