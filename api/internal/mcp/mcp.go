// Package mcp is a small Model Context Protocol server over Streamable HTTP, standard library only,
// so an AI agent can use this site as a set of tools. It is stateless and speaks two eras of the
// protocol on one endpoint:
//
//   - modern (2026-07-28): no handshake. Every request carries its protocol version and client
//     capabilities in params._meta, mirrored in HTTP headers that are checked against the body.
//   - legacy (2025-11-25 back to 2025-03-26): the client opens with an initialize handshake. No
//     session id is issued, which those revisions allow, so nothing is kept between requests either.
//
// Only tools are offered, all of them read-only.
package mcp

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

// Modern is the protocol revision that dropped the handshake; revisions from it on are "modern".
const Modern = "2026-07-28"

// legacy revisions this server answers after an initialize handshake, newest first. 2024-11-05 is
// not among them: it used the older HTTP+SSE transport, which this endpoint does not serve.
var legacy = []string{"2025-11-25", "2025-06-18", "2025-03-26"}

// batched is the one revision whose clients may send JSON-RPC batches: 2025-06-18 removed them,
// and the modern revision never had them.
const batched = "2025-03-26"

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
	codeServerBusy     = -32000
	codeHeaderMismatch = -32020
	codeUnsupported    = -32022

	maxBody  = 64 << 10
	maxBatch = 20
)

// Result is what a tool returns: text for the model, and the same content as data.
//
// The text is prose, not the serialised data. The tools spec suggests a text copy of
// structuredContent for clients that cannot read it; here every fact in the data is also in the
// prose, which is what a model reads best, so those clients lose nothing.
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

// request is a JSON-RPC request whose shape has been checked. ID is nil for a notification.
type request struct {
	ID     json.RawMessage
	Method string
	Params json.RawMessage
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
}

// reply is one response and the HTTP status it goes out with when sent on its own. A nil body is
// a notification's: there is nothing to send.
type reply struct {
	status int
	body   any
}

func result(id json.RawMessage, v any) reply {
	return reply{http.StatusOK, message(id, "result", v)}
}

func failure(status int, id json.RawMessage, code int, msg string, data any) reply {
	return reply{status, message(id, "error", rpcError{Code: code, Message: msg, Data: data})}
}

// message is one JSON-RPC response object. JSON-RPC requires the id even when the request's could
// not be read; it is null then.
func message(id json.RawMessage, key string, value any) map[string]any {
	m := map[string]any{"jsonrpc": "2.0", key: value, "id": nil}
	if len(id) > 0 {
		m["id"] = id
	}
	return m
}

func send(w http.ResponseWriter, rep reply) {
	if rep.body == nil {
		w.WriteHeader(rep.status)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(rep.status)
	_ = json.NewEncoder(w).Encode(rep.body)
}

// TooManyRequests answers a client over its rate limit in JSON-RPC, so an MCP client reads it as
// an error from this server rather than as a reason to fall back to another transport.
func TooManyRequests(w http.ResponseWriter, perMinute int, retry time.Duration) {
	wait := int(math.Ceil(retry.Seconds()))
	w.Header().Set("Retry-After", strconv.Itoa(wait))
	send(w, failure(http.StatusTooManyRequests, nil, codeServerBusy,
		fmt.Sprintf("Too many requests: %d a minute per client. Try again in %d s.", perMinute, wait), nil))
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	// The modern transport has no GET stream and no sessions to DELETE; neither did this server's
	// legacy side, which those revisions answer with 405 as well.
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		send(w, failure(http.StatusMethodNotAllowed, nil, codeInvalidRequest, "This MCP endpoint accepts POST only.", nil))
		return
	}
	// Browsers send Origin with every POST. A page on another origin may call this endpoint only if
	// that origin is on the list; the site's own pages pass because their Origin names the host
	// they came from. This does not stop DNS rebinding, where the attacker's origin and the Host
	// agree; nothing here is worth rebinding for, as every tool is read-only and every fact public.
	if o := r.Header.Get("Origin"); o != "" && !s.originAllowed(o, r.Host) {
		send(w, failure(http.StatusForbidden, nil, codeInvalidRequest, "Origin not allowed.", nil))
		return
	}

	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBody))
	if err != nil {
		send(w, failure(http.StatusBadRequest, nil, codeInvalidRequest, "Request body too large or unreadable.", nil))
		return
	}
	// JSON-RPC messages are UTF-8; anything else could not be echoed back as valid JSON.
	if !utf8.Valid(raw) {
		send(w, failure(http.StatusBadRequest, nil, codeParse, "The body is not valid UTF-8.", nil))
		return
	}
	header := r.Header.Get("MCP-Protocol-Version")
	if body := bytes.TrimSpace(raw); len(body) > 0 && body[0] == '[' {
		send(w, s.batch(r, body, header))
		return
	}
	send(w, s.one(r, raw, header, false))
}

// one answers a single JSON-RPC message, alone or as part of a batch.
func (s *Server) one(r *http.Request, raw []byte, header string, inBatch bool) reply {
	req, bad := parse(raw)
	if bad != nil {
		return *bad
	}
	// A notification has no id and gets no response body. Nothing here needs one, in either era.
	if req.ID == nil {
		return reply{status: http.StatusAccepted}
	}
	var p struct {
		Meta map[string]json.RawMessage `json:"_meta"`
	}
	_ = json.Unmarshal(req.Params, &p) // absent params carry no _meta; parse has refused non-objects
	_, inBody := p.Meta[metaVersion]
	if inBody || modernVersion(header) {
		if inBatch {
			return failure(http.StatusBadRequest, req.ID, codeInvalidRequest, "Requests in protocol version "+Modern+" cannot be batched: send one per POST.", nil)
		}
		return s.modern(r, req, p.Meta, header)
	}
	if inBatch && req.Method == "initialize" {
		return failure(http.StatusBadRequest, req.ID, codeInvalidRequest, "initialize must not be part of a batch.", nil)
	}
	return s.legacy(r, req, header)
}

// parse checks that raw is one JSON-RPC 2.0 request with a usable shape: an object, "jsonrpc" the
// string "2.0", "method" a non-empty string, an id (if any) that is a string or an integer, and
// params (if any) an object.
func parse(raw []byte) (request, *reply) {
	refuse := func(status int, id json.RawMessage, code int, msg string) (request, *reply) {
		rep := failure(status, id, code, msg, nil)
		return request{}, &rep
	}
	var env struct {
		JSONRPC json.RawMessage `json:"jsonrpc"`
		ID      json.RawMessage `json:"id"`
		Method  json.RawMessage `json:"method"`
		Params  json.RawMessage `json:"params"`
	}
	if err := json.Unmarshal(raw, &env); err != nil {
		if json.Valid(raw) {
			return refuse(http.StatusBadRequest, nil, codeInvalidRequest, "A JSON-RPC request is a JSON object.")
		}
		return refuse(http.StatusBadRequest, nil, codeParse, "The body is not valid JSON.")
	}
	var id json.RawMessage
	if len(env.ID) > 0 {
		if !validID(env.ID) {
			return refuse(http.StatusBadRequest, nil, codeInvalidRequest, "The request id must be a string or an integer.")
		}
		id = env.ID
	}
	var version, method string
	if json.Unmarshal(env.JSONRPC, &version) != nil || version != "2.0" || json.Unmarshal(env.Method, &method) != nil || method == "" {
		return refuse(http.StatusBadRequest, id, codeInvalidRequest, `Not a JSON-RPC 2.0 request: "jsonrpc" must be "2.0" and "method" a non-empty string.`)
	}
	if p := bytes.TrimSpace(env.Params); len(p) > 0 && p[0] != '{' && string(p) != "null" {
		return refuse(http.StatusBadRequest, id, codeInvalidParams, `"params" must be an object.`)
	}
	return request{ID: id, Method: method, Params: env.Params}, nil
}

// validID reports whether a JSON-RPC id is a string or an integer, the two kinds MCP allows.
func validID(raw json.RawMessage) bool {
	switch raw[0] {
	case '"':
		var s string
		return json.Unmarshal(raw, &s) == nil
	case '-', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9':
		var n json.Number
		return json.Unmarshal(raw, &n) == nil && !strings.ContainsAny(string(n), ".eE")
	}
	return false
}

// modernVersion reports whether a version header names the modern revision or a later one. It is
// a date; anything else ("latest", a draft name) is not compared at all.
func modernVersion(v string) bool {
	_, err := time.Parse("2006-01-02", v)
	return err == nil && v >= Modern
}

// modern serves one self-describing request (2026-07-28).
func (s *Server) modern(r *http.Request, req request, meta map[string]json.RawMessage, header string) reply {
	raw, inBody := meta[metaVersion]
	var bodyVersion string
	if inBody && (json.Unmarshal(raw, &bodyVersion) != nil || bodyVersion == "") {
		return failure(http.StatusBadRequest, req.ID, codeInvalidParams, "params._meta."+metaVersion+" must be a non-empty string.", nil)
	}
	// The version is settled before anything else is judged, so a client on any revision, older or
	// newer, is told what this server speaks instead of tripping over a rule of this one.
	if inBody && header != "" && header != bodyVersion {
		return failure(http.StatusBadRequest, req.ID, codeHeaderMismatch, "Header mismatch: MCP-Protocol-Version header '"+header+"' does not match the body's '"+bodyVersion+"'.", nil)
	}
	version := bodyVersion
	if !inBody {
		version = header
	}
	if version != Modern {
		return failure(http.StatusBadRequest, req.ID, codeUnsupported, unsupported(version), map[string]any{"supported": Supported, "requested": version})
	}
	if !inBody {
		return failure(http.StatusBadRequest, req.ID, codeInvalidParams, "params._meta is missing "+metaVersion+".", nil)
	}
	if _, ok := meta[metaCapabilities]; !ok {
		return failure(http.StatusBadRequest, req.ID, codeInvalidParams, "params._meta is missing "+metaCapabilities+".", nil)
	}
	// The headers mirror the body so that proxies can route on them; a mismatch means two parts of
	// the network would act on different requests, so it is refused.
	if header == "" {
		return failure(http.StatusBadRequest, req.ID, codeHeaderMismatch, "Header mismatch: the MCP-Protocol-Version header is missing.", nil)
	}
	if got := r.Header.Get("Mcp-Method"); got != req.Method {
		return failure(http.StatusBadRequest, req.ID, codeHeaderMismatch, "Header mismatch: Mcp-Method header '"+got+"' does not match the body's method '"+req.Method+"'.", nil)
	}

	info := map[string]any{metaServerInfo: s.info()}
	switch req.Method {
	case "server/discover":
		return result(req.ID, map[string]any{
			"resultType": "complete", "supportedVersions": Supported, "capabilities": map[string]any{"tools": map[string]any{}},
			"instructions": s.Instructions, "_meta": info, "ttlMs": 3600000, "cacheScope": "public",
		})
	case "tools/list":
		return result(req.ID, map[string]any{"resultType": "complete", "tools": s.list(), "_meta": info, "ttlMs": 300000, "cacheScope": "public"})
	case "tools/call":
		// Problems with the call itself are answered with 200 and a JSON-RPC error: a 4xx without a
		// transport-level error is what tells a client to fall back to the legacy transport.
		name, args, err := callParams(req.Params)
		if err != nil {
			return failure(http.StatusOK, req.ID, codeInvalidParams, err.Error(), nil)
		}
		if got, ok := decodeName(r.Header.Get("Mcp-Name")); !ok || got != name {
			return failure(http.StatusBadRequest, req.ID, codeHeaderMismatch, "Header mismatch: the Mcp-Name header is missing or does not match the body's tool name '"+name+"'.", nil)
		}
		tool, found := s.byName[name]
		if !found {
			return failure(http.StatusOK, req.ID, codeInvalidParams, "Unknown tool: "+name, nil)
		}
		res := s.call(r, tool, args)
		res["resultType"], res["_meta"] = "complete", info
		return result(req.ID, res)
	default:
		// 404 with a JSON-RPC body: the body is what tells a client this is a modern server that
		// lacks the method, not an old server without the endpoint. ping is here too: 2026-07-28
		// removed it.
		return failure(http.StatusNotFound, req.ID, codeMethodNotFound, "Method not found: "+req.Method, nil)
	}
}

// unsupported explains a version the modern side cannot serve, and how to reach the ones it can.
func unsupported(v string) string {
	if slices.Contains(legacy, v) {
		return "Protocol version " + v + " starts with a handshake: send initialize, without _meta. Or use " + Modern + "."
	}
	return "Unsupported protocol version '" + v + "'. This server speaks " + Modern + " without a handshake, and " +
		strings.Join(legacy, ", ") + " after an initialize request."
}

// legacy serves a client that opens with initialize (2025-11-25 and earlier).
func (s *Server) legacy(r *http.Request, req request, header string) reply {
	if header != "" && !slices.Contains(legacy, header) {
		return failure(http.StatusBadRequest, req.ID, codeInvalidRequest, "Unsupported MCP-Protocol-Version '"+header+"'. Supported: "+strings.Join(Supported, ", ")+".", nil)
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
		return result(req.ID, map[string]any{
			"protocolVersion": version, "capabilities": map[string]any{"tools": map[string]any{}},
			"serverInfo": s.info(), "instructions": s.Instructions,
		})
	case "ping":
		return result(req.ID, map[string]any{})
	case "tools/list":
		return result(req.ID, map[string]any{"tools": s.list()})
	case "tools/call":
		name, args, err := callParams(req.Params)
		if err != nil {
			return failure(http.StatusOK, req.ID, codeInvalidParams, err.Error(), nil)
		}
		tool, found := s.byName[name]
		if !found {
			return failure(http.StatusOK, req.ID, codeInvalidParams, "Unknown tool: "+name, nil)
		}
		return result(req.ID, s.call(r, tool, args))
	default:
		// 200, not 404: these revisions read an HTTP 404 as "your session has expired".
		return failure(http.StatusOK, req.ID, codeMethodNotFound, "Method not found: "+req.Method, nil)
	}
}

// batch answers a JSON-RPC batch. 2025-03-26 required servers to accept them; its clients send no
// version header, so a batch is served when the header is absent or names that revision, and
// refused for any later one.
func (s *Server) batch(r *http.Request, raw []byte, header string) reply {
	if header != "" && header != batched {
		return failure(http.StatusBadRequest, nil, codeInvalidRequest, "Batches are not part of protocol version "+header+": send one JSON-RPC message per POST.", nil)
	}
	var items []json.RawMessage
	if err := json.Unmarshal(raw, &items); err != nil {
		return failure(http.StatusBadRequest, nil, codeParse, "The body is not valid JSON.", nil)
	}
	if len(items) == 0 {
		return failure(http.StatusBadRequest, nil, codeInvalidRequest, "An empty batch is not a request.", nil)
	}
	if len(items) > maxBatch {
		return failure(http.StatusBadRequest, nil, codeInvalidRequest, fmt.Sprintf("A batch may hold at most %d messages.", maxBatch), nil)
	}
	var out []any
	for _, item := range items {
		if rep := s.one(r, item, header, true); rep.body != nil {
			out = append(out, rep.body)
		}
	}
	if len(out) == 0 {
		return reply{status: http.StatusAccepted}
	}
	return reply{http.StatusOK, out}
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
