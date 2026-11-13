// Package gcp talks to Google Cloud the way a Cloud Run service can with no client libraries: the
// project ID and an access token from the metadata server, then plain REST.
package gcp

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Metadata caches the project ID and the runtime identity's access token.
type Metadata struct {
	Client *http.Client
	// Base URL of the metadata server; tests point it at a fake.
	Base string

	mu      sync.Mutex
	project string
	token   string
	expires time.Time
}

func NewMetadata() *Metadata {
	return &Metadata{Client: &http.Client{Timeout: 8 * time.Second}, Base: "http://metadata.google.internal/computeMetadata/v1"}
}

// Credentials returns the project ID and a token valid for at least another minute.
func (m *Metadata) Credentials(ctx context.Context) (project, token string, err error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	meta := map[string]string{"Metadata-Flavor": "Google"}
	if m.project == "" {
		b, err := Get(ctx, m.Client, m.Base+"/project/project-id", meta)
		if err != nil {
			return "", "", fmt.Errorf("project id: %w", err)
		}
		m.project = strings.TrimSpace(string(b))
	}
	if m.token == "" || time.Now().After(m.expires) {
		var tok struct {
			AccessToken string `json:"access_token"`
			ExpiresIn   int    `json:"expires_in"`
		}
		b, err := Get(ctx, m.Client, m.Base+"/instance/service-accounts/default/token", meta)
		if err == nil {
			err = json.Unmarshal(b, &tok)
		}
		if err != nil {
			return "", "", fmt.Errorf("token: %w", err)
		}
		m.token = tok.AccessToken
		// Refresh a minute early so a token never expires mid-request.
		m.expires = time.Now().Add(time.Duration(tok.ExpiresIn)*time.Second - time.Minute)
	}
	return m.project, m.token, nil
}

// Get fetches a URL and returns the body, or an error carrying the status and the start of the body.
func Get(ctx context.Context, client *http.Client, url string, headers map[string]string) ([]byte, error) {
	return Do(ctx, client, http.MethodGet, url, headers, nil)
}

func Do(ctx context.Context, client *http.Client, method, url string, headers map[string]string, body io.Reader) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, method, url, body)
	if err != nil {
		return nil, err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode/100 != 2 {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(b[:min(len(b), 200)])))
	}
	return b, nil
}
