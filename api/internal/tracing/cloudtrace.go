package tracing

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"go.opentelemetry.io/otel/attribute"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"

	"github.com/zhenxi0901/portfolio/api/internal/gcp"
)

// CloudTrace exports spans to Cloud Trace with the v2 REST API (traces:batchWrite), authenticated
// with the runtime identity's token. A small exporter instead of Google's gRPC client libraries.
type CloudTrace struct {
	meta *gcp.Metadata
	api  string
}

func NewCloudTrace(meta *gcp.Metadata) *CloudTrace {
	return &CloudTrace{meta: meta, api: "https://cloudtrace.googleapis.com/v2"}
}

type ctValue struct {
	Value string `json:"value"`
}

type ctAttr struct {
	String *struct {
		Value string `json:"value"`
	} `json:"stringValue,omitempty"`
	Int  *string `json:"intValue,omitempty"`
	Bool *bool   `json:"boolValue,omitempty"`
}

type ctSpan struct {
	Name         string  `json:"name"`
	SpanID       string  `json:"spanId"`
	ParentSpanID string  `json:"parentSpanId,omitempty"`
	DisplayName  ctValue `json:"displayName"`
	StartTime    string  `json:"startTime"`
	EndTime      string  `json:"endTime"`
	SpanKind     string  `json:"spanKind,omitempty"`
	Attributes   struct {
		AttributeMap map[string]ctAttr `json:"attributeMap"`
	} `json:"attributes"`
}

var kinds = map[trace.SpanKind]string{
	trace.SpanKindServer:   "SERVER",
	trace.SpanKindClient:   "CLIENT",
	trace.SpanKindInternal: "INTERNAL",
}

// convert maps an OpenTelemetry span onto Cloud Trace's v2 shape. Attribute strings are capped at
// 256 bytes, Cloud Trace's limit.
func convert(project string, s sdktrace.ReadOnlySpan) ctSpan {
	sc := s.SpanContext()
	out := ctSpan{
		Name:        fmt.Sprintf("projects/%s/traces/%s/spans/%s", project, sc.TraceID(), sc.SpanID()),
		SpanID:      sc.SpanID().String(),
		DisplayName: ctValue{s.Name()},
		StartTime:   s.StartTime().UTC().Format(time.RFC3339Nano),
		EndTime:     s.EndTime().UTC().Format(time.RFC3339Nano),
		SpanKind:    kinds[s.SpanKind()],
	}
	if p := s.Parent(); p.IsValid() {
		out.ParentSpanID = p.SpanID().String()
	}
	out.Attributes.AttributeMap = map[string]ctAttr{}
	add := func(kv attribute.KeyValue) {
		var a ctAttr
		switch kv.Value.Type() {
		case attribute.BOOL:
			b := kv.Value.AsBool()
			a.Bool = &b
		case attribute.INT64:
			n := strconv.FormatInt(kv.Value.AsInt64(), 10)
			a.Int = &n
		default:
			v := kv.Value.Emit()
			if len(v) > 256 {
				v = v[:256]
			}
			a.String = &struct {
				Value string `json:"value"`
			}{v}
		}
		out.Attributes.AttributeMap[string(kv.Key)] = a
	}
	for _, kv := range s.Attributes() {
		add(kv)
	}
	if r := s.Resource(); r != nil {
		for _, kv := range r.Attributes() {
			add(kv)
		}
	}
	return out
}

func (c *CloudTrace) ExportSpans(ctx context.Context, spans []sdktrace.ReadOnlySpan) error {
	if len(spans) == 0 {
		return nil
	}
	project, token, err := c.meta.Credentials(ctx)
	if err != nil {
		return err
	}
	body := struct {
		Spans []ctSpan `json:"spans"`
	}{}
	for _, s := range spans {
		body.Spans = append(body.Spans, convert(project, s))
	}
	b, err := json.Marshal(body)
	if err != nil {
		return err
	}
	_, err = gcp.Do(ctx, c.meta.Client, "POST", fmt.Sprintf("%s/projects/%s/traces:batchWrite", c.api, project),
		map[string]string{"Authorization": "Bearer " + token, "Content-Type": "application/json"}, bytes.NewReader(b))
	if err != nil {
		return fmt.Errorf("cloud trace: %w", err)
	}
	return nil
}

func (c *CloudTrace) Shutdown(context.Context) error { return nil }
