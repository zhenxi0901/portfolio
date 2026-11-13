package server

import (
	"net/http"
	"regexp"
	"strings"
	"testing"
)

func TestServerTiming(t *testing.T) {
	ts, _ := newTestServer(t)
	get := func(path string) string {
		t.Helper()
		resp, err := http.Get(ts.URL + path)
		must(t, err)
		resp.Body.Close()
		return resp.Header.Get("Server-Timing")
	}

	// Probes, health checks and scrapes come first on a fresh instance and must not use up its
	// first visitor request.
	for _, p := range []string{"/readyz", "/healthz", "/api/health", "/metrics"} {
		if st := get(p); strings.Contains(st, "cold") {
			t.Errorf("%s was marked cold: %q", p, st)
		}
	}
	first := get("/")
	if !regexp.MustCompile(`^app;dur=\d+\.\d{2};desc="Go server", cold;dur=\d+;desc="[^"]+"$`).MatchString(first) {
		t.Errorf("first visitor request: unexpected Server-Timing %q", first)
	}
	if second := get("/"); strings.Contains(second, "cold") || !strings.HasPrefix(second, "app;dur=") {
		t.Errorf("later requests are warm: %q", second)
	}
	// Every route gets it, including ones whose handler writes the body without WriteHeader.
	if st := get("/api/status"); !strings.HasPrefix(st, "app;dur=") {
		t.Errorf("status API missing Server-Timing: %q", st)
	}
}

func TestServerTimingNamesTheRevision(t *testing.T) {
	cfg := testConfig(t)
	cfg.Revision = "portfolio-00042-abc"
	ts := startServer(t, cfg)
	resp, err := http.Get(ts.URL + "/")
	must(t, err)
	resp.Body.Close()
	if st := resp.Header.Get("Server-Timing"); !strings.HasSuffix(st, `, rev;desc="portfolio-00042-abc"`) {
		t.Errorf("revision missing: %q", st)
	}
}
