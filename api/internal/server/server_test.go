package server

import (
	"bufio"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func newTestServer(t *testing.T) (*httptest.Server, Config) {
	t.Helper()
	site := t.TempDir()
	must(t, os.WriteFile(filepath.Join(site, "index.html"), []byte("<h1>home</h1>"), 0o644))
	must(t, os.WriteFile(filepath.Join(site, "404.html"), []byte("<h1>lost</h1>"), 0o644))
	must(t, os.MkdirAll(filepath.Join(site, "_next", "static"), 0o755))
	must(t, os.WriteFile(filepath.Join(site, "_next", "static", "app.js"), []byte("1"), 0o644))
	kb, err := os.ReadFile("../ask/testdata/knowledge.json")
	must(t, err)
	must(t, os.WriteFile(filepath.Join(site, "knowledge.json"), kb, 0o644))

	cfg := Config{
		Port: "0", StaticDir: site, KnowledgePath: filepath.Join(site, "knowledge.json"),
		DataDir: t.TempDir(), Region: "test", AllowedOrigins: []string{"http://localhost:3000"},
		Version: "test", Commit: "abcdef123456",
	}
	s, err := New(cfg, slog.New(slog.NewTextHandler(io.Discard, nil)))
	must(t, err)
	ts := httptest.NewServer(s.Handler())
	t.Cleanup(ts.Close)
	return ts, cfg
}

func TestHealthAndStatic(t *testing.T) {
	ts, _ := newTestServer(t)
	for path, want := range map[string]int{"/healthz": 200, "/readyz": 200, "/": 200, "/nope": 404, "/api/nope": 404} {
		resp, err := http.Get(ts.URL + path)
		must(t, err)
		resp.Body.Close()
		if resp.StatusCode != want {
			t.Errorf("GET %s = %d, want %d", path, resp.StatusCode, want)
		}
	}
	resp, _ := http.Get(ts.URL + "/_next/static/app.js")
	if cc := resp.Header.Get("Cache-Control"); !strings.Contains(cc, "immutable") {
		t.Errorf("hashed assets should be immutable, got %q", cc)
	}
	if csp := resp.Header.Get("Content-Security-Policy"); !strings.Contains(csp, "frame-ancestors 'none'") {
		t.Errorf("missing CSP, got %q", csp)
	}
	if resp.Header.Get("X-Request-Id") == "" {
		t.Error("missing request id")
	}
}

func TestStatusReportsTraffic(t *testing.T) {
	ts, _ := newTestServer(t)
	for range 5 {
		r, _ := http.Get(ts.URL + "/")
		r.Body.Close()
	}
	resp, err := http.Get(ts.URL + "/api/status")
	must(t, err)
	defer resp.Body.Close()
	var st statusResponse
	must(t, json.NewDecoder(resp.Body).Decode(&st))
	if st.Status != "ok" || st.Region != "test" || st.Commit != "abcdef1" {
		t.Errorf("unexpected status %+v", st)
	}
	if st.RequestsTotal < 5 || len(st.RecentMs) < 5 {
		t.Errorf("status did not count requests: total=%d recent=%d", st.RequestsTotal, len(st.RecentMs))
	}
}

func TestAskRetrievalAndValidation(t *testing.T) {
	ts, _ := newTestServer(t)
	resp := post(t, ts.URL+"/api/ask", `{"question":"How did ZhenXi cut the cloud bill?"}`)
	var out struct {
		Answer  string              `json:"answer"`
		Mode    string              `json:"mode"`
		Cached  bool                `json:"cached"`
		Sources []map[string]string `json:"sources"`
	}
	must(t, json.NewDecoder(resp.Body).Decode(&out))
	resp.Body.Close()
	if resp.StatusCode != 200 || out.Mode != "retrieval" || !strings.Contains(out.Answer, "15%") || len(out.Sources) == 0 {
		t.Fatalf("bad answer %d %+v", resp.StatusCode, out)
	}
	again := post(t, ts.URL+"/api/ask", `{"question":"how did zhenxi   cut the cloud bill?"}`)
	must(t, json.NewDecoder(again.Body).Decode(&out))
	again.Body.Close()
	if !out.Cached {
		t.Error("normalised repeat question should come from the cache")
	}
	if r := post(t, ts.URL+"/api/ask", `{"question":"hi"}`); r.StatusCode != 400 {
		t.Errorf("too-short question = %d, want 400", r.StatusCode)
	}
}

func TestAskRateLimit(t *testing.T) {
	ts, _ := newTestServer(t)
	codes := map[int]int{}
	for range 10 {
		r := post(t, ts.URL+"/api/ask", `{"question":"What is GKE?"}`)
		codes[r.StatusCode]++
		if r.StatusCode == 429 && r.Header.Get("Retry-After") == "" {
			t.Error("429 without Retry-After")
		}
		r.Body.Close()
	}
	if codes[200] != 8 || codes[429] != 2 {
		t.Fatalf("want 8 ok then 2 limited, got %v", codes)
	}
}

func TestContact(t *testing.T) {
	ts, cfg := newTestServer(t)
	if r := post(t, ts.URL+"/api/contact", `{"name":"","email":"x","message":"short"}`); r.StatusCode != 400 {
		t.Errorf("invalid form = %d, want 400", r.StatusCode)
	}
	if r := post(t, ts.URL+"/api/contact", `{"name":"Bot","email":"b@x.io","message":"buy things now please","company":"spam inc"}`); r.StatusCode != 202 {
		t.Errorf("honeypot = %d, want a silent 202", r.StatusCode)
	}
	if r := post(t, ts.URL+"/api/contact", `{"name":"Mei Ling","email":"mei@example.sg","message":"We have an SRE role for you."}`); r.StatusCode != 202 {
		t.Errorf("valid form = %d, want 202", r.StatusCode)
	}
	f, err := os.Open(filepath.Join(cfg.DataDir, "messages.jsonl"))
	must(t, err)
	defer f.Close()
	lines := 0
	for sc := bufio.NewScanner(f); sc.Scan(); {
		lines++
		if strings.Contains(sc.Text(), "spam inc") || strings.Contains(sc.Text(), "Bot") {
			t.Error("honeypot submission was stored")
		}
	}
	if lines != 1 {
		t.Errorf("stored %d messages, want 1", lines)
	}
}

func TestCORS(t *testing.T) {
	ts, _ := newTestServer(t)
	req, _ := http.NewRequest(http.MethodOptions, ts.URL+"/api/ask", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	resp, err := http.DefaultClient.Do(req)
	must(t, err)
	resp.Body.Close()
	if resp.StatusCode != 204 || resp.Header.Get("Access-Control-Allow-Origin") != "http://localhost:3000" {
		t.Errorf("preflight from an allowed origin: %d %q", resp.StatusCode, resp.Header.Get("Access-Control-Allow-Origin"))
	}
	req.Header.Set("Origin", "https://evil.example")
	resp, _ = http.DefaultClient.Do(req)
	resp.Body.Close()
	if resp.Header.Get("Access-Control-Allow-Origin") != "" {
		t.Error("CORS granted to an unknown origin")
	}
}

func TestMetricsExposeRoutes(t *testing.T) {
	ts, _ := newTestServer(t)
	r, _ := http.Get(ts.URL + "/api/status")
	r.Body.Close()
	resp, err := http.Get(ts.URL + "/metrics")
	must(t, err)
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	for _, want := range []string{`route="/api/status"`, "portfolio_build_info", "http_request_duration_seconds_bucket"} {
		if !strings.Contains(string(body), want) {
			t.Errorf("metrics missing %s", want)
		}
	}
}

func post(t *testing.T, url, body string) *http.Response {
	t.Helper()
	resp, err := http.Post(url, "application/json", strings.NewReader(body))
	must(t, err)
	return resp
}

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}
