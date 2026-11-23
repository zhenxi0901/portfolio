// Package fresh keeps the last good reading of something slow to read: Cloud Monitoring, GitHub.
//
// A visitor is given the last reading at once. Reading it again is the uptime checks' work: three a
// minute ask /api/health, which calls Warm on whatever has come due. A request for the reading reads
// only when there is none (a new instance's first minute) or the last one has passed its Limit (the
// checks have stopped coming). Every read happens inside a request, because with request-based billing
// Cloud Run throttles an instance's CPU once the response has gone.
package fresh

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"
)

// Reading is a value that is slow to read, and when to read it again. The zero value is not usable:
// Read, Log and the four durations must be set.
type Reading[T any] struct {
	// Due is how old a reading may get before Warm reads it again.
	Due time.Duration
	// Limit is how old it may get before a request for it has to read it.
	Limit time.Duration
	// Retry is how long a failed read is left alone.
	Retry time.Duration
	// For is one read's deadline.
	For time.Duration

	Read func(ctx context.Context, now time.Time) (T, error)
	// Current, if set, says whether a reading still holds, whatever its age: a month's bill stops being
	// this month's at midnight. One that does not hold counts as no reading.
	Current func(v T, now time.Time) bool
	// Now is the clock; time.Now if nil.
	Now func() time.Time
	// Log takes a warning, Failed, each time a read fails.
	Log    *slog.Logger
	Failed string

	mu      sync.Mutex
	value   T
	at      time.Time     // when value was read; zero while there is none
	retryAt time.Time     // after a failed read, when the next may start
	failed  bool          // the latest read failed
	reading chan struct{} // set while one request reads, closed when that read ends
}

// Seed gives the reading a value to start from, as if it had been read at the given time.
func (r *Reading[T]) Seed(v T, at time.Time) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.value, r.at = v, at
}

// Get returns the reading. ok is false while there is none to give; failed says the latest read failed,
// so an ok reading is the last good one.
func (r *Reading[T]) Get(ctx context.Context) (v T, ok, failed bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	now := r.now()
	have := r.holds(now)
	switch {
	case have && now.Sub(r.at) < r.Limit, now.Before(r.retryAt):
		// Fresh enough, or too soon after a failure to ask again.
	case r.reading == nil:
		r.read(ctx, now, r.For)
	case !have:
		// Nothing to hand out yet: wait for the read already under way.
		wait := r.reading
		r.mu.Unlock()
		select {
		case <-wait:
		case <-ctx.Done():
		}
		r.mu.Lock()
	}
	if !r.holds(r.now()) {
		var none T
		return none, false, r.failed
	}
	return r.value, true, r.failed
}

// Warm reads if the reading is due and nobody is reading it already, for no longer than limit, and
// reports whether it did.
func (r *Reading[T]) Warm(ctx context.Context, limit time.Duration) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	now := r.now()
	if r.reading != nil || now.Before(r.retryAt) || r.holds(now) && now.Sub(r.at) < r.Due {
		return false
	}
	r.read(ctx, now, min(limit, r.For))
	return true
}

func (r *Reading[T]) now() time.Time {
	if r.Now == nil {
		return time.Now()
	}
	return r.Now()
}

// holds reports whether there is a reading that still holds. The lock is held.
func (r *Reading[T]) holds(now time.Time) bool {
	return !r.at.IsZero() && (r.Current == nil || r.Current(r.value, now))
}

// read reads once. It is called, and returns, with the lock held; the lock is released meanwhile.
func (r *Reading[T]) read(ctx context.Context, now time.Time, limit time.Duration) {
	done := make(chan struct{})
	r.reading = done
	r.mu.Unlock()

	// A deadline of its own: whoever started the read may leave while others wait on it.
	rctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), limit)
	v, err := r.tryRead(rctx, now)
	cancel()

	r.mu.Lock()
	r.reading = nil
	close(done)
	r.failed = err != nil
	if err != nil {
		r.retryAt = now.Add(r.Retry)
		r.Log.Warn(r.Failed, "err", err)
		return
	}
	r.value, r.at = v, now
}

// tryRead turns a panic in Read into an error like any other, so the read is marked finished and tried
// again later: left as it was, the next visitor would wait on a read that never ends.
func (r *Reading[T]) tryRead(ctx context.Context, now time.Time) (v T, err error) {
	defer func() {
		if p := recover(); p != nil {
			err = fmt.Errorf("the read panicked: %v", p)
		}
	}()
	return r.Read(ctx, now)
}
