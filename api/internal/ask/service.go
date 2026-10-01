package ask

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/zhenxi0901/portfolio/api/internal/metrics"
)

type Service struct {
	facts []Fact
	llm   Completer
	m     *metrics.Metrics
	log   *slog.Logger
	cache *answerCache
}

func NewService(facts []Fact, llm Completer, m *metrics.Metrics, log *slog.Logger) *Service {
	return &Service{facts: facts, llm: llm, m: m, log: log, cache: newCache(256, 10*time.Minute)}
}

func (s *Service) FactCount() int { return len(s.facts) }

type source struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

type response struct {
	Answer    string   `json:"answer"`
	Sources   []source `json:"sources"`
	Mode      string   `json:"mode"`
	LatencyMs int64    `json:"latency_ms"`
	Cached    bool     `json:"cached"`
}

func (s *Service) Handle(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	var req struct {
		Question string `json:"question"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 2048)
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "Send JSON like {\"question\": \"...\"}.")
		return
	}
	q := strings.TrimSpace(req.Question)
	if n := utf8.RuneCountInString(q); n < 3 || n > 300 {
		writeErr(w, http.StatusBadRequest, "Questions need to be between 3 and 300 characters.")
		return
	}

	key := strings.ToLower(strings.Join(strings.Fields(q), " "))
	if hit, ok := s.cache.get(key); ok {
		hit.Cached = true
		hit.LatencyMs = time.Since(start).Milliseconds()
		s.m.Ask.WithLabelValues(hit.Mode, "true").Inc()
		writeJSON(w, hit)
		return
	}

	res := Retrieve(q, s.facts)
	out := response{Answer: res.Answer, Mode: "retrieval", Sources: []source{}}
	for _, f := range res.Sources {
		out.Sources = append(out.Sources, source{f.ID, f.Title})
	}

	// With an LLM configured, it rewrites the answer from the top facts; retrieval is the fallback.
	if s.llm != nil && len(res.Sources) > 0 {
		ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
		defer cancel()
		t0 := time.Now()
		answer, pt, ct, err := s.llm.Complete(ctx, systemPrompt, buildUserPrompt(q, res.Sources))
		s.m.LLMDuration.Observe(time.Since(t0).Seconds())
		if err != nil {
			s.log.Warn("ask: llm failed, falling back to retrieval", "err", err)
		} else {
			out.Answer, out.Mode = tidy(answer), "llm"
			s.m.LLMTokens.WithLabelValues("prompt").Add(float64(pt))
			s.m.LLMTokens.WithLabelValues("completion").Add(float64(ct))
		}
	}

	s.cache.put(key, out)
	out.LatencyMs = time.Since(start).Milliseconds()
	s.m.Ask.WithLabelValues(out.Mode, "false").Inc()
	writeJSON(w, out)
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// answerCache is a small TTL cache; popular questions skip retrieval and the LLM entirely.
type answerCache struct {
	mu    sync.Mutex
	max   int
	ttl   time.Duration
	items map[string]cacheItem
}

type cacheItem struct {
	v       response
	expires time.Time
}

func newCache(max int, ttl time.Duration) *answerCache {
	return &answerCache{max: max, ttl: ttl, items: map[string]cacheItem{}}
}

func (c *answerCache) get(k string) (response, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	it, ok := c.items[k]
	if !ok || time.Now().After(it.expires) {
		delete(c.items, k)
		return response{}, false
	}
	return it.v, true
}

func (c *answerCache) put(k string, v response) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.items) >= c.max {
		// Evict the entry closest to expiry.
		var oldest string
		var at time.Time
		for key, it := range c.items {
			if oldest == "" || it.expires.Before(at) {
				oldest, at = key, it.expires
			}
		}
		delete(c.items, oldest)
	}
	c.items[k] = cacheItem{v: v, expires: time.Now().Add(c.ttl)}
}
