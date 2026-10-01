// Package contact accepts messages from the site's form.
package contact

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/mail"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/zhenxi0901/portfolio/api/internal/metrics"
)

// Delivery has to finish inside the form's 8 s request timeout, cold start included.
const (
	deliverTimeout = 6 * time.Second
	attemptTimeout = 3 * time.Second
	maxAttempts    = 3
)

// Service appends messages to a JSONL file and, if configured, forwards them to a chat webhook.
// No IP address is stored. On Cloud Run the file is per-instance scratch space, so the webhook
// is the durable channel there.
type Service struct {
	dir       string
	webhook   string
	m         *metrics.Metrics
	log       *slog.Logger
	mu        sync.Mutex
	client    *http.Client
	retryWait time.Duration
}

func NewService(dir, webhook string, m *metrics.Metrics, log *slog.Logger) *Service {
	return &Service{
		dir: dir, webhook: webhook, m: m, log: log,
		client:    &http.Client{Timeout: attemptTimeout},
		retryWait: 300 * time.Millisecond,
	}
}

type Message struct {
	Name     string    `json:"name"`
	Email    string    `json:"email"`
	Message  string    `json:"message"`
	Received time.Time `json:"received"`
}

func (s *Service) Handle(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name    string `json:"name"`
		Email   string `json:"email"`
		Message string `json:"message"`
		Company string `json:"company"` // honeypot, hidden from people
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		s.reply(w, http.StatusBadRequest, "invalid", map[string]any{"error": "Send the form as JSON."})
		return
	}
	// Bots fill every field. Pretend it worked so they do not adapt.
	if strings.TrimSpace(in.Company) != "" {
		s.reply(w, http.StatusAccepted, "spam", map[string]any{"ok": true})
		return
	}
	msg := Message{
		Name:     strings.TrimSpace(in.Name),
		Email:    strings.TrimSpace(in.Email),
		Message:  strings.TrimSpace(in.Message),
		Received: time.Now().UTC(),
	}
	if problem := validate(msg); problem != "" {
		s.reply(w, http.StatusBadRequest, "invalid", map[string]any{"error": problem})
		return
	}
	if err := s.store(msg); err != nil {
		s.log.Error("contact: store failed", "err", err)
		s.reply(w, http.StatusInternalServerError, "error", map[string]any{"error": "Could not save your message."})
		return
	}
	// Deliver before replying. On Cloud Run an instance gets almost no CPU once the response is
	// written, so a send left running in the background could stall, and the visitor would be
	// told "sent" for a message nobody receives. If delivery fails they are told to email instead.
	// WithoutCancel: a visitor closing the tab mid-send should not abort a send that is underway.
	if s.webhook != "" {
		if err := s.forward(context.WithoutCancel(r.Context()), msg); err != nil {
			s.log.Error("contact: webhook delivery failed", "err", err)
			s.reply(w, http.StatusBadGateway, "undelivered", map[string]any{"error": "Could not deliver your message."})
			return
		}
	}
	s.log.Info("contact: message received", "chars", utf8.RuneCountInString(msg.Message), "forwarded", s.webhook != "")
	s.reply(w, http.StatusAccepted, "accepted", map[string]any{"ok": true})
}

func validate(m Message) string {
	switch {
	case m.Name == "" || utf8.RuneCountInString(m.Name) > 100:
		return "Please give a name of up to 100 characters."
	case utf8.RuneCountInString(m.Email) > 254:
		return "That email address is too long."
	case !validEmail(m.Email):
		return "That email address doesn't look right."
	case utf8.RuneCountInString(m.Message) < 10 || utf8.RuneCountInString(m.Message) > 4000:
		return "Messages need to be between 10 and 4,000 characters."
	}
	return ""
}

func validEmail(s string) bool {
	a, err := mail.ParseAddress(s)
	return err == nil && a.Address == s && strings.Contains(s[strings.LastIndexByte(s, '@'):], ".")
}

func (s *Service) store(m Message) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := os.MkdirAll(s.dir, 0o700); err != nil {
		return err
	}
	f, err := os.OpenFile(filepath.Join(s.dir, "messages.jsonl"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	defer f.Close()
	return json.NewEncoder(f).Encode(m)
}

// forward posts the message to the webhook, retrying network errors, 429s and 5xx responses
// with a short backoff. A 4xx other than 429 means the payload was refused, so it is final.
func (s *Service) forward(ctx context.Context, m Message) error {
	body, err := json.Marshal(webhookPayload(s.webhook, m))
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, deliverTimeout)
	defer cancel()
	wait := s.retryWait
	for attempt := 1; ; attempt++ {
		retry, err := s.post(ctx, body)
		if err == nil || !retry || attempt == maxAttempts {
			return err
		}
		select {
		case <-ctx.Done():
			return err
		case <-time.After(wait):
		}
		wait *= 2
	}
}

func (s *Service) post(ctx context.Context, body []byte) (retry bool, err error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.webhook, bytes.NewReader(body))
	if err != nil {
		return false, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.client.Do(req)
	if err != nil {
		return true, err
	}
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4<<10))
	resp.Body.Close()
	switch {
	case resp.StatusCode < 300:
		return false, nil
	case resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500:
		return true, fmt.Errorf("webhook answered %d", resp.StatusCode)
	default:
		return false, fmt.Errorf("webhook answered %d", resp.StatusCode)
	}
}

// webhookPayload formats the message for Discord or, for any other URL, as Slack-style
// {"text": ...}, which Slack, Mattermost and Google Chat all accept.
func webhookPayload(webhook string, m Message) any {
	host := ""
	if u, err := url.Parse(webhook); err == nil {
		host = u.Hostname()
	}
	if host == "discord.com" || host == "discordapp.com" || strings.HasSuffix(host, ".discord.com") {
		// Plain content is capped at 2,000 characters and messages may be 4,000, so the message
		// goes in an embed (4,096). The content line carries no visitor input, and mentions are
		// disabled so "@everyone" in a message pings nobody.
		return map[string]any{
			"content":          "New message from the portfolio site",
			"allowed_mentions": map[string]any{"parse": []string{}},
			"embeds": []map[string]any{{
				"title":       m.Name,
				"description": m.Message,
				"fields":      []map[string]any{{"name": "Reply to", "value": m.Email}},
				"timestamp":   m.Received.Format(time.RFC3339),
			}},
		}
	}
	return map[string]string{"text": fmt.Sprintf("New message from %s <%s>:\n%s", m.Name, m.Email, m.Message)}
}

func (s *Service) reply(w http.ResponseWriter, code int, result string, body map[string]any) {
	s.m.Contact.WithLabelValues(result).Inc()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(body)
}
