package card

import (
	"encoding/xml"
	"errors"
	"io"
	"strings"
	"testing"
	"time"
)

// parses fails the test unless s is well-formed XML from start to end.
func parses(t *testing.T, s string) {
	t.Helper()
	dec := xml.NewDecoder(strings.NewReader(s))
	for {
		if _, err := dec.Token(); err != nil {
			if errors.Is(err, io.EOF) {
				return
			}
			t.Fatalf("not well-formed: %v", err)
		}
	}
}

func TestMapShowsTheLiveNumbers(t *testing.T) {
	d := Data{
		Commit: "37580e6", Region: "asia-southeast1", SLOAvailable: true, Availability: 0.99999,
		Delivery: &Delivery{WindowDays: 30, Deploys: 56}, Now: time.Date(2026, 11, 13, 3, 51, 0, 0, time.UTC),
	}
	l := Live{P50: 0.288, P95: 0.843, Up: 15*time.Hour + 20*time.Minute}
	dark, light := string(Map(d, l, true)), string(Map(d, l, false))
	for _, s := range []string{dark, light} {
		parses(t, s)
		for _, want := range []string{
			"37580e6 · 56 deploys", "p50 0.3 · p95 0.8 ms", "instance up 15 h", "99.99% up", "asia-southeast1",
			"drawn 03:51 UTC", "<animateMotion", "prefers-reduced-motion", `role="img"`, "56 deploys in 30 days",
		} {
			if !strings.Contains(s, want) {
				t.Errorf("map lacks %q", want)
			}
		}
	}
	if !strings.Contains(dark, "#0d1117") || !strings.Contains(light, "#ffffff") || dark == light {
		t.Error("the two themes should differ in their background")
	}
}

func TestMapWithNothingMeasured(t *testing.T) {
	s := string(Map(Data{Commit: "local", Region: "local", Now: time.Now()}, Live{}, true))
	parses(t, s)
	for _, want := range []string{"objective 99.9%", "no visitors yet", "GitHub Actions"} {
		if !strings.Contains(s, want) {
			t.Errorf("map lacks %q", want)
		}
	}
	// With no delivery numbers the GitHub Actions box shows the commit alone ("local"), no count.
	if !strings.Contains(s, ">local<") || strings.Contains(s, " deploys<") {
		t.Error("no delivery numbers, yet the map claims some deploys")
	}
}

func TestMapEscapesText(t *testing.T) {
	s := string(Map(Data{Commit: `a"b`, Region: `<script>&`, Now: time.Now()}, Live{}, false))
	parses(t, s)
	if strings.Contains(s, "<script>") {
		t.Error("region written unescaped")
	}
}
