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
	"regexp"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/zhenxi0901/portfolio/api/internal/ask"
	"github.com/zhenxi0901/portfolio/api/internal/slo"
)

func newTestServer(t *testing.T) (*httptest.Server, Config) {
	t.Helper()
	cfg := testConfig(t)
	return startServer(t, cfg), cfg
}

// testConfig builds a small static site and knowledge file in a temp dir.
func testConfig(t *testing.T) Config {
	t.Helper()
	site := t.TempDir()
	must(t, os.WriteFile(filepath.Join(site, "index.html"), []byte("<h1>home</h1>"), 0o644))
	must(t, os.WriteFile(filepath.Join(site, "404.html"), []byte("<h1>lost</h1>"), 0o644))
	must(t, os.MkdirAll(filepath.Join(site, "_next", "static"), 0o755))
	must(t, os.WriteFile(filepath.Join(site, "_next", "static", "app.js"), []byte("1"), 0o644))
	kb, err := os.ReadFile("../ask/testdata/knowledge.json")
	must(t, err)
	must(t, os.WriteFile(filepath.Join(site, "knowledge.json"), kb, 0o644))

	return Config{
		Port: "0", StaticDir: site, KnowledgePath: filepath.Join(site, "knowledge.json"),
		DataDir: t.TempDir(), Region: "test", AllowedOrigins: []string{"http://localhost:3000"},
		Version: "test", Commit: "abcdef123456",
	}
}

func startServer(t *testing.T, cfg Config) *httptest.Server {
	t.Helper()
	s, err := New(cfg, slog.New(slog.NewTextHandler(io.Discard, nil)))
	must(t, err)
	ts := httptest.NewServer(s.Handler())
	t.Cleanup(ts.Close)
	return ts
}

func TestHealthAndStatic(t *testing.T) {
	ts, _ := newTestServer(t)
	for path, want := range map[string]int{"/healthz": 200, "/readyz": 200, "/api/health": 200, "/": 200, "/nope": 404, "/api/nope": 404} {
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

// Off Cloud Run there is nothing to measure: /api/slo says so instead of failing.
func TestSLOOffCloudRun(t *testing.T) {
	ts, _ := newTestServer(t)
	resp, err := http.Get(ts.URL + "/api/slo")
	must(t, err)
	defer resp.Body.Close()
	var body struct {
		Available bool    `json:"available"`
		Reason    string  `json:"reason"`
		Target    float64 `json:"target"`
	}
	must(t, json.NewDecoder(resp.Body).Decode(&body))
	if resp.StatusCode != 200 || body.Available || body.Reason == "" || body.Target != 0.999 {
		t.Errorf("status %d, body %+v", resp.StatusCode, body)
	}
}

// Uptime checks hit /api/health every minute from three places; they are not visitors.
func TestProbesDoNotCountAsTraffic(t *testing.T) {
	ts, _ := newTestServer(t)
	for range 5 {
		r, _ := http.Get(ts.URL + "/api/health")
		r.Body.Close()
	}
	resp, err := http.Get(ts.URL + "/api/status")
	must(t, err)
	defer resp.Body.Close()
	var st statusResponse
	must(t, json.NewDecoder(resp.Body).Decode(&st))
	if st.RequestsTotal != 0 {
		t.Errorf("requests_total %d after only probes, want 0", st.RequestsTotal)
	}
}

func TestWrongMethodOnAKnownAPIPathIs405(t *testing.T) {
	ts, _ := newTestServer(t)
	resp, err := http.Get(ts.URL + "/api/ask")
	must(t, err)
	resp.Body.Close()
	if resp.StatusCode != http.StatusMethodNotAllowed || resp.Header.Get("Allow") != "POST" {
		t.Errorf("GET /api/ask = %d, Allow %q; want 405 POST", resp.StatusCode, resp.Header.Get("Allow"))
	}
	resp, err = http.Get(ts.URL + "/api/nope")
	must(t, err)
	resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("unknown API path = %d, want 404", resp.StatusCode)
	}
}

// The profile card renders from the live server, with the delivery numbers from the static export.
func TestProfileCard(t *testing.T) {
	cfg := testConfig(t)
	must(t, os.WriteFile(filepath.Join(cfg.StaticDir, "delivery.json"), []byte(`{"windowDays":30,"deploys":7,"leadTimeMinutes":{"median":4.4}}`), 0o644))
	ts := startServer(t, cfg)
	for _, theme := range []string{"", "?theme=light"} {
		resp, err := http.Get(ts.URL + "/api/card.svg" + theme)
		must(t, err)
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode != 200 || !strings.HasPrefix(resp.Header.Get("Content-Type"), "image/svg+xml") {
			t.Fatalf("GET /api/card.svg%s = %d %s", theme, resp.StatusCode, resp.Header.Get("Content-Type"))
		}
		if s := string(body); !strings.Contains(s, "commit abcdef1") || !strings.Contains(s, ">7<") || !strings.Contains(s, "4.4 min") {
			t.Errorf("card missing the commit or the delivery numbers:\n%s", s)
		}
	}
	// Without the file the card still renders, from the live numbers alone.
	ts = startServer(t, testConfig(t))
	resp, err := http.Get(ts.URL + "/api/card.svg")
	must(t, err)
	resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Errorf("card without delivery.json = %d", resp.StatusCode)
	}
}

func rpc(t *testing.T, url, body string, headers map[string]string) (int, map[string]any) {
	t.Helper()
	req, err := http.NewRequest(http.MethodPost, url+"/mcp", strings.NewReader(body))
	must(t, err)
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	must(t, err)
	defer resp.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return resp.StatusCode, out
}

// An agent can connect to the site as an MCP server, in either era of the protocol, and get answers
// from the same facts the Ask console uses.
func TestMCPTools(t *testing.T) {
	ts, _ := newTestServer(t)

	// Legacy: handshake, then list and call.
	code, out := rpc(t, ts.URL, `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{}}}`, nil)
	if code != 200 || out["result"].(map[string]any)["protocolVersion"] != "2025-06-18" {
		t.Fatalf("initialize: %d %v", code, out)
	}
	_, out = rpc(t, ts.URL, `{"jsonrpc":"2.0","id":2,"method":"tools/list"}`, nil)
	tools := out["result"].(map[string]any)["tools"].([]any)
	var names []string
	for _, tl := range tools {
		names = append(names, tl.(map[string]any)["name"].(string))
	}
	if strings.Join(names, ",") != "ask,search_facts,list_topics,get_status,get_delivery" {
		t.Fatalf("tools: %v", names)
	}
	_, out = rpc(t, ts.URL, `{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"ask","arguments":{"question":"How did you cut the cloud bill?"}}}`, nil)
	res := out["result"].(map[string]any)
	text := res["content"].([]any)[0].(map[string]any)["text"].(string)
	if res["isError"] != false || !strings.Contains(text, "15%") || !strings.Contains(text, "- Cost review: "+ts.URL+"/iot#platform") {
		t.Errorf("ask: %v", res)
	}

	// Modern: self-describing requests with mirrored headers.
	meta := `"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}`
	h := map[string]string{"MCP-Protocol-Version": "2026-07-28", "Mcp-Method": "tools/call", "Mcp-Name": "search_facts"}
	code, out = rpc(t, ts.URL, `{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"search_facts","arguments":{"query":"kafka topics","limit":2},`+meta+`}}`, h)
	res, _ = out["result"].(map[string]any)
	if code != 200 || res["resultType"] != "complete" || len(res["structuredContent"].(map[string]any)["facts"].([]any)) != 2 {
		t.Errorf("search_facts: %d %v", code, out)
	}
	h["Mcp-Name"] = "get_status"
	_, out = rpc(t, ts.URL, `{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"get_status",`+meta+`}}`, h)
	if sc := out["result"].(map[string]any)["structuredContent"].(map[string]any); sc["commit"] != "abcdef1" || sc["region"] != "test" {
		t.Errorf("get_status: %v", out)
	}
	// Bad input is the tool's own error, which a model can read and fix.
	h["Mcp-Name"] = "ask"
	_, out = rpc(t, ts.URL, `{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"ask","arguments":{"question":"x"},`+meta+`}}`, h)
	if out["result"].(map[string]any)["isError"] != true {
		t.Errorf("a one-letter question should be a tool error: %v", out)
	}
	// Without the delivery file, get_delivery says so instead of inventing numbers.
	h["Mcp-Name"] = "get_delivery"
	_, out = rpc(t, ts.URL, `{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"get_delivery",`+meta+`}}`, h)
	if out["result"].(map[string]any)["isError"] != true {
		t.Errorf("get_delivery without data: %v", out)
	}

	resp, err := http.Get(ts.URL + "/mcp")
	must(t, err)
	resp.Body.Close()
	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Errorf("GET /mcp = %d, want 405", resp.StatusCode)
	}
}

// curl gets the home page as a text card; anything that asks for HTML, or is a browser, gets HTML.
func TestHomePageForTerminals(t *testing.T) {
	ts, _ := newTestServer(t)
	get := func(ua, accept string) (string, string) {
		req, _ := http.NewRequest(http.MethodGet, ts.URL+"/", nil)
		req.Header.Set("User-Agent", ua)
		if accept != "" {
			req.Header.Set("Accept", accept)
		}
		resp, err := http.DefaultClient.Do(req)
		must(t, err)
		defer resp.Body.Close()
		b, _ := io.ReadAll(resp.Body)
		return resp.Header.Get("Content-Type"), string(b)
	}
	if ct, body := get("curl/8.5.0", "*/*"); !strings.HasPrefix(ct, "text/plain") || !strings.Contains(body, "Li ZhenXi") || !strings.Contains(body, "commit abcdef1") || !strings.Contains(body, ts.URL+"/mcp") {
		t.Errorf("curl: %s\n%s", ct, body)
	}
	for name, c := range map[string][2]string{
		"curl asking for HTML": {"curl/8.5.0", "text/html"},
		"a browser":            {"Mozilla/5.0 (X11; Linux x86_64) Chrome/140", "text/html,application/xhtml+xml"},
		"an unknown client":    {"Go-http-client/1.1", ""},
	} {
		if ct, body := get(c[0], c[1]); !strings.HasPrefix(ct, "text/html") || !strings.Contains(body, "<h1>home</h1>") {
			t.Errorf("%s: got %s %q, want the HTML page", name, ct, body)
		}
	}
	// The card has an address of its own, whoever asks.
	respCard, err := http.Get(ts.URL + "/api/card.txt")
	must(t, err)
	cardBody, _ := io.ReadAll(respCard.Body)
	respCard.Body.Close()
	if !strings.HasPrefix(respCard.Header.Get("Content-Type"), "text/plain") || !strings.Contains(string(cardBody), "Li ZhenXi") {
		t.Errorf("/api/card.txt: %s %q", respCard.Header.Get("Content-Type"), cardBody)
	}
	// Both answers on / say that they depend on the client.
	htmlReq, _ := http.NewRequest(http.MethodGet, ts.URL+"/", nil)
	htmlReq.Header.Set("Accept", "text/html")
	respHTML, err := http.DefaultClient.Do(htmlReq)
	must(t, err)
	respHTML.Body.Close()
	if v := respHTML.Header.Get("Vary"); !strings.Contains(v, "User-Agent") {
		t.Errorf("home page Vary = %q", v)
	}
	// Only the home page: other paths stay files.
	req, _ := http.NewRequest(http.MethodGet, ts.URL+"/knowledge.json", nil)
	req.Header.Set("User-Agent", "curl/8.5.0")
	resp, err := http.DefaultClient.Do(req)
	must(t, err)
	resp.Body.Close()
	if !strings.HasPrefix(resp.Header.Get("Content-Type"), "application/json") {
		t.Errorf("curl /knowledge.json: %s", resp.Header.Get("Content-Type"))
	}
}

// The /agents page and llms.txt name the tools from web/src/content/agents.ts; the server defines
// them. A tool added or renamed on one side only fails here.
func TestAgentsPageNamesTheSameTools(t *testing.T) {
	src, err := os.ReadFile("../../../web/src/content/agents.ts")
	must(t, err)
	var page []string
	for _, m := range regexp.MustCompile(`\{ name: "([a-z_]+)"`).FindAllStringSubmatch(string(src), -1) {
		page = append(page, m[1])
	}
	ts, _ := newTestServer(t)
	_, out := rpc(t, ts.URL, `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`, nil)
	var server []string
	for _, tool := range out["result"].(map[string]any)["tools"].([]any) {
		server = append(server, tool.(map[string]any)["name"].(string))
	}
	if !slices.Equal(page, server) || len(server) == 0 {
		t.Errorf("tools differ:\n  page:   %v\n  server: %v", page, server)
	}
}

// A case study's fact links to its own page; every other fact links to its section of the home page.
func TestFactURL(t *testing.T) {
	if got := factURL("https://x.test", ask.Fact{ID: "case-reaper", Anchor: "case-reaper"}); got != "https://x.test/work/reaper" {
		t.Errorf("case fact: %s", got)
	}
	if got := factURL("https://x.test", ask.Fact{ID: "fyp", Anchor: "research"}); got != "https://x.test/#research" {
		t.Errorf("section fact: %s", got)
	}
}

// callTool calls one MCP tool the way an older client would, and returns its text and data.
func callTool(t *testing.T, url, name, args string) (string, map[string]any, bool) {
	t.Helper()
	_, out := rpc(t, url, `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"`+name+`","arguments":`+args+`}}`, map[string]string{"MCP-Protocol-Version": "2025-06-18"})
	res, ok := out["result"].(map[string]any)
	if !ok {
		t.Fatalf("%s: no result: %v", name, out)
	}
	text := res["content"].([]any)[0].(map[string]any)["text"].(string)
	data, _ := res["structuredContent"].(map[string]any)
	return text, data, res["isError"] == true
}

// next dev runs the pages on another origin; the MCP endpoint has to answer it like the API does.
func TestMCPFromAnAllowedOrigin(t *testing.T) {
	ts, _ := newTestServer(t)
	pre, _ := http.NewRequest(http.MethodOptions, ts.URL+"/mcp", nil)
	pre.Header.Set("Origin", "http://localhost:3000")
	pre.Header.Set("Access-Control-Request-Method", "POST")
	pre.Header.Set("Access-Control-Request-Headers", "content-type, mcp-protocol-version, mcp-method, mcp-name")
	resp, err := http.DefaultClient.Do(pre)
	must(t, err)
	resp.Body.Close()
	allow := resp.Header.Get("Access-Control-Allow-Headers")
	if resp.StatusCode != http.StatusNoContent || resp.Header.Get("Access-Control-Allow-Origin") != "http://localhost:3000" || !strings.Contains(allow, "Mcp-Method") || !strings.Contains(allow, "Mcp-Name") {
		t.Fatalf("preflight: %d ACAO %q allow %q", resp.StatusCode, resp.Header.Get("Access-Control-Allow-Origin"), allow)
	}
	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/mcp", strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"tools/list"}`))
	req.Header.Set("Origin", "http://localhost:3000")
	req.Header.Set("Content-Type", "application/json")
	resp, err = http.DefaultClient.Do(req)
	must(t, err)
	resp.Body.Close()
	if resp.StatusCode != 200 || resp.Header.Get("Access-Control-Allow-Origin") != "http://localhost:3000" {
		t.Errorf("POST from the allowed origin: %d ACAO %q", resp.StatusCode, resp.Header.Get("Access-Control-Allow-Origin"))
	}
}

// The home page goes to terminals only when they do not ask for HTML, judged as HTTP means it.
func TestTerminalAcceptHeader(t *testing.T) {
	ts, _ := newTestServer(t)
	get := func(method, accept string) (int, string) {
		req, _ := http.NewRequest(method, ts.URL+"/", nil)
		req.Header.Set("User-Agent", "curl/8.5.0")
		if accept != "" {
			req.Header.Set("Accept", accept)
		}
		resp, err := http.DefaultClient.Do(req)
		must(t, err)
		resp.Body.Close()
		return resp.StatusCode, resp.Header.Get("Content-Type")
	}
	for accept, wantText := range map[string]bool{
		"":                           true,
		"*/*":                        true,
		"text/html;q=0, text/plain":  true,
		"text/html; q=0.0":           true,
		"TEXT/HTML":                  false,
		"text/plain, text/html;q=.5": false,
	} {
		_, ct := get(http.MethodGet, accept)
		if gotText := strings.HasPrefix(ct, "text/plain"); gotText != wantText {
			t.Errorf("Accept %q: got %s, want text card %v", accept, ct, wantText)
		}
	}
	if code, ct := get(http.MethodHead, ""); code != 200 || !strings.HasPrefix(ct, "text/plain") {
		t.Errorf("HEAD from curl: %d %s", code, ct)
	}
}

// A copy of the site running anywhere but Cloud Run says so, rather than claiming to be live.
func TestStatusToolOnALocalCopy(t *testing.T) {
	cfg := testConfig(t)
	cfg.Region = "local"
	ts := startServer(t, cfg)
	text, data, _ := callTool(t, ts.URL, "get_status", `{}`)
	if !strings.Contains(text, "local copy") || strings.Contains(text, "Cloud Run") || data["local"] != true {
		t.Errorf("local get_status: %s %v", text, data)
	}
}

func TestSLOSummary(t *testing.T) {
	read := time.Date(2026, 10, 19, 6, 0, 0, 0, time.UTC)
	since := read.Add(-48 * time.Hour)
	fresh := slo.Report{Available: true, Availability: 0.9999, BudgetRemaining: 0.9, Releases: "open", Updated: read, Since: &since}
	text, data := sloSummary(fresh)
	if !strings.Contains(text, "99.990%") || strings.Contains(text, "last good") || data["updated"] != "2026-10-19T06:00:00Z" {
		t.Errorf("fresh: %s %v", text, data)
	}
	stale := fresh
	stale.Stale = true
	if text, data := sloSummary(stale); !strings.Contains(text, "last good numbers, read 19 Oct 06:00 UTC") || data["stale"] != true {
		t.Errorf("stale: %s %v", text, data)
	}
	if text, data := sloSummary(slo.Report{Reason: "Measurements are unavailable right now."}); !strings.Contains(text, "unavailable right now") || data["available"] != false {
		t.Errorf("unavailable: %s %v", text, data)
	}
}

// search_facts takes any whole number from 1 to 5, and says what it got when it refuses.
func TestSearchFactsLimit(t *testing.T) {
	ts, _ := newTestServer(t)
	for args, want := range map[string]string{
		`{"query":"kafka","limit":5.0}`:  "",
		`{"query":"kafka","limit":null}`: "",
		`{"query":"kafka","limit":"5"}`:  `got "5"`,
		`{"query":"kafka","limit":1e9}`:  `got 1e9`,
		`{"query":"kafka","limit":2.5}`:  `got 2.5`,
		`{"query":"kafka","limit":0}`:    `got 0`,
	} {
		text, _, isErr := callTool(t, ts.URL, "search_facts", args)
		if want == "" && isErr {
			t.Errorf("%s refused: %s", args, text)
		}
		if want != "" && (!isErr || !strings.Contains(text, want)) {
			t.Errorf("%s: %q, want an error with %q", args, text, want)
		}
	}
}

// get_delivery rounds like the site, and only claims the numbers for this build when they are.
func TestDeliveryTool(t *testing.T) {
	for head, wantBuilt := range map[string]bool{"abcdef1": true, "0123456": false} {
		cfg := testConfig(t)
		raw := `{"windowDays":30,"deploys":8,"leadTimeMinutes":{"median":4.2,"commits":9},"changeFailureRate":0.125,` +
			`"safeguards":{"lastDrill":null},"head":{"sha":"` + head + `","title":"t","committed":"2026-10-19T10:00:00Z"}}`
		must(t, os.WriteFile(filepath.Join(cfg.StaticDir, "delivery.json"), []byte(raw), 0o644))
		ts := startServer(t, cfg)
		text, data, _ := callTool(t, ts.URL, "get_delivery", `{}`)
		if !strings.Contains(text, "Change failure rate: 13%.") {
			t.Errorf("rounding: %s", text)
		}
		_, built := data["built_from"]
		if built != wantBuilt || strings.Contains(text, "when it built this image") != wantBuilt {
			t.Errorf("head %s: built_from %v, text %q", head, built, text)
		}
	}
}

// A small Markdown file is served without a compressed variant; its type must not depend on the OS.
func TestMarkdownType(t *testing.T) {
	cfg := testConfig(t)
	must(t, os.WriteFile(filepath.Join(cfg.StaticDir, "notes.md"), []byte("# hi\n"), 0o644))
	ts := startServer(t, cfg)
	resp, err := http.Get(ts.URL + "/notes.md")
	must(t, err)
	resp.Body.Close()
	if ct := resp.Header.Get("Content-Type"); ct != "text/markdown; charset=utf-8" {
		t.Errorf("notes.md: %s", ct)
	}
}
