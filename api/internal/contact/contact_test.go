package contact

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus"

	"github.com/zhenxi0901/portfolio/api/internal/metrics"
)

const valid = `{"name":"Mei Ling","email":"mei@example.sg","message":"We have an SRE role for you."}`

// webhook answers each call with the next status in statuses (the last one repeats) and
// records the bodies it was sent.
func webhook(t *testing.T, statuses ...int) (url string, calls *atomic.Int32, bodies chan string) {
	t.Helper()
	calls = &atomic.Int32{}
	bodies = make(chan string, 10)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := int(calls.Add(1))
		b, _ := io.ReadAll(r.Body)
		bodies <- string(b)
		w.WriteHeader(statuses[min(n, len(statuses))-1])
	}))
	t.Cleanup(srv.Close)
	return srv.URL, calls, bodies
}

func newService(t *testing.T, hook string) *Service {
	t.Helper()
	s := NewService(t.TempDir(), hook, metrics.New(prometheus.NewRegistry(), "test", "x"), slog.New(slog.NewTextHandler(io.Discard, nil)))
	s.retryWait = time.Millisecond
	return s
}

func send(s *Service, body string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	s.Handle(rec, httptest.NewRequest(http.MethodPost, "/api/contact", strings.NewReader(body)))
	return rec
}

func TestDeliversBeforeReplying(t *testing.T) {
	url, calls, bodies := webhook(t, http.StatusNoContent)
	if rec := send(newService(t, url), valid); rec.Code != http.StatusAccepted {
		t.Fatalf("status %d, want 202", rec.Code)
	}
	// The webhook has already been called by the time the handler returns.
	if calls.Load() != 1 {
		t.Fatalf("webhook called %d times, want 1", calls.Load())
	}
	if b := <-bodies; !strings.Contains(b, "Mei Ling") || !strings.Contains(b, "mei@example.sg") || !strings.Contains(b, "SRE role") {
		t.Errorf("webhook body missing the message: %s", b)
	}
}

func TestRetriesTransientFailures(t *testing.T) {
	url, calls, _ := webhook(t, http.StatusServiceUnavailable, http.StatusTooManyRequests, http.StatusNoContent)
	if rec := send(newService(t, url), valid); rec.Code != http.StatusAccepted {
		t.Fatalf("status %d, want 202 after recovering", rec.Code)
	}
	if calls.Load() != 3 {
		t.Errorf("webhook called %d times, want 3", calls.Load())
	}
}

func TestReportsUndeliveredMessages(t *testing.T) {
	for name, c := range map[string]struct {
		status, wantCalls int
	}{
		"keeps failing":    {http.StatusInternalServerError, maxAttempts},
		"payload rejected": {http.StatusBadRequest, 1},
	} {
		t.Run(name, func(t *testing.T) {
			url, calls, _ := webhook(t, c.status)
			rec := send(newService(t, url), valid)
			if rec.Code != http.StatusBadGateway {
				t.Errorf("status %d, want 502 so the visitor is told to email instead", rec.Code)
			}
			if int(calls.Load()) != c.wantCalls {
				t.Errorf("webhook called %d times, want %d", calls.Load(), c.wantCalls)
			}
		})
	}
}

func TestNoWebhookStillAccepts(t *testing.T) {
	if rec := send(newService(t, ""), valid); rec.Code != http.StatusAccepted {
		t.Errorf("status %d, want 202", rec.Code)
	}
}

func TestDiscordPayload(t *testing.T) {
	m := Message{Name: "@everyone", Email: "a@b.co", Message: strings.Repeat("x", 4000), Received: time.Unix(0, 0).UTC()}
	raw, _ := json.Marshal(webhookPayload("https://discord.com/api/webhooks/1/token", m))
	var p struct {
		Content         string              `json:"content"`
		AllowedMentions map[string][]string `json:"allowed_mentions"`
		Embeds          []struct {
			Title       string `json:"title"`
			Description string `json:"description"`
			Fields      []struct{ Name, Value string }
		} `json:"embeds"`
	}
	if err := json.Unmarshal(raw, &p); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(p.Content, "@everyone") || len(p.Content) > 2000 {
		t.Errorf("content must stay short and free of visitor input: %q", p.Content)
	}
	if mentions, ok := p.AllowedMentions["parse"]; !ok || len(mentions) != 0 {
		t.Errorf("mentions must be disabled, got %v", p.AllowedMentions)
	}
	if len(p.Embeds) != 1 || len(p.Embeds[0].Description) != 4000 || p.Embeds[0].Title != "@everyone" {
		t.Fatalf("the full message belongs in one embed: %+v", p.Embeds)
	}
	if f := p.Embeds[0].Fields; len(f) != 1 || f[0].Value != "a@b.co" {
		t.Errorf("reply address missing: %+v", f)
	}
}

func TestSlackStylePayload(t *testing.T) {
	m := Message{Name: "Ann", Email: "a@b.co", Message: "hello there"}
	raw, _ := json.Marshal(webhookPayload("https://hooks.slack.com/services/T/B/x", m))
	if string(raw) != `{"text":"New message from Ann \u003ca@b.co\u003e:\nhello there"}` {
		t.Errorf("unexpected payload %s", raw)
	}
}
