package server

import (
	"os"
	"path/filepath"
	"strings"
)

// Config is read from the environment so the same image runs locally, in Compose and on Cloud Run.
type Config struct {
	Port           string
	StaticDir      string
	KnowledgePath  string
	DataDir        string
	Region         string
	AllowedOrigins []string
	TrustProxy     bool

	ContactWebhook string

	LLMBaseURL string
	LLMAPIKey  string
	LLMModel   string

	Version string
	Commit  string
}

func ConfigFromEnv() Config {
	static := env("STATIC_DIR", "./site")
	return Config{
		Port:           env("PORT", "8080"),
		StaticDir:      static,
		KnowledgePath:  env("KNOWLEDGE_PATH", filepath.Join(static, "knowledge.json")),
		DataDir:        env("DATA_DIR", filepath.Join(os.TempDir(), "portfolio-contact")),
		Region:         env("REGION", "local"),
		AllowedOrigins: splitList(os.Getenv("ALLOWED_ORIGINS")),
		TrustProxy:     os.Getenv("TRUST_PROXY") == "true",
		ContactWebhook: os.Getenv("CONTACT_WEBHOOK_URL"),
		LLMBaseURL:     strings.TrimRight(os.Getenv("LLM_BASE_URL"), "/"),
		LLMAPIKey:      os.Getenv("LLM_API_KEY"),
		LLMModel:       os.Getenv("LLM_MODEL"),
	}
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func splitList(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
