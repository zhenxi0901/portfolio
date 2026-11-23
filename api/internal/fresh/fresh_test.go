package fresh

import (
	"context"
	"errors"
	"log/slog"
	"sync/atomic"
	"testing"
	"time"
)

var (
	quiet = slog.New(slog.DiscardHandler)
	noon  = time.Date(2026, 11, 23, 12, 0, 0, 0, time.UTC)
)

// source is something to read that a test can slow down, break and count.
type source struct {
	calls   atomic.Int32
	err     error
	panics  bool
	started chan struct{} // if set, told when a read starts
	release chan struct{} // if set, a read waits for it
	limit   time.Duration // the deadline the last read was given
}

func (s *source) read(ctx context.Context, _ time.Time) (int, error) {
	n := int(s.calls.Add(1))
	if d, ok := ctx.Deadline(); ok {
		s.limit = time.Until(d)
	}
	if err := ctx.Err(); err != nil {
		return 0, err
	}
	if s.started != nil {
		s.started <- struct{}{}
	}
	if s.release != nil {
		select {
		case <-s.release:
		case <-ctx.Done():
			return 0, ctx.Err()
		}
	}
	if s.panics {
		panic("boom")
	}
	return n, s.err
}

func newReading(s *source) (*Reading[int], *time.Time) {
	clock := noon
	return &Reading[int]{
		Due: 15 * time.Minute, Limit: 30 * time.Minute, Retry: time.Minute, For: 10 * time.Second,
		Read: s.read, Now: func() time.Time { return clock }, Log: quiet, Failed: "could not read",
	}, &clock
}

// check asks for the reading and compares all of the answer.
func check(t *testing.T, r *Reading[int], want int, ok, failed bool) {
	t.Helper()
	if v, o, f := r.Get(context.Background()); v != want || o != ok || f != failed {
		t.Errorf("got (%d, ok %v, failed %v), want (%d, %v, %v)", v, o, f, want, ok, failed)
	}
}

func TestVisitorsNeverWaitForADueReading(t *testing.T) {
	src := &source{}
	r, clock := newReading(src)
	check(t, r, 1, true, false) // a new instance's first visitor reads
	*clock = clock.Add(r.Limit - time.Second)
	check(t, r, 1, true, false) // due for a while now, but that is the checks' work
	*clock = clock.Add(time.Second)
	check(t, r, 2, true, false) // past the limit: the checks have stopped coming
}

func TestWarmReadsWhatIsDue(t *testing.T) {
	src := &source{}
	r, clock := newReading(src)
	warm := func() bool { return r.Warm(context.Background(), 5*time.Second) }
	if !warm() || warm() {
		t.Error("a new instance's first check should read, and its next should not")
	}
	if src.limit > 5*time.Second || src.limit < 4*time.Second {
		t.Errorf("the check's read was given %v, want its own 5 s", src.limit)
	}
	*clock = clock.Add(r.Due - time.Second)
	if warm() {
		t.Error("read before it was due")
	}
	*clock = clock.Add(time.Second)
	if !warm() {
		t.Error("not read when due")
	}
	check(t, r, 2, true, false)
}

func TestReadsHaveADeadline(t *testing.T) {
	src := &source{}
	r, _ := newReading(src)
	check(t, r, 1, true, false)
	if src.limit > r.For || src.limit < r.For-time.Second {
		t.Errorf("a visitor's read was given %v, want %v", src.limit, r.For)
	}
	r2, _ := newReading(src)
	r2.Warm(context.Background(), time.Hour)
	if src.limit > r2.For {
		t.Errorf("a check's read was given %v, more than the %v any read may take", src.limit, r2.For)
	}
}

func TestAFailedReadKeepsTheLastOneAndIsNotHammered(t *testing.T) {
	src := &source{}
	r, clock := newReading(src)
	check(t, r, 1, true, false)
	src.err = errors.New("monitoring is down")
	*clock = clock.Add(r.Due)
	if !r.Warm(context.Background(), time.Second) {
		t.Fatal("not read when due")
	}
	check(t, r, 1, true, true) // the last good one, and it says so
	*clock = clock.Add(r.Limit)
	check(t, r, 1, true, true) // past the limit a visitor's request asks again, and that fails too
	if r.Warm(context.Background(), time.Second) || src.calls.Load() != 3 {
		t.Errorf("read again at once after a failure: %d reads", src.calls.Load())
	}
	src.err = nil
	*clock = clock.Add(r.Retry)
	if !r.Warm(context.Background(), time.Second) {
		t.Error("not tried again after the retry wait")
	}
	check(t, r, 4, true, false)
}

func TestNothingToGiveAfterAFailedFirstRead(t *testing.T) {
	src := &source{err: errors.New("no")}
	r, clock := newReading(src)
	check(t, r, 0, false, true)
	check(t, r, 0, false, true)
	if src.calls.Load() != 1 {
		t.Errorf("%d reads, want 1 until the retry wait is over", src.calls.Load())
	}
	src.err = nil
	*clock = clock.Add(r.Retry)
	check(t, r, 2, true, false)
}

func TestAPanickingReadIsAFailedRead(t *testing.T) {
	src := &source{panics: true}
	r, clock := newReading(src)
	check(t, r, 0, false, true)
	src.panics = false
	*clock = clock.Add(r.Retry)
	check(t, r, 2, true, false)
}

// A reading that has stopped holding is no reading, even when it is the last good one.
func TestAReadingThatNoLongerHoldsIsNotGiven(t *testing.T) {
	src := &source{}
	r, clock := newReading(src)
	midnight := noon.Add(10 * time.Minute)
	r.Current = func(v int, now time.Time) bool { return v > 1 || now.Before(midnight) }
	check(t, r, 1, true, false)
	*clock = midnight
	src.err = errors.New("no")
	check(t, r, 0, false, true)
	src.err = nil
	*clock = clock.Add(r.Retry)
	check(t, r, 3, true, false)
}

func TestFirstVisitorsWaitForTheOneRead(t *testing.T) {
	src := &source{started: make(chan struct{}, 8), release: make(chan struct{})}
	r, _ := newReading(src)
	got := make(chan int, 8)
	ask := func() {
		v, _, _ := r.Get(context.Background())
		got <- v
	}
	go ask()
	<-src.started
	for range 4 {
		go ask()
	}
	if r.Warm(context.Background(), time.Second) {
		t.Error("a check read while a visitor's read was under way")
	}
	select {
	case v := <-got:
		t.Fatalf("answered %d before the read finished", v)
	case <-time.After(50 * time.Millisecond):
	}
	// One who gives up is answered with what there is: nothing, and no failure either.
	gone, cancel := context.WithCancel(context.Background())
	cancel()
	if _, ok, failed := r.Get(gone); ok || failed {
		t.Errorf("a visitor who left got ok %v, failed %v", ok, failed)
	}
	close(src.release)
	for range 5 {
		if v := <-got; v != 1 {
			t.Errorf("a first visitor got %d, want the one reading", v)
		}
	}
	if n := src.calls.Load(); n != 1 {
		t.Errorf("%d reads for visitors arriving together, want 1", n)
	}
}

func TestNobodyQueuesBehindSomeoneElsesRead(t *testing.T) {
	src := &source{started: make(chan struct{}, 8), release: make(chan struct{})}
	r, clock := newReading(src)
	r.Seed(7, noon)
	*clock = noon.Add(r.Limit)
	first := make(chan int, 1)
	go func() {
		v, _, _ := r.Get(context.Background())
		first <- v
	}()
	<-src.started
	second := make(chan int, 1)
	go func() {
		v, _, _ := r.Get(context.Background())
		second <- v
	}()
	select {
	case v := <-second:
		if v != 7 {
			t.Errorf("got %d while the read ran, want the last reading", v)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("a visitor waited behind another visitor's read")
	}
	close(src.release)
	if v := <-first; v != 1 {
		t.Errorf("the reader got %d, want its own reading", v)
	}
}

// The first visitor leaving must not cancel the read everyone else is waiting on.
func TestAReadOutlivesWhoeverStartedIt(t *testing.T) {
	gone, cancel := context.WithCancel(context.Background())
	cancel()
	r, _ := newReading(&source{})
	if v, ok, failed := r.Get(gone); v != 1 || !ok || failed {
		t.Errorf("got (%d, %v, %v)", v, ok, failed)
	}
	r2, _ := newReading(&source{})
	if !r2.Warm(gone, time.Second) || r2.failed {
		t.Error("a check that left cancelled its read")
	}
}
