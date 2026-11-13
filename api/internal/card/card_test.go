package card

import (
	"bytes"
	"encoding/xml"
	"errors"
	"io"
	"os"
	"path/filepath"
	"regexp"
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
	// Read at 12:00, counting the uptime checks up to the last whole hour before it.
	d := Data{Commit: "9dfbfb6", Region: "asia-southeast1", SLOAvailable: true, Availability: 0.99996, BudgetRemaining: 0.97,
		Releases: "open", Delivery: delivery(t), Now: now, SLOUpdated: now, SLOThrough: now.Add(-time.Hour)}
	for _, darkTheme := range []bool{true, false} {
		svg := SVG(d, darkTheme)
		wellFormed(t, svg)
		s := string(svg)
		for _, want := range []string{
			"99.99%", // floored, never rounded up to a 100.00% it is not
			"97.0%", ">32<", "4.4 min", ">0%<", "deploys, 30 days",
			"committed 1 h ago", "releases open", "traffic back in 20 s, 19 Oct", "uptime to 11:00 UTC",
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

// A local copy says so, on the card and in its description, as get_status and the text card do.
func TestCardOnALocalCopy(t *testing.T) {
	s := string(SVG(Data{Commit: "dev", Region: "local", Releases: "unknown", Now: now}, true))
	if strings.Contains(s, "live on Cloud Run") || strings.Contains(s, "portfolio, live") || strings.Count(s, "local copy") != 3 {
		t.Errorf("a local copy's card should say so in its title, description and header, and never claim to be live:\n%s", s)
	}
	if s := string(SVG(Data{Commit: "abc1234", Region: "asia-southeast1", Now: now}, true)); !strings.Contains(s, "live on Cloud Run · asia-southeast1") {
		t.Error("the live card lost its location")
	}
}

// While the 30 days fill, the description names the same window as the card's label.
func TestCardDescribesTheUptimeWindow(t *testing.T) {
	d := Data{Commit: "abc1234", Region: "asia-southeast1", SLOAvailable: true, Availability: 0.9999, BudgetRemaining: 0.9, UptimeLabel: "uptime since 19 Oct", Now: now}
	if s := string(SVG(d, true)); !strings.Contains(s, "Uptime since 19 Oct: 99.99%") || strings.Contains(s, "over 30 days") {
		t.Errorf("description does not name the window:\n%s", s)
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

// plain drops the card's ANSI colour codes, so a test can read it as a person would.
func plain(b []byte) string {
	return regexp.MustCompile(`\x1b\[[0-9;]*m`).ReplaceAllString(string(b), "")
}

func TestTerminalCard(t *testing.T) {
	d := Data{Commit: "9dfbfb6", Region: "asia-southeast1", SLOAvailable: true, Availability: 0.99996, BudgetRemaining: 0.97,
		Releases: "open", UptimeLabel: "uptime since 19 Oct", Delivery: delivery(t), Now: now}
	s := plain(Terminal(d, "https://example.test"))
	for _, want := range []string{"Li ZhenXi", "you asked from a terminal", "commit 9dfbfb6 on Cloud Run", "99.99% since 19 Oct, measured from outside",
		"97.0% of the error budget left, releases open", "32 deploys in 30 days, lead time 4.4 min, change failure rate 0%",
		"https://example.test/mcp", "https://example.test/llms.txt"} {
		if !strings.Contains(s, want) {
			t.Errorf("terminal card lacks %q:\n%s", want, s)
		}
	}
	if strings.Contains(s, "last good reading") {
		t.Errorf("a fresh reading was labelled stale:\n%s", s)
	}
	d.UptimeLabel = "uptime, 30 days"
	if s := plain(Terminal(d, "https://example.test")); !strings.Contains(s, "over 30 days, measured from outside") {
		t.Errorf("full-window label:\n%s", s)
	}
}

// The colours follow the SVG card's thresholds, and old or missing numbers say so.
func TestTerminalCardStates(t *testing.T) {
	const red, green, yellow = "\x1b[31m", "\x1b[32m", "\x1b[33m"
	base := Data{Commit: "x", Region: "asia-southeast1", SLOAvailable: true, Releases: "open", Now: now}

	met := base
	met.Availability, met.BudgetRemaining = 0.9995, 0.8
	if s := string(Terminal(met, "https://e.test")); !strings.Contains(s, green+"99.95%") || !strings.Contains(s, green+"80.0%") {
		t.Errorf("objective met should be green:\n%q", s)
	}
	below := base
	below.Availability, below.BudgetRemaining, below.Releases = 0.995, -0.4, "frozen"
	if s := string(Terminal(below, "https://e.test")); !strings.Contains(s, yellow+"99.50%") || !strings.Contains(s, red+"0.0%") {
		t.Errorf("below the objective should be yellow, a spent budget red:\n%q", s)
	}

	stale := met
	stale.SLOStale, stale.SLOUpdated = true, now.Add(-6*time.Hour)
	if s := plain(Terminal(stale, "https://e.test")); !strings.Contains(s, "last good reading 19 Oct 06:00 UTC") {
		t.Errorf("stale numbers not labelled with their time:\n%s", s)
	}

	gone := Data{Commit: "x", Region: "asia-southeast1", SLOReason: "Measurements are unavailable right now.", Now: now}
	if s := plain(Terminal(gone, "https://e.test")); !strings.Contains(s, "Measurements are unavailable right now.") || strings.Contains(s, "local copy") {
		t.Errorf("live service without numbers:\n%s", s)
	}
	local := Data{Commit: "dev", Region: "local", Now: now}
	if s := plain(Terminal(local, "http://localhost:8080")); !strings.Contains(s, "not measured on a local copy") || strings.Contains(s, "Cloud Run") {
		t.Errorf("local copy:\n%s", s)
	}
}
