// Package contact accepts messages from the site's form.
package contact

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/mail"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/zhenxi0901/portfolio/api/internal/metrics"
)

// Service appends messages to a JSONL file and, if configured, forwards them to a chat webhook.
// No IP address is stored. On Cloud Run the file is per-instance scratch space, so the webhook
// is the durable channel there.
type Service struct {
	dir     string
	webhook string
	m       *metrics.Metrics
	log     *slog.Logger
	mu      sync.Mutex
	client  *http.Client
}

func NewService(dir, webhook string, m *metrics.Metrics, log *slog.Logger) *Service {
	return &Service{dir: dir, webhook: webhook, m: m, log: log, client: &http.Client{Timeout: 5 * time.Second}}
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
	if s.webhook != "" {
		go s.forward(msg)
	}
	s.log.Info("contact: message received", "chars", utf8.RuneCountInString(msg.Message))
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

// forward posts to a Slack- or Discord-style webhook ("text" and "content" cover both).
func (s *Service) forward(m Message) {
	text := fmt.Sprintf("New message from %s <%s>:\n%s", m.Name, m.Email, m.Message)
	body, _ := json.Marshal(map[string]string{"text": text, "content": text})
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, s.webhook, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.client.Do(req)
	if err != nil {
		s.log.Warn("contact: webhook failed", "err", err)
		return
	}
	resp.Body.Close()
	if resp.StatusCode >= 300 {
		s.log.Warn("contact: webhook rejected", "status", resp.StatusCode)
	}
}

func (s *Service) reply(w http.ResponseWriter, code int, result string, body map[string]any) {
	s.m.Contact.WithLabelValues(result).Inc()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(body)
}
