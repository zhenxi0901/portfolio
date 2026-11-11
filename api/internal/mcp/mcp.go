// Package mcp is a small Model Context Protocol server over Streamable HTTP, standard library only,
// so an AI agent can use this site as a set of tools. It is stateless and speaks two eras of the
// protocol on one endpoint:
//
//   - modern (2026-07-28): no handshake. Every request carries its protocol version and client
//     capabilities in params._meta, mirrored in HTTP headers that are checked against the body.
//   - legacy (2025-11-25 and earlier): the client opens with an initialize handshake. No session id
//     is issued, which those revisions allow, so nothing is kept between requests either.
//
// Only tools are offered, all of them read-only.
package mcp

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strings"
)

// Modern is the protocol revision that dropped the handshake; revisions from it on are "modern".
const Modern = "2026-07-28"

// legacy revisions this server answers after an initialize handshake, newest first.
var legacy = []string{"2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"}

// Supported is what an UnsupportedProtocolVersion error and server/discover advertise.
var Supported = append([]string{Modern}, legacy...)

const (
	metaVersion      = "io.modelcontextprotocol/protocolVersion"
	metaCapabilities = "io.modelcontextprotocol/clientCapabilities"
	metaServerInfo   = "io.modelcontextprotocol/serverInfo"

	codeParse          = -32700
	codeInvalidRequest = -32600
	codeMethodNotFound = -32601
	codeInvalidParams  = -32602
	codeHeaderMismatch = -32020
	codeUnsupported    = -32022

	maxBody = 64 << 10
)

// Result is what a tool returns: text for the model, and the same content as data.
type Result struct {
	Text       string
	Structured any
}

// Tool is one read-only tool. Call's error is a tool execution error: it reaches the model as a
// result with isError set, so the model can correct its input and retry.
type Tool struct {
	Name, Title, Description string
	// InputSchema is a JSON Schema object (2020-12).
	InputSchema map[string]any
	// Call receives the site's own base URL, as the client reached it, for building links.
	Call func(ctx context.Context, base string, args json.RawMessage) (Result, error)
}

// Server answers MCP requests for a fixed set of tools.
type Server struct {
	Name, Title, Version, Instructions string
	// AllowedOrigins are browser origins allowed besides the site's own. A request with no Origin
	// header (every non-browser client) is always allowed.
	AllowedOrigins []string

	tools  []Tool
	byName map[string]Tool
}

func New(name, title, version, instructions string, tools []Tool) *Server {
	s := &Server{Name: name, Title: title, Version: version, Instructions: instructions, tools: tools, byName: map[string]Tool{}}
	for _, t := range tools {
		s.byName[t.Name] = t
	}
	return s
}

type request struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	// The modern transport has no GET stream and no sessions to DELETE; neither did this server's
	// legacy side, which those revisions answer with 405 as well.
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		fail(w, http.StatusMethodNotAllowed, nil, codeInvalidRequest, "This MCP endpoint accepts POST only.", nil)
		return
	}
	// DNS-rebinding defence: a browser origin other than the site's own must be on the list.
	if o := r.Header.Get("Origin"); o != "" && !s.originAllowed(o, r.Host) {
		fail(w, http.StatusForbidden, nil, codeInvalidRequest, "Origin not allowed.", nil)
		return
	}

	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBody))
	if err != nil {
		fail(w, http.StatusBadRequest, nil, codeInvalidRequest, "Request body too large or unreadable.", nil)
		return
	}
	if strings.HasPrefix(strings.TrimSpace(string(raw)), "[") {
		fail(w, http.StatusBadRequest, nil, codeInvalidRequest, "Batches are not supported: send one JSON-RPC message per POST.", nil)
		return
	}
	var req request
	if err := json.Unmarshal(raw, &req); err != nil {
		fail(w, http.StatusBadRequest, nil, codeParse, "The body is not valid JSON.", nil)
		return
	}
	if req.JSONRPC != "2.0" || req.Method == "" {
		fail(w, http.StatusBadRequest, req.ID, codeInvalidRequest, `Not a JSON-RPC 2.0 request: "jsonrpc" must be "2.0" and "method" is required.`, nil)
		return
	}
	// A notification has no id and gets no response body. Nothing here needs one, in either era.
	if len(req.ID) == 0 {
		w.WriteHeader(http.StatusAccepted)
		return
	}
	if string(req.ID) == "null" {
		fail(w, http.StatusBadRequest, nil, codeInvalidRequest, "The request id must be a string or a number.", nil)
		return
	}

	var p struct {
		Meta map[string]json.RawMessage `json:"_meta"`
	}
	_ = json.Unmarshal(req.Params, &p) // absent or non-object params simply carry no _meta
	header := r.Header.Get("MCP-Protocol-Version")
	_, inBody := p.Meta[metaVersion]
	if inBody || header >= Modern {
		s.modern(w, r, req, p.Meta, header)
		return
	}
	s.legacy(w, r, req, header)
}

// modern serves one self-describing request (2026-07-28).
func (s *Server) modern(w http.ResponseWriter, r *http.Request, req request, meta map[string]json.RawMessage, header string) {
	var version string
	if err := json.Unmarshal(meta[metaVersion], &version); err != nil || version == "" {
		fail(w, http.StatusBadRequest, req.ID, codeInvalidParams, "params._meta is missing "+metaVersion+".", nil)
		return
	}
	if _, ok := meta[metaCapabilities]; !ok {
		fail(w, http.StatusBadRequest, req.ID, codeInvalidParams, "params._meta is missing "+metaCapabilities+".", nil)
		return
	}
	// The headers mirror the body so that proxies can route on them; a mismatch means two parts of
	// the network would act on different requests, so it is refused.
	switch {
	case header == "":
		fail(w, http.StatusBadRequest, req.ID, codeHeaderMismatch, "Header mismatch: the MCP-Protocol-Version header is missing.", nil)
		return
	case header != version:
		fail(w, http.StatusBadRequest, req.ID, codeHeaderMismatch, "Header mismatch: MCP-Protocol-Version header '"+header+"' does not match the body's '"+version+"'.", nil)
		return
	case r.Header.Get("Mcp-Method") != req.Method:
		fail(w, http.StatusBadRequest, req.ID, codeHeaderMismatch, "Header mismatch: Mcp-Method header '"+r.Header.Get("Mcp-Method")+"' does not match the body's method '"+req.Method+"'.", nil)
		return
	}
	if version != Modern {
		fail(w, http.StatusBadRequest, req.ID, codeUnsupported, "Unsupported protocol version", map[string]any{"supported": Supported, "requested": version})
		return
	}

	info := map[string]any{metaServerInfo: s.info()}
	switch req.Method {
	case "server/discover":
		ok(w, req.ID, map[string]any{
			"resultType": "complete", "supportedVersions": Supported, "capabilities": map[string]any{"tools": map[string]any{}},
			"instructions": s.Instructions, "_meta": info, "ttlMs": 3600000, "cacheScope": "public",
		})
	case "ping":
		ok(w, req.ID, map[string]any{"resultType": "complete", "_meta": info})
	case "tools/list":
		ok(w, req.ID, map[string]any{"resultType": "complete", "tools": s.list(), "_meta": info, "ttlMs": 300000, "cacheScope": "public"})
	case "tools/call":
		name, args, err := callParams(req.Params)
		if err != nil {
			fail(w, http.StatusBadRequest, req.ID, codeInvalidParams, err.Error(), nil)
			return
		}
		if got, ok := decodeName(r.Header.Get("Mcp-Name")); !ok || got != name {
			fail(w, http.StatusBadRequest, req.ID, codeHeaderMismatch, "Header mismatch: the Mcp-Name header is missing or does not match the body's tool name '"+name+"'.", nil)
			return
		}
		tool, found := s.byName[name]
		if !found {
			fail(w, http.StatusBadRequest, req.ID, codeInvalidParams, "Unknown tool: "+name, nil)
			return
		}
		res := s.call(r, tool, args)
		res["resultType"], res["_meta"] = "complete", info
		ok(w, req.ID, res)
	default:
		// 404 with a JSON-RPC body: the body is what tells a client this is a modern server that
		// lacks the method, not an old server without the endpoint.
		fail(w, http.StatusNotFound, req.ID, codeMethodNotFound, "Method not found: "+req.Method, nil)
	}
}

// legacy serves a client that opens with initialize (2025-11-25 and earlier).
func (s *Server) legacy(w http.ResponseWriter, r *http.Request, req request, header string) {
	if header != "" && !slices.Contains(legacy, header) {
		fail(w, http.StatusBadRequest, req.ID, codeInvalidRequest, "Unsupported MCP-Protocol-Version '"+header+"'. Supported: "+strings.Join(Supported, ", ")+".", nil)
		return
	}
	switch req.Method {
	case "initialize":
		var p struct {
			ProtocolVersion string `json:"protocolVersion"`
		}
		_ = json.Unmarshal(req.Params, &p)
		version := legacy[0]
		if slices.Contains(legacy, p.ProtocolVersion) {
			version = p.ProtocolVersion
		}
		ok(w, req.ID, map[string]any{
			"protocolVersion": version, "capabilities": map[string]any{"tools": map[string]any{}},
			"serverInfo": s.info(), "instructions": s.Instructions,
		})
	case "ping":
		ok(w, req.ID, map[string]any{})
	case "tools/list":
		ok(w, req.ID, map[string]any{"tools": s.list()})
	case "tools/call":
		name, args, err := callParams(req.Params)
		if err != nil {
			fail(w, http.StatusOK, req.ID, codeInvalidParams, err.Error(), nil)
			return
		}
		tool, found := s.byName[name]
		if !found {
			fail(w, http.StatusOK, req.ID, codeInvalidParams, "Unknown tool: "+name, nil)
			return
		}
		ok(w, req.ID, s.call(r, tool, args))
	default:
		// 200, not 404: these revisions read an HTTP 404 as "your session has expired".
		fail(w, http.StatusOK, req.ID, codeMethodNotFound, "Method not found: "+req.Method, nil)
	}
}

func (s *Server) info() map[string]any {
	return map[string]any{"name": s.Name, "title": s.Title, "version": s.Version}
}

// list is the tool catalogue, in a fixed order so clients can cache it.
func (s *Server) list() []map[string]any {
	out := make([]map[string]any, len(s.tools))
	for i, t := range s.tools {
		out[i] = map[string]any{
			"name": t.Name, "title": t.Title, "description": t.Description, "inputSchema": t.InputSchema,
			"annotations": map[string]any{"readOnlyHint": true, "destructiveHint": false, "idempotentHint": true, "openWorldHint": false},
		}
	}
	return out
}

func (s *Server) call(r *http.Request, t Tool, args json.RawMessage) map[string]any {
	res, err := t.Call(r.Context(), baseURL(r), args)
	if err != nil {
		return map[string]any{"content": []map[string]any{{"type": "text", "text": err.Error()}}, "isError": true}
	}
	out := map[string]any{"content": []map[string]any{{"type": "text", "text": res.Text}}, "isError": false}
	if res.Structured != nil {
		out["structuredContent"] = res.Structured
	}
	return out
}

func callParams(raw json.RawMessage) (name string, args json.RawMessage, err error) {
	var p struct {
		Name      string          `json:"name"`
		Arguments json.RawMessage `json:"arguments"`
	}
	if e := json.Unmarshal(raw, &p); e != nil || p.Name == "" {
		return "", nil, errors.New(`tools/call needs params.name, the tool to call`)
	}
	if len(p.Arguments) == 0 || string(p.Arguments) == "null" {
		p.Arguments = json.RawMessage(`{}`)
	}
	return p.Name, p.Arguments, nil
}

// decodeName undoes the transport's Base64 sentinel for header values that are not plain ASCII.
func decodeName(v string) (string, bool) {
	if v == "" {
		return "", false
	}
	if strings.HasPrefix(v, "=?base64?") && strings.HasSuffix(v, "?=") {
		b, err := base64.StdEncoding.DecodeString(strings.TrimSuffix(strings.TrimPrefix(v, "=?base64?"), "?="))
		return string(b), err == nil
	}
	return v, true
}

func (s *Server) originAllowed(origin, host string) bool {
	if slices.Contains(s.AllowedOrigins, origin) {
		return true
	}
	u, err := url.Parse(origin)
	return err == nil && u.Host != "" && u.Host == host
}

func baseURL(r *http.Request) string {
	scheme := "http"
	if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	return scheme + "://" + r.Host
}

func ok(w http.ResponseWriter, id json.RawMessage, result any) {
	write(w, http.StatusOK, id, "result", result)
}

func fail(w http.ResponseWriter, status int, id json.RawMessage, code int, msg string, data any) {
	write(w, status, id, "error", rpcError{Code: code, Message: msg, Data: data})
}

// write sends one JSON-RPC response. The id is left out only when the request's could not be read.
func write(w http.ResponseWriter, status int, id json.RawMessage, key string, value any) {
	msg := map[string]any{"jsonrpc": "2.0", key: value}
	if len(id) > 0 {
		msg["id"] = id
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(msg)
}
