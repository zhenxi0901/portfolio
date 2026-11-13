package ratelimit

import (
	"testing"
	"time"
)

func TestBurstThenRefill(t *testing.T) {
	now := time.Date(2026, 9, 30, 12, 0, 0, 0, time.UTC)
	l := New(3, time.Minute)
	l.now = func() time.Time { return now }

	for i := range 3 {
		if ok, _ := l.Allow("a"); !ok {
			t.Fatalf("request %d rejected inside the burst", i+1)
		}
	}
	ok, wait := l.Allow("a")
	if ok {
		t.Fatal("fourth request allowed past the burst")
	}
	if wait <= 0 || wait > 21*time.Second {
		t.Fatalf("retry-after %v, want about 20s (one token every 20s)", wait)
	}
	if ok, _ := l.Allow("b"); !ok {
		t.Fatal("a different client shares the first client's bucket")
	}

	now = now.Add(20 * time.Second)
	if ok, _ := l.Allow("a"); !ok {
		t.Fatal("no token after a full refill interval")
	}
}

func TestSweepEvictsIdleKeys(t *testing.T) {
	now := time.Date(2026, 9, 30, 12, 0, 0, 0, time.UTC)
	l := New(2, time.Minute)
	l.now = func() time.Time { return now }
	l.Allow("idle")
	now = now.Add(5 * time.Minute)
	l.Allow("fresh")
	if _, ok := l.buckets["idle"]; ok {
		t.Fatal("idle bucket was not swept")
	}
}
