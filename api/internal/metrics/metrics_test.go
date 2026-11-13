package metrics

import "testing"

func TestWindowPercentilesAndWrap(t *testing.T) {
	w := NewWindow(100)
	for i := 1; i <= 250; i++ { // wraps twice; only 151..250 remain
		w.Add(float64(i))
	}
	p50, p95, p99 := w.Percentiles()
	if p50 != 200 || p95 != 245 || p99 != 249 {
		t.Fatalf("p50=%v p95=%v p99=%v, want 200 245 249", p50, p95, p99)
	}
	if w.Total() != 250 {
		t.Fatalf("total %d, want 250", w.Total())
	}
	recent := w.Recent(3)
	if len(recent) != 3 || recent[0] != 248 || recent[2] != 250 {
		t.Fatalf("recent %v, want [248 249 250]", recent)
	}
}

func TestEmptyWindow(t *testing.T) {
	w := NewWindow(10)
	if a, b, c := w.Percentiles(); a != 0 || b != 0 || c != 0 {
		t.Fatal("empty window should report zeros")
	}
	if r := w.Recent(5); r == nil || len(r) != 0 {
		t.Fatal("empty window should return an empty, non-nil slice")
	}
}
