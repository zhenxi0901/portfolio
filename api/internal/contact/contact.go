// Package contact accepts messages from the site's form.
package contact

import (
	"bytes"
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"log/slog"
	"mime"
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
// is the durable channel there, and requireWebhook stops the form saying "sent" without one.
type Service struct {
	dir            string
	webhook        string
	requireWebhook bool
	synthetic      string // token that marks a scheduled end-to-end check; empty disables it
	m              *metrics.Metrics
	log            *slog.Logger
	mu             sync.Mutex
	client         *http.Client
	retryWait      time.Duration
}

// SyntheticHeader carries the synthetic check's token. A request that presents it goes through the
// whole path, webhook included, but is posted silently and marked, and never stored or counted as
// a visitor's message.
const SyntheticHeader = "X-Synthetic-Check"

// WithSyntheticToken enables the scheduled end-to-end check (.github/workflows/synthetic.yml).
func (s *Service) WithSyntheticToken(token string) *Service {
	s.synthetic = token
	return s
}

func (s *Service) isSynthetic(r *http.Request) bool {
	got := r.Header.Get(SyntheticHeader)
	return s.synthetic != "" && got != "" && subtle.ConstantTimeCompare([]byte(got), []byte(s.synthetic)) == 1
}

func NewService(dir, webhook string, requireWebhook bool, m *metrics.Metrics, log *slog.Logger) *Service {
	if webhook == "" && requireWebhook {
		log.Error("contact: no webhook configured; the form will ask visitors to email instead")
	}
	return &Service{
		dir: dir, webhook: webhook, requireWebhook: requireWebhook, m: m, log: log,
		client:    &http.Client{Timeout: attemptTimeout},
		retryWait: 300 * time.Millisecond,
	}
}

type Message struct {
	Name     string    `json:"name"`
	Email    string    `json:"email"`
	Message  string    `json:"message"`
	Received time.Time `json:"received"`
	// Suspect marks a message whose hidden field came filled in. Bots fill every field, but a browser
	// completing the form for someone can fill a hidden one too, so it is delivered like any other,
	// silently and marked. Only what was delivered is ever answered "sent".
	Suspect   bool `json:"suspect,omitempty"`
	Synthetic bool `json:"-"`
}

// submission is the form as it was sent: JSON from the page's script, or form-encoded by the browser
// itself where the script has not loaded.
type submission struct {
	Name    string `json:"name"`
	Email   string `json:"email"`
	Message string `json:"message"`
	// The hidden field. It was called company until 23 November 2026, a name browsers fill in by
	// themselves; a page opened before then still sends that.
	LeaveEmpty string `json:"leave_empty"`
	Company    string `json:"company"`
}

// read decodes a submission, and reports whether the browser sent the form itself.
func read(r *http.Request) (in submission, native bool, err error) {
	if t, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type")); t == "application/x-www-form-urlencoded" {
		if err := r.ParseForm(); err != nil {
			return in, true, err
		}
		f := r.PostForm
		return submission{Name: f.Get("name"), Email: f.Get("email"), Message: f.Get("message"), LeaveEmpty: f.Get("leave_empty")}, true, nil
	}
	return in, false, json.NewDecoder(r.Body).Decode(&in)
}

func (s *Service) Handle(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	in, native, err := read(r)
	reply := func(code int, result string, body map[string]any) {
		s.m.Contact.WithLabelValues(result).Inc()
		if native {
			writePage(w, code, body)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(code)
		_ = json.NewEncoder(w).Encode(body)
	}
	if err != nil {
		problem := "Send the form as JSON."
		if tooBig := new(http.MaxBytesError); errors.As(err, &tooBig) {
			problem = "Messages need to be between 10 and 4,000 characters."
		}
		reply(http.StatusBadRequest, "invalid", map[string]any{"error": problem})
		return
	}
	msg := Message{
		Name:      strings.TrimSpace(in.Name),
		Email:     strings.TrimSpace(in.Email),
		Message:   strings.TrimSpace(in.Message),
		Received:  time.Now().UTC(),
		Suspect:   strings.TrimSpace(in.LeaveEmpty+in.Company) != "",
		Synthetic: s.isSynthetic(r),
	}
	if problem := validate(msg); problem != "" {
		reply(http.StatusBadRequest, "invalid", map[string]any{"error": problem})
		return
	}
	// Without a webhook the message would only reach this instance's disk. Where that disk is
	// thrown away, say so rather than "sent" (see the contact-form postmortem on the site).
	// A synthetic check exists to prove delivery, so without a webhook it fails wherever it runs.
	if s.webhook == "" && (s.requireWebhook || msg.Synthetic) {
		s.undelivered(msg, "no webhook configured", nil)
		reply(http.StatusServiceUnavailable, "undelivered", map[string]any{"error": "Messages can't be delivered right now."})
		return
	}
	// A synthetic check is not a visitor's message: it is delivered, not kept.
	if !msg.Synthetic {
		if err := s.store(msg); err != nil {
			s.log.Error("contact: store failed", "err", err)
			reply(http.StatusInternalServerError, "error", map[string]any{"error": "Could not save your message."})
			return
		}
	}
	// Deliver before replying. On Cloud Run an instance gets almost no CPU once the response is
	// written, so a send left running in the background could stall, and the visitor would be
	// told "sent" for a message nobody receives. If delivery fails they are told to email instead.
	// WithoutCancel: a visitor closing the tab mid-send should not abort a send that is underway.
	if s.webhook != "" {
		if err := s.forward(context.WithoutCancel(r.Context()), msg); err != nil {
			s.undelivered(msg, "webhook delivery failed", err)
			reply(http.StatusBadGateway, "undelivered", map[string]any{"error": "Could not deliver your message."})
			return
		}
	}
	if msg.Synthetic {
		s.log.Info("contact: synthetic check delivered", "suspect", msg.Suspect)
		// The check asserts this field, so a token that was not recognised (and so went out as a
		// visitor's message) fails it instead of passing.
		reply(http.StatusAccepted, "synthetic", map[string]any{"ok": true, "synthetic": true})
		return
	}
	s.log.Info("contact: message received", "chars", utf8.RuneCountInString(msg.Message), "forwarded", s.webhook != "", "suspect", msg.Suspect)
	result := "accepted"
	if msg.Suspect {
		result = "suspect"
	}
	reply(http.StatusAccepted, result, map[string]any{"ok": true})
}

// writePage answers a form the browser sent by itself, which shows whatever comes back as a page.
func writePage(w http.ResponseWriter, code int, body map[string]any) {
	title, text := "Message sent", "Thanks. I'll reply from my NTU email."
	if problem, failed := body["error"].(string); failed {
		title, text = "Not sent", problem+" Go back in your browser to try again: what you wrote should still be in the form."
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	_, _ = fmt.Fprintf(w, page, html.EscapeString(title), html.EscapeString(title), html.EscapeString(text))
}

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>%s</title>
<style>
:root { color-scheme: light dark }
body { font: 1.125rem/1.6 "IBM Plex Sans", system-ui, sans-serif; max-width: 34rem; margin: 18vh auto; padding: 0 1rem }
h1 { font-size: 2.25rem; line-height: 1.1; letter-spacing: -0.02em }
a { color: inherit; text-underline-offset: 5px }
</style>
</head>
<body>
<main>
<h1>%s</h1>
<p>%s</p>
<p><a href="/">Back to the site</a></p>
</main>
</body>
</html>
`

// undelivered logs one line per message the visitor was told to email about instead. The scheduled
// check in .github/workflows/synthetic.yml searches the logs for exactly this message, so keep it.
func (s *Service) undelivered(m Message, reason string, err error) {
	attrs := []any{"reason", reason, "synthetic", m.Synthetic}
	if err != nil {
		attrs = append(attrs, "err", err)
	}
	s.log.Error("contact: undelivered", attrs...)
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
		return false, errors.New("webhook URL is not valid")
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.client.Do(req)
	if err != nil {
		return true, redact(err)
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

// redact drops the URL from a transport error. A webhook URL is a credential (Discord's carries its
// token in the path), and *url.Error prints it in full; only the operation and cause are kept.
func redact(err error) error {
	var ue *url.Error
	if errors.As(err, &ue) {
		return fmt.Errorf("%s webhook: %w", ue.Op, ue.Err)
	}
	return err
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
		p := map[string]any{
			"content":          "New message from the portfolio site",
			"allowed_mentions": map[string]any{"parse": []string{}},
			"embeds": []map[string]any{{
				"title":       m.Name,
				"description": m.Message,
				"fields":      []map[string]any{{"name": "Reply to", "value": m.Email}},
				"timestamp":   m.Received.Format(time.RFC3339),
			}},
		}
		if m.Suspect {
			p["content"] = suspectNote
			p["flags"] = discordSuppressNotifications
		}
		if m.Synthetic {
			p["content"] = "Synthetic check of the contact form: delivered, no action needed"
			p["flags"] = discordSuppressNotifications
		}
		return p
	}
	if m.Synthetic {
		return map[string]string{"text": "Synthetic check of the contact form: delivered, no action needed"}
	}
	from := "New message"
	if m.Suspect {
		from = suspectNote + "\nMessage"
	}
	// Slack-style text is markup: "<!channel>" pings everyone and "<https://x|label>" disguises a
	// link. Escaping &, < and > (Slack's own rule) shows a visitor's text exactly as typed.
	return map[string]string{"text": fmt.Sprintf("%s from %s (%s):\n%s", from, slackEscape(m.Name), slackEscape(m.Email), slackEscape(m.Message))}
}

// suspectNote heads a message whose hidden field was filled in.
const suspectNote = "Possible spam from the portfolio site: the form's hidden field was filled in"

var slackEscaper = strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;")

func slackEscape(s string) string { return slackEscaper.Replace(s) }

// Discord's SUPPRESS_NOTIFICATIONS message flag: posted, but nobody is notified.
const discordSuppressNotifications = 1 << 12
