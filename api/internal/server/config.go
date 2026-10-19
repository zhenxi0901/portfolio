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
	Revision       string // set by Cloud Run as K_REVISION
	AllowedOrigins []string
	TrustProxy     bool

	ContactWebhook string
	// Refuse to report a message as sent when there is no webhook to deliver it to. On by default
	// on Cloud Run (which sets K_SERVICE), where the local file is per-instance scratch space.
	ContactRequireWebhook bool

	// Read this site's uptime-check results from Cloud Monitoring for /api/slo. On by default on
	// Cloud Run, where the metadata server provides the project and a token.
	SLOFromMonitoring bool

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
		Revision:       os.Getenv("K_REVISION"),
		AllowedOrigins: splitList(os.Getenv("ALLOWED_ORIGINS")),
		TrustProxy:     os.Getenv("TRUST_PROXY") == "true",
		ContactWebhook: os.Getenv("CONTACT_WEBHOOK_URL"),
		ContactRequireWebhook: os.Getenv("CONTACT_REQUIRE_WEBHOOK") == "true" ||
			(os.Getenv("K_SERVICE") != "" && os.Getenv("CONTACT_REQUIRE_WEBHOOK") != "false"),
		SLOFromMonitoring: os.Getenv("SLO_SOURCE") == "monitoring" ||
			(os.Getenv("K_SERVICE") != "" && os.Getenv("SLO_SOURCE") != "none"),
		LLMBaseURL: strings.TrimRight(os.Getenv("LLM_BASE_URL"), "/"),
		LLMAPIKey:  os.Getenv("LLM_API_KEY"),
		LLMModel:   os.Getenv("LLM_MODEL"),
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
