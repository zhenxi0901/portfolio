// Package server wires routes, middleware and the static site together.
package server

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"runtime"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/zhenxi0901/portfolio/api/internal/ask"
	"github.com/zhenxi0901/portfolio/api/internal/contact"
	"github.com/zhenxi0901/portfolio/api/internal/metrics"
	"github.com/zhenxi0901/portfolio/api/internal/ratelimit"
)

type Server struct {
	cfg     Config
	log     *slog.Logger
	metrics *metrics.Metrics
	reg     *prometheus.Registry
	ask     *ask.Service
	contact *contact.Service
	started time.Time
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

	return &Server{
		cfg:     cfg,
		log:     log,
		metrics: m,
		reg:     reg,
		ask:     ask.NewService(facts, llm, m, log),
		contact: contact.NewService(cfg.DataDir, cfg.ContactWebhook, m, log),
		started: time.Now(),
	}, nil
}

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

	askLimit := ratelimit.New(8, time.Minute)
	contactLimit := ratelimit.New(3, 10*time.Minute)
	mux.Handle("POST /api/ask", s.limit("ask", askLimit, http.HandlerFunc(s.ask.Handle)))
	mux.Handle("POST /api/contact", s.limit("contact", contactLimit, http.HandlerFunc(s.contact.Handle)))
	mux.HandleFunc("/api/", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no such endpoint"})
	})

	mux.Handle("/", staticHandler(s.cfg.StaticDir))

	var h http.Handler = mux
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
		ok, retry := l.Allow(clientIP(r, s.cfg.TrustProxy))
		if !ok {
			s.metrics.RateLimited.WithLabelValues(route).Inc()
			w.Header().Set("Retry-After", fmt.Sprintf("%.0f", retry.Seconds()+0.5))
			writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "Too many requests. Please wait a minute."})
			return
		}
		next.ServeHTTP(w, r)
	})
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
