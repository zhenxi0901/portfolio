package tracing

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"

	"github.com/zhenxi0901/portfolio/api/internal/gcp"
)

func TestRecorderReturnsATracesSpansInOrder(t *testing.T) {
	rec, shutdown := Setup("test", "v1", nil)
	defer func() { _ = shutdown(t.Context()) }()
	tr := otel.Tracer("test")
	start := time.Now()
	ctx, root := tr.Start(t.Context(), "root")
	_, a := tr.Start(ctx, "first", trace.WithAttributes(attribute.Int("n", 3)))
	a.End()
	_, b := tr.Start(ctx, "second")
	b.End()

	spans := rec.Take(root.SpanContext().TraceID(), start)
	if len(spans) != 2 || spans[0].Name != "first" || spans[1].Name != "second" {
		t.Fatalf("spans %+v", spans)
	}
	if spans[0].Parent != root.SpanContext().SpanID().String() || spans[0].Attrs["n"] != "3" || spans[0].StartMs < 0 {
		t.Errorf("first span %+v", spans[0])
	}
	// Taken once; a second Take finds nothing.
	if again := rec.Take(root.SpanContext().TraceID(), start); len(again) != 0 {
		t.Errorf("spans were not forgotten: %+v", again)
	}
	root.End()
}

func TestCloudTraceExport(t *testing.T) {
	meta := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "project-id") {
			_, _ = io.WriteString(w, "demo")
			return
		}
		_, _ = io.WriteString(w, `{"access_token":"tok","expires_in":3600}`)
	}))
	defer meta.Close()
	var got struct {
		Spans []map[string]any `json:"spans"`
	}
	var auth, path string
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth, path = r.Header.Get("Authorization"), r.URL.Path
		_ = json.NewDecoder(r.Body).Decode(&got)
		_, _ = io.WriteString(w, "{}")
	}))
	defer api.Close()

	md := gcp.NewMetadata()
	md.Base = meta.URL
	exp := NewCloudTrace(md)
	exp.api = api.URL
	_, shutdown := Setup("portfolio", "v1", exp)
	ctx, root := otel.Tracer("test").Start(t.Context(), "POST /api/ask", trace.WithSpanKind(trace.SpanKindServer))
	_, child := otel.Tracer("test").Start(ctx, "ask.retrieve", trace.WithAttributes(attribute.Int("sources", 2), attribute.Bool("hit", false)))
	child.End()
	root.End()
	if err := shutdown(t.Context()); err != nil { // flushes the batch
		t.Fatal(err)
	}

	if auth != "Bearer tok" || path != "/projects/demo/traces:batchWrite" {
		t.Fatalf("auth %q path %q", auth, path)
	}
	if len(got.Spans) != 2 {
		t.Fatalf("exported %d spans, want 2", len(got.Spans))
	}
	byName := map[string]map[string]any{}
	for _, s := range got.Spans {
		byName[s["displayName"].(map[string]any)["value"].(string)] = s
	}
	c, r := byName["ask.retrieve"], byName["POST /api/ask"]
	if c == nil || r == nil || c["parentSpanId"] != r["spanId"] || r["spanKind"] != "SERVER" {
		t.Fatalf("spans %+v", got.Spans)
	}
	attrs := c["attributes"].(map[string]any)["attributeMap"].(map[string]any)
	if attrs["sources"].(map[string]any)["intValue"] != "2" || attrs["service.name"] == nil {
		t.Errorf("attributes %+v", attrs)
	}
	if !strings.HasPrefix(c["name"].(string), "projects/demo/traces/") {
		t.Errorf("span name %v", c["name"])
	}
}

// Root spans end after the response, so nobody would take them: they must not pile up.
func TestRecorderSkipsRootSpans(t *testing.T) {
	rec, shutdown := Setup("test", "v1", nil)
	defer func() { _ = shutdown(t.Context()) }()
	for range 50 {
		_, root := otel.Tracer("test").Start(t.Context(), "root")
		root.End()
	}
	rec.mu.Lock()
	n := len(rec.traces)
	rec.mu.Unlock()
	if n != 0 {
		t.Errorf("%d traces held for root-only spans, want 0", n)
	}
}
