package contact

import (
	"encoding/json"
	"net/mail"
	"testing"
	"time"
	"unicode/utf8"
)

// The form is where visitors' free text enters the service. Whatever arrives, validation must not
// panic, and anything it accepts must meet the rules and encode into both webhook payloads.
func FuzzValidate(f *testing.F) {
	f.Add("Ada", "ada@example.com", "Hello, I would like to talk about a role.")
	f.Add("", "", "")
	f.Add("名前", "a@b.co", "@everyone please read this")
	f.Add("x", "not-an-email", "short")
	f.Add("x", "a@b", "ten chars!")
	f.Fuzz(func(t *testing.T, name, email, message string) {
		m := Message{Name: name, Email: email, Message: message, Received: time.Unix(0, 0)}
		if validate(m) != "" {
			return
		}
		if name == "" || utf8.RuneCountInString(name) > 100 {
			t.Fatalf("accepted name %q", name)
		}
		if a, err := mail.ParseAddress(email); err != nil || a.Address != email {
			t.Fatalf("accepted email %q", email)
		}
		if n := utf8.RuneCountInString(message); n < 10 || n > 4000 {
			t.Fatalf("accepted a %d-character message", n)
		}
		for _, hook := range []string{"https://discord.com/api/webhooks/1/x", "https://hooks.slack.com/services/x"} {
			if _, err := json.Marshal(webhookPayload(hook, m)); err != nil {
				t.Fatalf("payload for %s: %v", hook, err)
			}
		}
	})
}
