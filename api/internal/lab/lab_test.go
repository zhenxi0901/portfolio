package lab

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"
)

// handler returns a Handler whose dice roll the given values in turn and whose sleep records
// what it was asked to wait.
func handler(rolls ...float64) (*Handler, *[]time.Duration) {
	h := New(nil)
	slept := &[]time.Duration{}
	h.rand = func() float64 {
		if len(rolls) == 0 {
			return 0.99
		}
		r := rolls[0]
		rolls = rolls[1:]
		return r
	}
	h.sleep = func(_ context.Context, d time.Duration) error {
		*slept = append(*slept, d)
		return nil
	}
	return h, slept
}

func get(h http.Handler, query string) (*httptest.ResponseRecorder, Reply) {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/lab/echo?"+query, nil))
	var r Reply
	_ = json.Unmarshal(rec.Body.Bytes(), &r)
	return rec, r
}

func TestParseClampsToTheLimits(t *testing.T) {
	q := func(s string) func(string) string {
		v, _ := url.ParseQuery(s)
		return v.Get
	}
	for _, c := range []struct {
		query string
		want  Faults
	}{
		{"", Faults{}},
		{"fail=0.3&slow=0.5&delay=800", Faults{Fail: 0.3, Slow: 0.5, Delay: 800 * time.Millisecond}},
		{"fail=1&slow=7&delay=99999", Faults{Fail: MaxFailRate, Slow: 1, Delay: MaxDelay}},
		{"fail=-1&slow=NaN&delay=abc", Faults{}},
	} {
		if got := Parse(q(c.query)); got != c.want {
			t.Errorf("Parse(%q) = %+v, want %+v", c.query, got, c.want)
		}
	}
}

func TestNoFaultsAskedForNoneGiven(t *testing.T) {
	h, slept := handler(0, 0) // dice that would fail everything, if anything were asked for
	rec, r := get(h, "")
	if rec.Code != 200 || !r.OK || r.Fault != "none" || len(*slept) != 0 {
		t.Errorf("status %d, reply %+v, slept %v", rec.Code, r, *slept)
	}
	if rec.Header().Get("Cache-Control") != "no-store" || rec.Header().Get("X-Fault") != "none" {
		t.Errorf("headers %v", rec.Header())
	}
}

func TestAnErrorIsAReal503(t *testing.T) {
	h, _ := handler(0) // no delay asked for, so the only roll is for the error
	rec, r := get(h, "fail=0.5")
	if rec.Code != http.StatusServiceUnavailable || r.OK || r.Fault != "error" {
		t.Errorf("status %d, reply %+v", rec.Code, r)
	}
	if rec.Header().Get("Retry-After") != "1" || rec.Header().Get("X-Fault") != "error" {
		t.Errorf("headers %v", rec.Header())
	}
}

func TestASlowResponseWaitsTheDelay(t *testing.T) {
	h, slept := handler(0.1, 0.9) // slow (0.1 < 0.5), then no error (0.9 >= 0.2)
	rec, r := get(h, "slow=0.5&delay=700&fail=0.2")
	if rec.Code != 200 || r.Fault != "slow" || len(*slept) != 1 || (*slept)[0] != 700*time.Millisecond {
		t.Errorf("status %d, reply %+v, slept %v", rec.Code, r, *slept)
	}
	h, slept = handler(0.1, 0.1)
	if rec, r := get(h, "slow=0.5&delay=99999&fail=1"); rec.Code != 503 || r.Fault != "slow+error" || (*slept)[0] != MaxDelay {
		t.Errorf("slow and failed: status %d, reply %+v, slept %v", rec.Code, r, *slept)
	}
}

func TestAClientThatGivesUpGetsNothing(t *testing.T) {
	h, _ := handler(0)
	h.sleep = func(context.Context, time.Duration) error { return context.Canceled }
	rec, _ := get(h, "slow=1&delay=1000")
	if rec.Body.Len() != 0 || rec.Code != StatusClientClosed {
		t.Errorf("after the client left: status %d, body %q", rec.Code, rec.Body.String())
	}
}

func TestBusyWhenTooManyAreHeld(t *testing.T) {
	h, _ := handler()
	for range MaxInFlight {
		h.inflight <- struct{}{}
	}
	rec, _ := get(h, "")
	if rec.Code != http.StatusTooManyRequests || rec.Header().Get("Retry-After") != "1" {
		t.Errorf("status %d, headers %v", rec.Code, rec.Header())
	}
	<-h.inflight
	if rec, _ := get(h, ""); rec.Code != 200 {
		t.Errorf("after a slot frees: status %d", rec.Code)
	}
}

func TestOneVisitorCannotHoldTheWholeLab(t *testing.T) {
	h, _ := handler()
	h.visitor = func(r *http.Request) string { return r.Header.Get("X-Visitor") }
	ask := func(who string) int {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/lab/echo", nil)
		req.Header.Set("X-Visitor", who)
		h.ServeHTTP(rec, req)
		return rec.Code
	}
	h.held["heavy"] = MaxPerVisitor // a run already holding its share
	if code := ask("heavy"); code != http.StatusTooManyRequests {
		t.Errorf("a visitor past their share got %d, want 429", code)
	}
	if code := ask("someone else"); code != 200 {
		t.Errorf("another visitor got %d, want 200", code)
	}
	if h.held["heavy"] != MaxPerVisitor || len(h.held) != 1 {
		t.Errorf("places not given back: %v", h.held)
	}
}

func TestRealSleepStopsWhenTheClientLeaves(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(20 * time.Millisecond)
		cancel()
	}()
	start := time.Now()
	if err := sleep(ctx, 5*time.Second); err == nil || time.Since(start) > time.Second {
		t.Errorf("sleep returned %v after %v", err, time.Since(start))
	}
	if err := sleep(context.Background(), time.Millisecond); err != nil {
		t.Errorf("a short sleep failed: %v", err)
	}
}
