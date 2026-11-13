package ask

import (
	"context"
	"strings"
	"testing"

	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
)

// Retrieval's phases are spans inside a traced request. Called from an untraced one (the MCP
// endpoint is not traced), it must not start root traces of its own.
func TestRetrieveSpansOnlyInsideATrace(t *testing.T) {
	spans := tracetest.NewSpanRecorder()
	tp := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(spans))
	defer func() { _ = tp.Shutdown(context.Background()) }()
	saved := tracer
	tracer = tp.Tracer("portfolio/ask")
	defer func() { tracer = saved }()

	ix := NewIndex(facts(t))
	ix.Retrieve(context.Background(), "How did ZhenXi cut the cloud bill?")
	if n := len(spans.Ended()); n != 0 {
		t.Fatalf("an untraced question ended %d spans, want none", n)
	}

	ctx, request := tp.Tracer("test").Start(context.Background(), "POST /api/ask")
	ix.Retrieve(ctx, "How did ZhenXi cut the cloud bill?")
	request.End()
	var phases []string
	for _, s := range spans.Ended() {
		if s.Parent().SpanID() == request.SpanContext().SpanID() {
			phases = append(phases, s.Name())
		}
	}
	if got := strings.Join(phases, " "); got != "retrieve.tokenize retrieve.rank retrieve.compose" {
		t.Fatalf("phases of a traced question: %q", got)
	}
}
