package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
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

type reply struct {
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

func do(t *testing.T, s *Server, method, body string, headers map[string]string) (int, reply, string) {
	t.Helper()
	req := httptest.NewRequest(method, "http://site.test/mcp", strings.NewReader(body))
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, req)
	var r reply
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
		"unknown tool":                       {`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"nope",` + meta + `}}`, modern("tools/call", "Mcp-Name", "nope"), 400, -32602},
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
		"a batch":                    {`[` + list + `]`, nil, 400},
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
