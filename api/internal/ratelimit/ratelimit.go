// Package ratelimit is a per-key token bucket with idle-key eviction.
package ratelimit

import (
	"sync"
	"time"
)

type bucket struct {
	tokens float64
	last   time.Time
}

type Limiter struct {
	mu       sync.Mutex
	capacity float64
	perSec   float64
	buckets  map[string]*bucket
	now      func() time.Time
	sweepAt  time.Time
}

// New allows `burst` requests per key, refilled evenly over `per`.
func New(burst int, per time.Duration) *Limiter {
	return &Limiter{
		capacity: float64(burst),
		perSec:   float64(burst) / per.Seconds(),
		buckets:  map[string]*bucket{},
		now:      time.Now,
	}
}

// Allow takes a token for key. When none is left it reports how long until one is.
func (l *Limiter) Allow(key string) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	l.sweep(now)

	b, ok := l.buckets[key]
	if !ok {
		b = &bucket{tokens: l.capacity, last: now}
		l.buckets[key] = b
	}
	b.tokens = min(l.capacity, b.tokens+now.Sub(b.last).Seconds()*l.perSec)
	b.last = now
	if b.tokens >= 1 {
		b.tokens--
		return true, 0
	}
	wait := time.Duration((1 - b.tokens) / l.perSec * float64(time.Second))
	return false, wait
}

// sweep drops buckets that have refilled completely, so memory stays bounded.
func (l *Limiter) sweep(now time.Time) {
	if now.Before(l.sweepAt) {
		return
	}
	l.sweepAt = now.Add(time.Minute)
	full := time.Duration(l.capacity / l.perSec * float64(time.Second))
	for k, b := range l.buckets {
		if now.Sub(b.last) > full {
			delete(l.buckets, k)
		}
	}
}
