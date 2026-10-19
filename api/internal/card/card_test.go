package card

import (
	"bytes"
	"encoding/xml"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

var now = time.Date(2026, 10, 19, 12, 0, 0, 0, time.UTC)

func delivery(t *testing.T) *Delivery {
	t.Helper()
	path := filepath.Join(t.TempDir(), "delivery.json")
	raw := `{"windowDays":30,"deploys":32,"leadTimeMinutes":{"median":4.4,"commits":40},"changeFailureRate":0,
	  "safeguards":{"lastDrill":{"ended":"2026-10-19T10:03:20Z","restoreSeconds":20,"url":"x"}},
	  "head":{"sha":"9dfbfb6","title":"Close the <contact-form> postmortem's last two action items & more","committed":"2026-10-19T10:08:45Z"}}`
	if err := os.WriteFile(path, []byte(raw), 0o600); err != nil {
		t.Fatal(err)
	}
	d, err := LoadDelivery(path)
	if err != nil {
		t.Fatal(err)
	}
	return d
}

// wellFormed parses the whole document, so an unescaped character anywhere fails the test.
func wellFormed(t *testing.T, svg []byte) {
	t.Helper()
	dec := xml.NewDecoder(bytes.NewReader(svg))
	for {
		_, err := dec.Token()
		if errors.Is(err, io.EOF) {
			return
		}
		if err != nil {
			t.Fatalf("not well-formed XML: %v\n%s", err, svg)
		}
	}
}

func TestCardShowsTheLiveNumbers(t *testing.T) {
	d := Data{Commit: "9dfbfb6", Region: "asia-southeast1", SLOAvailable: true, Availability: 0.99996, BudgetRemaining: 0.97,
		Releases: "open", Delivery: delivery(t), Now: now}
	for _, darkTheme := range []bool{true, false} {
		svg := SVG(d, darkTheme)
		wellFormed(t, svg)
		s := string(svg)
		for _, want := range []string{
			"99.99%", // floored, never rounded up to a 100.00% it is not
			"97.0%", ">32<", "4.4 min", ">0%<", "deploys, 30 days",
			"committed 1 h ago", "releases open", "traffic back in 20 s, 19 Oct", "as of 12:00 UTC",
		} {
			if !strings.Contains(s, want) {
				t.Errorf("dark=%v: card lacks %q", darkTheme, want)
			}
		}
		if strings.Contains(s, "<contact-form>") {
			t.Error("a commit title reached the SVG unescaped")
		}
	}
}

// The title belongs to the commit the pipeline recorded; on any other commit it would be wrong.
func TestTitleOnlyForTheMatchingCommit(t *testing.T) {
	s := string(SVG(Data{Commit: "abc1234", Region: "local", Delivery: delivery(t), Now: now}, true))
	if strings.Contains(s, "postmortem") {
		t.Error("showed another commit's title")
	}
	if !strings.Contains(s, "commit abc1234") {
		t.Error("lost the running commit")
	}
}

func TestCardWithNothingMeasured(t *testing.T) {
	svg := SVG(Data{Commit: "dev", Region: "local", Releases: "unknown", Now: now}, true)
	wellFormed(t, svg)
	s := string(svg)
	for _, want := range []string{"measuring", "n/a", "not measured yet"} {
		if !strings.Contains(s, want) {
			t.Errorf("card lacks %q", want)
		}
	}
}

func TestFrozenReleasesAreFlagged(t *testing.T) {
	s := string(SVG(Data{Commit: "x", Region: "r", SLOAvailable: true, Availability: 0.99, BudgetRemaining: -0.5, Releases: "frozen", Now: now}, true))
	if !strings.Contains(s, "releases frozen: reliability fixes only") || !strings.Contains(s, ">0.0%<") {
		t.Errorf("frozen state not shown: %s", s)
	}
}

func TestTruncate(t *testing.T) {
	if got := truncate("short", 10); got != "short" {
		t.Errorf("truncate changed a short title: %q", got)
	}
	got := truncate(strings.Repeat("界", 80), 52)
	if n := len([]rune(got)); n != 52 || !strings.HasSuffix(got, "…") {
		t.Errorf("want 52 runes ending in an ellipsis, got %d: %q", n, got)
	}
}

func TestLoadDeliveryErrors(t *testing.T) {
	if _, err := LoadDelivery(filepath.Join(t.TempDir(), "missing.json")); err == nil {
		t.Error("a missing file should be an error")
	}
	bad := filepath.Join(t.TempDir(), "bad.json")
	_ = os.WriteFile(bad, []byte("{"), 0o600)
	if _, err := LoadDelivery(bad); err == nil {
		t.Error("bad JSON should be an error")
	}
}

// A drill whose steps could not be timed has no restore time; the card says when, not "0 s".
func TestDrillWithoutARestoreTime(t *testing.T) {
	d := delivery(t)
	d.Safeguards.LastDrill.RestoreSeconds = nil
	s := string(SVG(Data{Commit: "x", Region: "r", Delivery: d, Now: now}, true))
	if strings.Contains(s, "traffic back in") || !strings.Contains(s, "last rollback drill: 19 Oct") {
		t.Errorf("want the drill's date without a restore time:\n%s", s)
	}
}

// When Monitoring cannot be read, the card shows the last good numbers with their own time.
func TestStaleReadingIsLabelled(t *testing.T) {
	read := now.Add(-3 * time.Hour)
	s := string(SVG(Data{Commit: "x", Region: "r", SLOAvailable: true, Availability: 1, BudgetRemaining: 1, Releases: "open",
		SLOUpdated: read, SLOStale: true, Now: now}, true))
	if !strings.Contains(s, "last good reading 19 Oct 09:00 UTC") || strings.Contains(s, "12:00 UTC") {
		t.Errorf("stale reading not labelled with its own time:\n%s", s)
	}
}

// The real file the pipeline writes must load: a change in its shape would otherwise leave every
// delivery number on the card as "n/a" without any error.
func TestLoadsTheGeneratedDeliveryFile(t *testing.T) {
	d, err := LoadDelivery("../../../web/src/content/generated/delivery.json")
	if err != nil {
		t.Fatal(err)
	}
	if d.WindowDays != 30 || d.Head == nil || d.Head.SHA == "" {
		t.Errorf("generated delivery.json lost fields the card needs: %+v", d)
	}
}
