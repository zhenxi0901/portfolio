// Package card draws the live card the GitHub profile embeds (/api/card.svg): this server's own
// commit and region, its SLO as the uptime checks see it, and the delivery numbers the pipeline
// baked into the image. The profile reads from the production service rather than from a bot.
package card

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html"
	"os"
	"strings"
	"time"
	"unicode/utf8"
)

// Delivery is the part of /delivery.json (web/scripts/delivery-stats.mjs) the card shows.
type Delivery struct {
	WindowDays      int `json:"windowDays"`
	Deploys         int `json:"deploys"`
	LeadTimeMinutes struct {
		Median *float64 `json:"median"`
	} `json:"leadTimeMinutes"`
	ChangeFailureRate *float64 `json:"changeFailureRate"`
	Safeguards        struct {
		LastDrill *Drill `json:"lastDrill"`
	} `json:"safeguards"`
	// The commit the image was built from.
	Head *Head `json:"head"`
}

type Drill struct {
	Ended          time.Time `json:"ended"`
	RestoreSeconds int       `json:"restoreSeconds"`
}

type Head struct {
	SHA       string    `json:"sha"`
	Title     string    `json:"title"`
	Committed time.Time `json:"committed"`
}

// LoadDelivery reads the delivery numbers from the static export.
func LoadDelivery(path string) (*Delivery, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var d Delivery
	if err := json.Unmarshal(b, &d); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return &d, nil
}

// Data is everything one card shows.
type Data struct {
	Commit, Region  string
	SLOAvailable    bool
	Availability    float64
	BudgetRemaining float64
	Releases        string // "open", "frozen" or "unknown"
	Delivery        *Delivery
	Now             time.Time
}

type palette struct{ bg, border, text, muted, accent, good, warn, bad string }

var (
	dark  = palette{"#0d1117", "#30363d", "#e6edf3", "#8b949e", "#c2f75c", "#3fb950", "#d29922", "#f85149"}
	light = palette{"#ffffff", "#d0d7de", "#1f2328", "#59636e", "#3f6212", "#1a7f37", "#9a6700", "#cf222e"}
)

const (
	sans = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`
	mono = `ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`
	W    = 800
	H    = 214
)

// SVG renders the card. Every piece of text is escaped: commit titles come from git.
func SVG(d Data, darkTheme bool) []byte {
	p := light
	if darkTheme {
		p = dark
	}
	var b bytes.Buffer
	text := func(x, y int, size int, weight, fill, family, anchor, s string) {
		fmt.Fprintf(&b, `<text x="%d" y="%d" font-size="%d" font-weight="%s" fill="%s" font-family="%s" text-anchor="%s">%s</text>`+"\n",
			x, y, size, weight, fill, family, anchor, html.EscapeString(s))
	}

	up := d.SLOAvailable
	statusFill := p.good
	if d.Releases == "frozen" {
		statusFill = p.warn
	}

	fmt.Fprintf(&b, `<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d" role="img" aria-labelledby="t d">`+"\n", W, H, W, H)
	fmt.Fprintf(&b, "<title id=\"t\">%s</title>\n<desc id=\"d\">%s</desc>\n", html.EscapeString("Li ZhenXi's portfolio, live"), html.EscapeString(summary(d)))
	fmt.Fprintf(&b, `<rect x="0.5" y="0.5" width="%d" height="%d" rx="14" fill="%s" stroke="%s"/>`+"\n", W-1, H-1, p.bg, p.border)

	// Header: who, where, and the state the server reports about itself.
	fmt.Fprintf(&b, `<circle cx="32" cy="35" r="6" fill="%s"/>`+"\n", statusFill)
	text(46, 41, 17, "600", p.text, sans, "start", "Li ZhenXi · portfolio")
	text(W-24, 41, 13, "400", p.muted, mono, "end", "live on Cloud Run · "+d.Region)

	// What is running: the commit, and its title when the pipeline's record matches it.
	line := "commit " + d.Commit
	if h := d.Delivery.head(); h != nil && h.SHA == d.Commit {
		line += " · " + truncate(h.Title, 52) + " · committed " + ago(d.Now, h.Committed)
	}
	text(24, 72, 13, "400", p.muted, mono, "start", line)

	// Five numbers.
	type metric struct{ value, label, fill string }
	ms := []metric{
		{"measuring", "uptime, 30 days", p.muted},
		{"n/a", "error budget left", p.muted},
		{"n/a", "deploys, 30 days", p.text},
		{"n/a", "lead time, median", p.text},
		{"n/a", "change failure rate", p.text},
	}
	if up {
		ms[0] = metric{fmt.Sprintf("%.2f%%", floor2(d.Availability*100)), "uptime, 30 days", tone(p, d.Availability >= 0.999, d.Availability >= 0.99)}
		left := d.BudgetRemaining
		ms[1] = metric{fmt.Sprintf("%.0f%%", max(left, 0)*100), "error budget left", tone(p, left >= 0.5, left > 0)}
	}
	if dl := d.Delivery; dl != nil {
		ms[2].value = fmt.Sprint(dl.Deploys)
		if dl.WindowDays > 0 {
			ms[2].label = fmt.Sprintf("deploys, %d days", dl.WindowDays)
		}
		if m := dl.LeadTimeMinutes.Median; m != nil {
			ms[3].value = minutes(*m)
		}
		if r := dl.ChangeFailureRate; r != nil {
			ms[4].value = fmt.Sprintf("%.0f%%", *r*100)
		}
	}
	for i, m := range ms {
		x := 24 + i*152
		text(x, 128, 28, "600", m.fill, sans, "start", m.value)
		text(x, 151, 12, "400", p.muted, sans, "start", m.label)
	}

	// Footer: the release policy and the last rollback drill.
	foot := "releases " + map[string]string{"open": "open", "frozen": "frozen: reliability fixes only"}[d.Releases]
	if d.Releases != "open" && d.Releases != "frozen" {
		foot = "release policy: not measured yet"
	}
	if dl := d.Delivery; dl != nil && dl.Safeguards.LastDrill != nil {
		dr := dl.Safeguards.LastDrill
		foot += fmt.Sprintf(" · last rollback drill: traffic back in %d s, %s", dr.RestoreSeconds, dr.Ended.UTC().Format("2 Jan"))
	}
	fmt.Fprintf(&b, `<line x1="24" y1="174" x2="%d" y2="174" stroke="%s"/>`+"\n", W-24, p.border)
	text(24, 197, 12, "400", p.muted, sans, "start", foot)
	text(W-24, 197, 12, "400", p.accent, mono, "end", "as of "+d.Now.UTC().Format("15:04 UTC"))
	b.WriteString("</svg>\n")
	return b.Bytes()
}

func (d *Delivery) head() *Head {
	if d == nil {
		return nil
	}
	return d.Head
}

func summary(d Data) string {
	s := fmt.Sprintf("Commit %s live on Cloud Run in %s.", d.Commit, d.Region)
	if d.SLOAvailable {
		s += fmt.Sprintf(" Uptime over 30 days %.2f%%, error budget left %.0f%%.", floor2(d.Availability*100), max(d.BudgetRemaining, 0)*100)
	}
	if d.Delivery != nil {
		s += fmt.Sprintf(" %d deploys in %d days.", d.Delivery.Deploys, d.Delivery.WindowDays)
	}
	return s
}

func tone(p palette, good, ok bool) string {
	switch {
	case good:
		return p.good
	case ok:
		return p.warn
	}
	return p.bad
}

// floor2 rounds down to two decimals, so 99.996% shows as 99.99%, never as a 100.00% it is not.
func floor2(x float64) float64 { return float64(int64(x*100)) / 100 }

func minutes(m float64) string {
	switch {
	case m < 60:
		return fmt.Sprintf("%.1f min", m)
	case m < 1440:
		return fmt.Sprintf("%.1f h", m/60)
	}
	return fmt.Sprintf("%.1f days", m/1440)
}

func ago(now, t time.Time) string {
	d := now.Sub(t)
	switch {
	case d < time.Minute:
		return "just now"
	case d < time.Hour:
		return fmt.Sprintf("%d min ago", int(d.Minutes()))
	case d < 48*time.Hour:
		return fmt.Sprintf("%d h ago", int(d.Hours()))
	}
	return fmt.Sprintf("%d days ago", int(d.Hours()/24))
}

func truncate(s string, n int) string {
	s = strings.TrimSpace(s)
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	r := []rune(s)
	return strings.TrimSpace(string(r[:n-1])) + "…"
}
