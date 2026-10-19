package contact

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
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
	s := NewService(t.TempDir(), hook, false, metrics.New(prometheus.NewRegistry(), "test", "x"), slog.New(slog.NewTextHandler(io.Discard, nil)))
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

// Where the webhook is required (Cloud Run), a missing one must never produce "sent".
func TestRequiredWebhookMissingRefuses(t *testing.T) {
	s := newService(t, "")
	s.requireWebhook = true
	rec := send(s, valid)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status %d, want 503", rec.Code)
	}
	if strings.Contains(rec.Body.String(), "\"ok\"") {
		t.Errorf("body claims success: %s", rec.Body.String())
	}
	// Validation still runs first, so bad input is a 400 and the smoke test's check holds.
	if rec := send(s, `{"name":"","email":"x","message":""}`); rec.Code != http.StatusBadRequest {
		t.Errorf("bad input: status %d, want 400", rec.Code)
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

// A webhook URL is a credential; a transport error must not carry it into the logs.
func TestDeliveryErrorsDoNotLeakTheWebhookURL(t *testing.T) {
	// Nothing listens on this port, so the request fails in the transport.
	s := newService(t, "http://127.0.0.1:1/api/webhooks/123/SECRET-TOKEN")
	_, err := s.post(t.Context(), []byte("{}"))
	if err == nil {
		t.Fatal("expected a connection error")
	}
	if strings.Contains(err.Error(), "SECRET-TOKEN") || strings.Contains(err.Error(), "webhooks") {
		t.Errorf("error leaks the URL: %v", err)
	}
}

func sendWith(s *Service, body, token string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/contact", strings.NewReader(body))
	if token != "" {
		req.Header.Set(SyntheticHeader, token)
	}
	s.Handle(rec, req)
	return rec
}

func stored(t *testing.T, s *Service) bool {
	t.Helper()
	_, err := os.Stat(filepath.Join(s.dir, "messages.jsonl"))
	return err == nil
}

// The scheduled check goes through validation, the webhook and the reply like a visitor's message,
// but is marked, carries none of its own text to the receiver, and is not kept.
func TestSyntheticCheckIsDeliveredMarkedAndNotStored(t *testing.T) {
	url, calls, bodies := webhook(t, http.StatusNoContent)
	s := newService(t, url).WithSyntheticToken("s3cret")
	if rec := sendWith(s, valid, "s3cret"); rec.Code != http.StatusAccepted {
		t.Fatalf("status %d, want 202", rec.Code)
	}
	if calls.Load() != 1 {
		t.Fatalf("webhook called %d times, want 1", calls.Load())
	}
	if b := <-bodies; !strings.Contains(b, "Synthetic check") || strings.Contains(b, "Mei Ling") {
		t.Errorf("want a marked check without the message text, got %s", b)
	}
	if stored(t, s) {
		t.Error("a synthetic check must not be stored as a message")
	}
}

// Only the right token marks a check. Anything else is a visitor's message and is treated as one.
func TestSyntheticTokenMustMatch(t *testing.T) {
	for name, s := range map[string]func(string) *Service{
		"wrong token":   func(u string) *Service { return newService(t, u).WithSyntheticToken("s3cret") },
		"none set here": func(u string) *Service { return newService(t, u) },
	} {
		url, _, bodies := webhook(t, http.StatusNoContent)
		svc := s(url)
		if rec := sendWith(svc, valid, "guess"); rec.Code != http.StatusAccepted {
			t.Fatalf("%s: status %d, want 202", name, rec.Code)
		}
		if b := <-bodies; !strings.Contains(b, "Mei Ling") {
			t.Errorf("%s: a visitor's message lost its text: %s", name, b)
		}
		if !stored(t, svc) {
			t.Errorf("%s: a visitor's message was not stored", name)
		}
	}
}

func TestSyntheticDiscordPayloadIsSilent(t *testing.T) {
	m := Message{Name: "Synthetic check", Email: "check@example.com", Message: "scheduled check", Synthetic: true}
	raw, _ := json.Marshal(webhookPayload("https://discord.com/api/webhooks/1/token", m))
	var p struct {
		Content string `json:"content"`
		Flags   int    `json:"flags"`
	}
	if err := json.Unmarshal(raw, &p); err != nil {
		t.Fatal(err)
	}
	if p.Flags != 4096 || !strings.Contains(p.Content, "Synthetic check") {
		t.Errorf("want a silent (flags 4096), marked post; got %s", raw)
	}
}
