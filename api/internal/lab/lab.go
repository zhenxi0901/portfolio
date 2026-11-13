// Package lab serves the "break it yourself" page: an endpoint that injects the delays and errors a
// visitor asks for into that visitor's own requests, within fixed limits, so a client's timeouts,
// retries, circuit breaker and hedging can be watched against a real server instead of a mock.
//
// It never touches what the site's SLO measures: the uptime checks call /api/health, and lab
// requests are kept out of the live latency figures on /status (labRoute in internal/server).
package lab

import (
	"context"
	"encoding/json"
	"math"
	"math/rand/v2"
	"net/http"
	"strconv"
	"time"
)

// The limits on what a visitor can ask for, per request.
const (
	MaxFailRate = 0.6                     // share of requests answered with a 503
	MaxDelay    = 1500 * time.Millisecond // how long a slow response is held
	// Requests held open at once on one instance, across every visitor. A delayed request keeps an
	// instance billed while it waits, so this bounds what a crowd of slow requests can cost.
	MaxInFlight = 24
)

// StatusClientClosed is what a request the client hung up on is logged as (nginx's 499): nobody
// is left to read it, but a 200 in the logs would say the server answered.
const StatusClientClosed = 499

// Reply is the body of every answer, failed or not.
type Reply struct {
	OK bool `json:"ok"`
	// "none", "slow", "error" or "slow+error": what the server did to this request.
	Fault    string  `json:"fault"`
	ServedMs float64 `json:"served_ms"`
}

type Handler struct {
	inflight chan struct{}
	rand     func() float64
	sleep    func(context.Context, time.Duration) error
}

func New() *Handler {
	return &Handler{inflight: make(chan struct{}, MaxInFlight), rand: rand.Float64, sleep: sleep}
}

// sleep waits for d, or until the client gives up.
func sleep(ctx context.Context, d time.Duration) error {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-t.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// Faults are what a request asked for, clamped to the limits.
type Faults struct {
	Fail  float64       // probability of a 503
	Slow  float64       // probability of a delay
	Delay time.Duration // how long a delayed response waits
}

// Parse reads ?fail=0.3&slow=0.2&delay=800 (a share, a share, milliseconds). Anything missing,
// malformed or out of range is clamped, never an error: the page is for playing with.
func Parse(q func(string) string) Faults {
	num := func(key string, max float64) float64 {
		v, err := strconv.ParseFloat(q(key), 64)
		if err != nil || math.IsNaN(v) || v < 0 {
			return 0
		}
		return math.Min(v, max)
	}
	return Faults{
		Fail:  num("fail", MaxFailRate),
		Slow:  num("slow", 1),
		Delay: time.Duration(num("delay", float64(MaxDelay/time.Millisecond))) * time.Millisecond,
	}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	f := Parse(r.URL.Query().Get)
	select {
	case h.inflight <- struct{}{}:
		defer func() { <-h.inflight }()
	default:
		w.Header().Set("Retry-After", "1")
		write(w, http.StatusTooManyRequests, map[string]string{"error": "The lab is busy. Try again in a second."})
		return
	}
	start := time.Now()
	slow := f.Delay > 0 && h.rand() < f.Slow
	if slow {
		if err := h.sleep(r.Context(), f.Delay); err != nil {
			w.WriteHeader(StatusClientClosed) // the client gave up waiting
			return
		}
	}
	failed := h.rand() < f.Fail
	fault := "none"
	switch {
	case slow && failed:
		fault = "slow+error"
	case slow:
		fault = "slow"
	case failed:
		fault = "error"
	}
	w.Header().Set("X-Fault", fault)
	reply := Reply{OK: !failed, Fault: fault, ServedMs: float64(time.Since(start).Microseconds()) / 1000}
	if failed {
		// A real 503 with Retry-After, the way an overloaded service answers, so clients react to it
		// as they would in production.
		w.Header().Set("Retry-After", "1")
		write(w, http.StatusServiceUnavailable, reply)
		return
	}
	write(w, http.StatusOK, reply)
}

func write(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}
