package ask

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"go.opentelemetry.io/otel"

	"github.com/zhenxi0901/portfolio/api/internal/tracing"
)

// askTraced sends a question inside a request span, the way the server's middleware does.
func askTraced(t *testing.T, svc *Service, q string) response {
	t.Helper()
	ctx, root := otel.Tracer("test").Start(t.Context(), "POST /api/ask")
	defer root.End()
	rec := httptest.NewRecorder()
	body, _ := json.Marshal(map[string]string{"question": q})
	req := httptest.NewRequest(http.MethodPost, "/api/ask", strings.NewReader(string(body))).WithContext(ctx)
	svc.Handle(rec, req)
	var out response
	if err := json.NewDecoder(rec.Body).Decode(&out); err != nil {
		t.Fatal(err)
	}
	return out
}

func names(spans []tracing.Span) string {
	var n []string
	for _, s := range spans {
		n = append(n, s.Name)
	}
	return strings.Join(n, " ")
}

func TestAnswersCarryTheirOwnTrace(t *testing.T) {
	rec, shutdown := tracing.Setup("test", "test", nil)
	defer func() { _ = shutdown(t.Context()) }()
	svc := newSvc(t, nil).WithTraces(rec, false)

	out := askTraced(t, svc, "How did ZhenXi cut the cloud bill?")
	if out.Trace == nil || len(out.Trace.TraceID) != 32 {
		t.Fatalf("no trace on the answer: %+v", out.Trace)
	}
	want := "ask.parse ask.cache.lookup ask.retrieve retrieve.tokenize retrieve.rank retrieve.compose ask.cache.store"
	if got := names(out.Trace.Spans); got != want {
		t.Errorf("spans\n got %s\nwant %s", got, want)
	}
	for _, s := range out.Trace.Spans {
		if s.Name == "retrieve.rank" && s.Attrs["top"] != "cost-review" {
			t.Errorf("rank span should name the top fact: %v", s.Attrs)
		}
		if s.Name == "retrieve.tokenize" && s.Parent == "" {
			t.Error("retrieval phases should be children of ask.retrieve")
		}
	}

	// The same question again is a cache hit, and its trace shows the short path.
	again := askTraced(t, svc, "how did zhenxi cut the cloud bill?")
	if !again.Cached || names(again.Trace.Spans) != "ask.parse ask.cache.lookup" {
		t.Errorf("cache hit trace: cached=%v spans=%s", again.Cached, names(again.Trace.Spans))
	}
}

func TestNoTraceWithoutARecorder(t *testing.T) {
	if out := askTraced(t, newSvc(t, nil), "Which GPUs has ZhenXi used?"); out.Trace != nil {
		t.Errorf("trace without a recorder: %+v", out.Trace)
	}
}
