package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func testServer() *Server {
	return New("portfolio", "Test portfolio", "abc1234", "Ask about the work.", []Tool{{
		Name: "echo", Title: "Echo", Description: "Returns its input.",
		InputSchema: map[string]any{"type": "object", "properties": map[string]any{"text": map[string]any{"type": "string"}}, "required": []string{"text"}},
		Call: func(_ context.Context, base string, args json.RawMessage) (Result, error) {
			var a struct {
				Text string `json:"text"`
			}
			_ = json.Unmarshal(args, &a)
			if a.Text == "" {
				return Result{}, errors.New("text is required")
			}
			return Result{Text: a.Text + " via " + base, Structured: map[string]string{"text": a.Text}}, nil
		},
	}})
}

type answer struct {
	ID     any `json:"id"`
	Result struct {
		ResultType        string                        `json:"resultType"`
		ProtocolVersion   string                        `json:"protocolVersion"`
		SupportedVersions []string                      `json:"supportedVersions"`
		Tools             []map[string]any              `json:"tools"`
		Content           []struct{ Type, Text string } `json:"content"`
		IsError           bool                          `json:"isError"`
		Structured        map[string]string             `json:"structuredContent"`
		Meta              map[string]map[string]any     `json:"_meta"`
		ServerInfo        map[string]any                `json:"serverInfo"`
	} `json:"result"`
	Error *struct {
		Code    int            `json:"code"`
		Message string         `json:"message"`
		Data    map[string]any `json:"data"`
	} `json:"error"`
}

func do(t *testing.T, s *Server, method, body string, headers map[string]string) (int, answer, string) {
	t.Helper()
	req := httptest.NewRequest(method, "http://site.test/mcp", strings.NewReader(body))
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, req)
	var r answer
	_ = json.Unmarshal(rec.Body.Bytes(), &r)
	return rec.Code, r, rec.Body.String()
}

const meta = `"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}`

func modern(method string, extra ...string) map[string]string {
	h := map[string]string{"MCP-Protocol-Version": Modern, "Mcp-Method": method}
	for i := 0; i+1 < len(extra); i += 2 {
		h[extra[i]] = extra[i+1]
	}
	return h
}

// The current protocol: no handshake, each request describes itself, and results say their type.
func TestModernRequests(t *testing.T) {
	s := testServer()

	code, r, _ := do(t, s, "POST", `{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{`+meta+`}}`, modern("server/discover"))
	if code != 200 || r.Result.ResultType != "complete" || len(r.Result.SupportedVersions) == 0 || r.Result.SupportedVersions[0] != Modern {
		t.Fatalf("discover: %d %+v", code, r)
	}
	if r.Result.Meta["io.modelcontextprotocol/serverInfo"]["name"] != "portfolio" {
		t.Errorf("discover: server info missing from _meta: %+v", r.Result.Meta)
	}

	code, r, _ = do(t, s, "POST", `{"jsonrpc":"2.0","id":"a","method":"tools/list","params":{`+meta+`}}`, modern("tools/list"))
	if code != 200 || len(r.Result.Tools) != 1 || r.Result.Tools[0]["name"] != "echo" || r.Result.ResultType != "complete" {
		t.Fatalf("tools/list: %d %+v", code, r)
	}
	if ann := r.Result.Tools[0]["annotations"].(map[string]any); ann["readOnlyHint"] != true {
		t.Errorf("tools must be marked read-only: %v", ann)
	}

	call := `{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"echo","arguments":{"text":"hi"},` + meta + `}}`
	code, r, _ = do(t, s, "POST", call, modern("tools/call", "Mcp-Name", "echo"))
	if code != 200 || r.Result.IsError || r.Result.Content[0].Text != "hi via http://site.test" || r.Result.Structured["text"] != "hi" {
		t.Fatalf("tools/call: %d %+v", code, r)
	}
	// The Base64 sentinel form of the name header is decoded before it is compared.
	if code, _, body := do(t, s, "POST", call, modern("tools/call", "Mcp-Name", "=?base64?ZWNobw==?=")); code != 200 {
		t.Errorf("encoded Mcp-Name refused: %d %s", code, body)
	}
}

// A tool's own failure is a result the model can read and correct, not a protocol error.
func TestToolErrorsAreResults(t *testing.T) {
	code, r, _ := do(t, testServer(), "POST", `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"echo","arguments":{},`+meta+`}}`, modern("tools/call", "Mcp-Name", "echo"))
	if code != 200 || !r.Result.IsError || r.Result.Content[0].Text != "text is required" {
		t.Fatalf("want an isError result, got %d %+v", code, r)
	}
}

func TestModernRejections(t *testing.T) {
	s := testServer()
	old := `"_meta":{"io.modelcontextprotocol/protocolVersion":"2027-01-01","io.modelcontextprotocol/clientCapabilities":{}}`
	for name, c := range map[string]struct {
		body    string
		headers map[string]string
		status  int
		code    int
	}{
		"version this server does not speak": {`{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{` + old + `}}`,
			map[string]string{"MCP-Protocol-Version": "2027-01-01", "Mcp-Method": "tools/list"}, 400, -32022},
		"header and body versions differ": {`{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{` + meta + `}}`,
			map[string]string{"MCP-Protocol-Version": "2027-01-01", "Mcp-Method": "tools/list"}, 400, -32020},
		"no version header":     {`{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{` + meta + `}}`, map[string]string{"Mcp-Method": "tools/list"}, 400, -32020},
		"method header differs": {`{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{` + meta + `}}`, modern("tools/call"), 400, -32020},
		"tool name header differs": {`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"echo","arguments":{"text":"x"},` + meta + `}}`,
			modern("tools/call", "Mcp-Name", "other"), 400, -32020},
		"client capabilities missing": {`{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28"}}}`,
			modern("tools/list"), 400, -32602},
		"modern header, nothing in the body": {`{"jsonrpc":"2.0","id":1,"method":"tools/list"}`, modern("tools/list"), 400, -32602},
		"unknown method":                     {`{"jsonrpc":"2.0","id":1,"method":"resources/list","params":{` + meta + `}}`, modern("resources/list"), 404, -32601},
		// A problem with the call itself is 200 with an error: a bare 4xx would tell the client to
		// fall back to the legacy transport.
		"unknown tool":     {`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"nope",` + meta + `}}`, modern("tools/call", "Mcp-Name", "nope"), 200, -32602},
		"no tool name":     {`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{` + meta + `}}`, modern("tools/call"), 200, -32602},
		"ping, now gone":   {`{"jsonrpc":"2.0","id":1,"method":"ping","params":{` + meta + `}}`, modern("ping"), 404, -32601},
		"bad base64 name":  {`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"echo",` + meta + `}}`, modern("tools/call", "Mcp-Name", "=?base64?***?="), 400, -32020},
		"version not text": {`{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":7}}}`, modern("tools/list"), 400, -32602},
	} {
		code, r, body := do(t, s, "POST", c.body, c.headers)
		if code != c.status || r.Error == nil || r.Error.Code != c.code {
			t.Errorf("%s: got %d %s, want HTTP %d with error %d", name, code, body, c.status, c.code)
		}
	}
	// An unsupported version names the versions that are supported, so the client can retry.
	_, r, _ := do(t, s, "POST", `{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{`+old+`}}`, map[string]string{"MCP-Protocol-Version": "2027-01-01", "Mcp-Method": "tools/list"})
	if sup, _ := r.Error.Data["supported"].([]any); len(sup) == 0 || sup[0] != Modern || r.Error.Data["requested"] != "2027-01-01" {
		t.Errorf("unsupported-version data: %+v", r.Error.Data)
	}
}

// Clients from before 2026-07-28 open with initialize; they are served without a session.
func TestLegacyHandshake(t *testing.T) {
	s := testServer()
	code, r, _ := do(t, s, "POST", `{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"c","version":"1"}}}`, nil)
	if code != 200 || r.Result.ProtocolVersion != "2025-06-18" || r.Result.ServerInfo["name"] != "portfolio" || r.Result.ResultType != "" {
		t.Fatalf("initialize: %d %+v", code, r)
	}
	// A version this server does not know is answered with the newest legacy one it does.
	if _, r, _ = do(t, s, "POST", `{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2023-01-01"}}`, nil); r.Result.ProtocolVersion != "2025-11-25" {
		t.Errorf("unknown legacy version negotiated to %q", r.Result.ProtocolVersion)
	}
	if code, _, body := do(t, s, "POST", `{"jsonrpc":"2.0","method":"notifications/initialized"}`, nil); code != 202 || body != "" {
		t.Errorf("notification: %d %q, want 202 and no body", code, body)
	}
	h := map[string]string{"MCP-Protocol-Version": "2025-06-18"}
	if code, r, _ = do(t, s, "POST", `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`, h); code != 200 || len(r.Result.Tools) != 1 {
		t.Fatalf("legacy tools/list: %d %+v", code, r)
	}
	if code, r, _ = do(t, s, "POST", `{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"echo","arguments":{"text":"yo"}}}`, h); code != 200 || r.Result.Content[0].Text != "yo via http://site.test" {
		t.Fatalf("legacy tools/call: %d %+v", code, r)
	}
	// ping's empty result must still be present, or the response is not valid JSON-RPC.
	if _, _, body := do(t, s, "POST", `{"jsonrpc":"2.0","id":3,"method":"ping"}`, h); !strings.Contains(body, `"result":{}`) {
		t.Errorf("ping: %s", body)
	}
	// 200 with an error body: these revisions read an HTTP 404 as an expired session.
	if code, r, _ = do(t, s, "POST", `{"jsonrpc":"2.0","id":4,"method":"prompts/list"}`, h); code != 200 || r.Error == nil || r.Error.Code != -32601 {
		t.Errorf("legacy unknown method: %d %+v", code, r)
	}
	if code, _, _ = do(t, s, "POST", `{"jsonrpc":"2.0","id":5,"method":"tools/list"}`, map[string]string{"MCP-Protocol-Version": "1999-01-01"}); code != 400 {
		t.Errorf("unknown legacy header version: %d, want 400", code)
	}
}

func TestTransportRules(t *testing.T) {
	s := testServer()
	for _, m := range []string{"GET", "DELETE"} {
		req := httptest.NewRequest(m, "http://site.test/mcp", nil)
		rec := httptest.NewRecorder()
		s.ServeHTTP(rec, req)
		if rec.Code != http.StatusMethodNotAllowed || rec.Header().Get("Allow") != "POST" {
			t.Errorf("%s: %d Allow %q, want 405 POST", m, rec.Code, rec.Header().Get("Allow"))
		}
	}
	list := `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`
	for name, c := range map[string]struct {
		body    string
		headers map[string]string
		status  int
	}{
		"a foreign browser origin":   {list, map[string]string{"Origin": "https://evil.example"}, 403},
		"the site's own origin":      {list, map[string]string{"Origin": "http://site.test"}, 200},
		"no origin (not a browser)":  {list, nil, 200},
		"a batch from 2025-06-18 on": {`[` + list + `]`, map[string]string{"MCP-Protocol-Version": "2025-06-18"}, 400},
		"not JSON":                   {`{`, nil, 400},
		"not JSON-RPC 2.0":           {`{"id":1,"method":"tools/list"}`, nil, 400},
		"a null id":                  {`{"jsonrpc":"2.0","id":null,"method":"tools/list"}`, nil, 400},
		"a body over the size limit": {`{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"pad":"` + strings.Repeat("x", maxBody) + `"}}`, nil, 400},
	} {
		if code, _, body := do(t, s, "POST", c.body, c.headers); code != c.status {
			t.Errorf("%s: got %d %.80s, want %d", name, code, body, c.status)
		}
	}
	s.AllowedOrigins = []string{"https://inspector.example"}
	if code, _, _ := do(t, s, "POST", list, map[string]string{"Origin": "https://inspector.example"}); code != 200 {
		t.Errorf("an allowed origin was refused: %d", code)
	}
}

// A client on another revision, older or newer, is told which versions this server speaks before
// any rule of 2026-07-28 is applied to its request.
func TestVersionIsSettledFirst(t *testing.T) {
	s := testServer()
	future := `"_meta":{"io.modelcontextprotocol/protocolVersion":"2027-01-01"}`
	for name, h := range map[string]map[string]string{
		"no capabilities and no Mcp-Method": {"MCP-Protocol-Version": "2027-01-01"},
		"everything but the version right":  {"MCP-Protocol-Version": "2027-01-01", "Mcp-Method": "tools/list"},
	} {
		code, r, body := do(t, s, "POST", `{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{`+future+`}}`, h)
		if code != 400 || r.Error == nil || r.Error.Code != -32022 || r.Error.Data["requested"] != "2027-01-01" {
			t.Errorf("%s: %d %s, want 400 with -32022", name, code, body)
		}
	}
	// Only the header names a version: still a version question first.
	if code, r, body := do(t, s, "POST", `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`, map[string]string{"MCP-Protocol-Version": "2027-01-01"}); code != 400 || r.Error == nil || r.Error.Code != -32022 {
		t.Errorf("header-only future version: %d %s", code, body)
	}
	// A handshake revision sent in the stateless shape is pointed at initialize.
	_, r, _ := do(t, s, "POST", `{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2025-11-25","io.modelcontextprotocol/clientCapabilities":{}}}}`, map[string]string{"MCP-Protocol-Version": "2025-11-25", "Mcp-Method": "tools/list"})
	if r.Error == nil || r.Error.Code != -32022 || !strings.Contains(r.Error.Message, "initialize") {
		t.Errorf("legacy version in the modern shape: %+v", r.Error)
	}
	// A version header that is not a date is not compared as one.
	if code, _, body := do(t, s, "POST", `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`, map[string]string{"MCP-Protocol-Version": "latest"}); code != 400 || !strings.Contains(body, "Unsupported MCP-Protocol-Version 'latest'") {
		t.Errorf("non-date header: %d %s", code, body)
	}
}

// The shape of a request is checked before anything is done with it, and an error always carries
// the id: the request's when it could be read, null when it could not.
func TestRequestShape(t *testing.T) {
	s := testServer()
	h := map[string]string{"MCP-Protocol-Version": "2025-06-18"}
	for name, c := range map[string]struct {
		body   string
		code   int
		withID bool
	}{
		"an object as id":        {`{"jsonrpc":"2.0","id":{"a":1},"method":"tools/list"}`, -32600, false},
		"true as id":             {`{"jsonrpc":"2.0","id":true,"method":"tools/list"}`, -32600, false},
		"an array as id":         {`{"jsonrpc":"2.0","id":[1],"method":"tools/list"}`, -32600, false},
		"a fraction as id":       {`{"jsonrpc":"2.0","id":1.5,"method":"tools/list"}`, -32600, false},
		"an exponent as id":      {`{"jsonrpc":"2.0","id":1e3,"method":"tools/list"}`, -32600, false},
		"a number as method":     {`{"jsonrpc":"2.0","id":7,"method":5}`, -32600, true},
		"a number as jsonrpc":    {`{"jsonrpc":2.0,"id":7,"method":"tools/list"}`, -32600, true},
		"an array as params":     {`{"jsonrpc":"2.0","id":7,"method":"tools/list","params":[1]}`, -32602, true},
		"a number, not a object": {`5`, -32600, false},
		"not JSON at all":        {`{"jsonrpc"`, -32700, false},
	} {
		code, r, body := do(t, s, "POST", c.body, h)
		if code != 400 || r.Error == nil || r.Error.Code != c.code {
			t.Errorf("%s: %d %s, want 400 with %d", name, code, body, c.code)
			continue
		}
		if want := `"id":null`; !c.withID && !strings.Contains(body, want) {
			t.Errorf("%s: error without %s: %s", name, want, body)
		}
		if c.withID && r.ID != float64(7) {
			t.Errorf("%s: lost the id: %s", name, body)
		}
	}
	// Valid ids of both kinds are echoed as sent.
	for _, id := range []string{`"abc"`, `-3`, `12345678901234567890`} {
		if _, _, body := do(t, s, "POST", `{"jsonrpc":"2.0","id":`+id+`,"method":"tools/list"}`, h); !strings.Contains(body, `"id":`+id) {
			t.Errorf("id %s not echoed: %s", id, body)
		}
	}
	// JSON-RPC is UTF-8; a body that is not is refused rather than echoed back broken.
	if code, r, _ := do(t, s, "POST", "{\"jsonrpc\":\"2.0\",\"id\":\"\xff\",\"method\":\"tools/list\"}", h); code != 400 || r.Error == nil || r.Error.Code != -32700 {
		t.Errorf("invalid UTF-8: %d %+v", code, r.Error)
	}
}

// 2025-03-26 required servers to accept batches. Its clients send no version header; later
// revisions removed batches, and the stateless one never had them.
func TestBatches(t *testing.T) {
	s := testServer()
	post := func(body string, h map[string]string) (int, string) {
		code, _, out := do(t, s, "POST", body, h)
		return code, out
	}
	list := `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`
	note := `{"jsonrpc":"2.0","method":"notifications/initialized"}`

	code, body := post(`[`+list+`,`+note+`,{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"echo","arguments":{"text":"b"}}}]`, nil)
	var out []answer
	if err := json.Unmarshal([]byte(body), &out); err != nil || code != 200 || len(out) != 2 {
		t.Fatalf("batch: %d %s", code, body)
	}
	if len(out[0].Result.Tools) != 1 || out[1].Result.Content[0].Text != "b via http://site.test" {
		t.Errorf("batch answers: %s", body)
	}
	if code, body := post(`[`+note+`,`+note+`]`, nil); code != 202 || body != "" {
		t.Errorf("all notifications: %d %q, want 202 and no body", code, body)
	}
	if code, _ := post(`[`+list+`]`, map[string]string{"MCP-Protocol-Version": "2025-03-26"}); code != 200 {
		t.Errorf("batch with the 2025-03-26 header: %d", code)
	}
	for name, c := range map[string]struct {
		body string
		h    map[string]string
	}{
		"empty":                    {`[]`, nil},
		"too many":                 {`[` + strings.TrimSuffix(strings.Repeat(list+",", maxBatch+1), ",") + `]`, nil},
		"from a later revision":    {`[` + list + `]`, map[string]string{"MCP-Protocol-Version": "2025-11-25"}},
		"from the modern revision": {`[` + list + `]`, map[string]string{"MCP-Protocol-Version": Modern}},
	} {
		if code, body := post(c.body, c.h); code != 400 {
			t.Errorf("%s: %d %.120s, want 400", name, code, body)
		}
	}
	// Inside a batch, a stateless request and initialize each get their own error.
	code, body = post(`[{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{`+meta+`}},{"jsonrpc":"2.0","id":2,"method":"initialize"}]`, nil)
	if code != 200 || strings.Count(body, `"code":-32600`) != 2 {
		t.Errorf("modern request and initialize in a batch: %d %s", code, body)
	}
}

func TestTooManyRequests(t *testing.T) {
	rec := httptest.NewRecorder()
	TooManyRequests(rec, 60, 12500*time.Millisecond)
	var r answer
	if err := json.Unmarshal(rec.Body.Bytes(), &r); err != nil || rec.Code != 429 || r.Error == nil || r.Error.Code != -32000 || rec.Header().Get("Retry-After") != "13" {
		t.Errorf("rate limit answer: %d %s Retry-After %q", rec.Code, rec.Body.String(), rec.Header().Get("Retry-After"))
	}
	if !strings.Contains(rec.Body.String(), `"id":null`) {
		t.Errorf("rate limit answer has no null id: %s", rec.Body.String())
	}
}
