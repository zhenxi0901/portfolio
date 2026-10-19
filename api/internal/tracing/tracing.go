// Package tracing sets up OpenTelemetry for the API: spans are exported to Cloud Trace (on Cloud
// Run) and also kept briefly in memory, so a handler can hand a request its own trace.
package tracing

import (
	"context"
	"sort"
	"sync"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
)

// Span is one finished span, flattened for an API response.
type Span struct {
	Name       string            `json:"name"`
	ID         string            `json:"id"`
	Parent     string            `json:"parent,omitempty"`
	StartMs    float64           `json:"start_ms"` // after the request's own start
	DurationMs float64           `json:"duration_ms"`
	Attrs      map[string]string `json:"attrs,omitempty"`
}

// Recorder is a span processor that keeps each trace's finished spans for a minute, so a handler can
// return them. Root spans are not kept (they end after the response, so nobody would take them),
// expired traces are swept at most once a second, and at most maxTraces are held at once.
type Recorder struct {
	mu      sync.Mutex
	traces  map[trace.TraceID]*held
	sweptAt time.Time
}

type held struct {
	spans []sdktrace.ReadOnlySpan
	added time.Time
}

const (
	keepFor   = time.Minute
	maxTraces = 2048
)

func NewRecorder() *Recorder { return &Recorder{traces: map[trace.TraceID]*held{}} }

func (r *Recorder) OnStart(context.Context, sdktrace.ReadWriteSpan) {}

func (r *Recorder) OnEnd(s sdktrace.ReadOnlySpan) {
	if !s.Parent().IsValid() {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	now := time.Now()
	// Traces nobody took (a request that failed before answering) age out here.
	if now.Sub(r.sweptAt) > time.Second {
		r.sweptAt = now
		for id, h := range r.traces {
			if now.Sub(h.added) > keepFor {
				delete(r.traces, id)
			}
		}
	}
	id := s.SpanContext().TraceID()
	h := r.traces[id]
	if h == nil {
		if len(r.traces) >= maxTraces {
			return
		}
		h = &held{added: now}
		r.traces[id] = h
	}
	h.spans = append(h.spans, s)
}

func (r *Recorder) Shutdown(context.Context) error   { return nil }
func (r *Recorder) ForceFlush(context.Context) error { return nil }

// Take returns and forgets the finished spans of a trace, in start order, timed from since.
func (r *Recorder) Take(id trace.TraceID, since time.Time) []Span {
	r.mu.Lock()
	h := r.traces[id]
	delete(r.traces, id)
	r.mu.Unlock()
	if h == nil {
		return []Span{}
	}
	sort.Slice(h.spans, func(i, j int) bool { return h.spans[i].StartTime().Before(h.spans[j].StartTime()) })
	out := make([]Span, 0, len(h.spans))
	for _, s := range h.spans {
		sp := Span{
			Name:       s.Name(),
			ID:         s.SpanContext().SpanID().String(),
			StartMs:    ms(s.StartTime().Sub(since)),
			DurationMs: ms(s.EndTime().Sub(s.StartTime())),
		}
		if p := s.Parent(); p.IsValid() {
			sp.Parent = p.SpanID().String()
		}
		if attrs := s.Attributes(); len(attrs) > 0 {
			sp.Attrs = map[string]string{}
			for _, kv := range attrs {
				sp.Attrs[string(kv.Key)] = kv.Value.Emit()
			}
		}
		out = append(out, sp)
	}
	return out
}

func ms(d time.Duration) float64 { return float64(d.Microseconds()) / 1000 }

// Setup installs the global tracer provider. export may be nil (spans are then only recorded).
func Setup(service, version string, export sdktrace.SpanExporter) (*Recorder, func(context.Context) error) {
	rec := NewRecorder()
	opts := []sdktrace.TracerProviderOption{
		sdktrace.WithSpanProcessor(rec),
		sdktrace.WithSampler(sdktrace.AlwaysSample()),
		sdktrace.WithResource(resource.NewSchemaless(
			attribute.String("service.name", service),
			attribute.String("service.version", version),
		)),
	}
	if export != nil {
		opts = append(opts, sdktrace.WithBatcher(export))
	}
	tp := sdktrace.NewTracerProvider(opts...)
	otel.SetTracerProvider(tp)
	return rec, tp.Shutdown
}
