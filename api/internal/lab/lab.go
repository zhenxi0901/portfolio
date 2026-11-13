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
	"sync"
	"time"
)

// The limits on what a visitor can ask for, per request.
const (
	MaxFailRate = 0.6                     // share of requests answered with a 503
	MaxDelay    = 1500 * time.Millisecond // how long a slow response is held
	// Requests held open at once on one instance, across every visitor. A delayed request keeps an
	// instance billed while it waits, so this bounds what a crowd of slow requests can cost.
	MaxInFlight = 24
	// How many of those one visitor may hold at once, so a single heavy run can't take the whole
	// instance's share and turn everyone else away.
	MaxPerVisitor = 8
)

// StatusClientClosed is what a request the client hung up on is logged as (nginx's 499): nobody
// is left to read it, but a 200 in the logs would say the server answered. Only where the hang-up
// reaches the server: behind Cloud Run's front end it often doesn't, and the request is held for
// its whole delay and answered (seen on 13 Nov 2026), which is why MaxInFlight counts held requests.
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
	visitor  func(*http.Request) string // who is asking: the server's rate-limit key

	mu   sync.Mutex
	held map[string]int // requests each visitor has in the lab right now
}

// New returns the lab; visitor tells one visitor from another (nil treats everyone as one).
func New(visitor func(*http.Request) string) *Handler {
	if visitor == nil {
		visitor = func(*http.Request) string { return "" }
	}
	return &Handler{inflight: make(chan struct{}, MaxInFlight), rand: rand.Float64, sleep: sleep, visitor: visitor, held: map[string]int{}}
}

// hold takes one of a visitor's places, or says they have none left.
func (h *Handler) hold(v string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.held[v] >= MaxPerVisitor {
		return false
	}
	h.held[v]++
	return true
}

func (h *Handler) release(v string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.held[v]--; h.held[v] <= 0 {
		delete(h.held, v)
	}
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
	// Key, when given, rolls this request's dice instead of chance: the same key always meets the
	// same fault. The page's comparison keys each attempt by run, request and attempt, so all four
	// strategies meet one schedule of faults and the differences between them are theirs, not luck.
	Key string
}

// maxKey bounds a key's length; a longer one is ignored and the dice are rolled as usual.
const maxKey = 64

// Parse reads ?fail=0.3&slow=0.2&delay=800&key=r7-3-0 (a share, a share, milliseconds, any short
// string). Anything missing, malformed or out of range is clamped, never an error: the page is for
// playing with.
func Parse(q func(string) string) Faults {
	num := func(key string, max float64) float64 {
		v, err := strconv.ParseFloat(q(key), 64)
		if err != nil || math.IsNaN(v) || v < 0 {
			return 0
		}
		return math.Min(v, max)
	}
	key := q("key")
	if len(key) > maxKey {
		key = ""
	}
	return Faults{
		Fail:  num("fail", MaxFailRate),
		Slow:  num("slow", 1),
		Delay: time.Duration(num("delay", float64(MaxDelay/time.Millisecond))) * time.Millisecond,
		Key:   key,
	}
}

// dice returns the rolls for this request's delay and error, each a share in [0, 1): chance, or
// fixed by the key.
func (h *Handler) dice(f Faults) (slow, fail func() float64) {
	if f.Key == "" {
		return h.rand, h.rand
	}
	return func() float64 { return keyed(f.Key, "slow") }, func() float64 { return keyed(f.Key, "fail") }
}

// keyed is a roll fixed by a key and the die's name: a hash, as a share in [0, 1).
func keyed(key, die string) float64 {
	// FNV-1a over the die's name and the key...
	x := uint64(14695981039346656037)
	for _, b := range []byte(die + "\x00" + key) {
		x ^= uint64(b)
		x *= 1099511628211
	}
	// ...then splitmix64's finish: keys differ only in their last characters ("r7-3-0", "r7-3-1"),
	// which FNV alone spreads poorly.
	x ^= x >> 30
	x *= 0xbf58476d1ce4e5b9
	x ^= x >> 27
	x *= 0x94d049bb133111eb
	x ^= x >> 31
	return float64(x>>11) / (1 << 53)
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	f := Parse(r.URL.Query().Get)
	v := h.visitor(r)
	if !h.hold(v) {
		w.Header().Set("Retry-After", "1")
		write(w, http.StatusTooManyRequests, map[string]string{"error": "You already have " + strconv.Itoa(MaxPerVisitor) + " requests held in the lab. Try again in a second."})
		return
	}
	defer h.release(v)
	select {
	case h.inflight <- struct{}{}:
		defer func() { <-h.inflight }()
	default:
		w.Header().Set("Retry-After", "1")
		write(w, http.StatusTooManyRequests, map[string]string{"error": "The lab is busy. Try again in a second."})
		return
	}
	start := time.Now()
	rollSlow, rollFail := h.dice(f)
	slow := f.Delay > 0 && rollSlow() < f.Slow
	if slow {
		if err := h.sleep(r.Context(), f.Delay); err != nil {
			w.WriteHeader(StatusClientClosed) // the client gave up waiting
			return
		}
	}
	failed := rollFail() < f.Fail
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
