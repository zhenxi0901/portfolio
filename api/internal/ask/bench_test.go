package ask

import (
	"context"
	"testing"
)

// Tokenizing every fact for every question (what Retrieve does for a one-off call) against the
// index built once at startup (what the server does).
func BenchmarkRetrievePerQuestionIndex(b *testing.B) {
	fs := facts(b)
	for b.Loop() {
		Retrieve("Which GPUs have you used?", fs)
	}
}

func BenchmarkRetrieveStartupIndex(b *testing.B) {
	ix := NewIndex(facts(b))
	for b.Loop() {
		ix.Retrieve(context.Background(), "Which GPUs have you used?")
	}
}
