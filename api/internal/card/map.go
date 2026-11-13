package card

import (
	"bytes"
	"fmt"
	"html"
	"strings"
	"time"

	"github.com/zhenxi0901/portfolio/api/internal/slo"
)

// Live is what the map shows besides the card's data: this instance's own view of itself.
type Live struct {
	P50, P95 float64       // ms, over this instance's recent visitor requests (probes and the lab left out)
	Up       time.Duration // how long this instance has been running
	Served   uint64        // visitor requests this instance has answered
}

// A box on the map: its two lines, and whether it is on the visitor's own path.
type node struct {
	title, sub string
	accent     bool
}

const (
	mapW, mapH = 800, 320
	boxW, boxH = 136, 42 // narrow enough that the dots are seen between the boxes, not only under them
)

// Where each box sits: the request runs left to right through the middle, the deploy comes in from
// the top, and the uptime checks and Monitoring sit along the bottom.
var at = map[string][2]int{
	"you": {82, 165}, "gfe": {282, 165}, "run": {482, 165}, "page": {712, 108}, "api": {712, 222},
	"actions": {482, 68}, "probes": {282, 268}, "monitoring": {482, 268},
}

func route(names ...string) string {
	var b strings.Builder
	for i, n := range names {
		p := at[n]
		if i == 0 {
			fmt.Fprintf(&b, "M%d,%d", p[0], p[1])
		} else {
			fmt.Fprintf(&b, " L%d,%d", p[0], p[1])
		}
	}
	return b.String()
}

func mapMs(v float64) string {
	if v < 10 {
		return fmt.Sprintf("%.1f", v)
	}
	return fmt.Sprintf("%.0f", v)
}

func upFor(d time.Duration) string {
	switch {
	case d < time.Hour:
		return fmt.Sprintf("%d min", max(1, int(d.Minutes())))
	case d < 48*time.Hour:
		return fmt.Sprintf("%d h", int(d.Hours()))
	}
	return fmt.Sprintf("%d days", int(d.Hours()/24))
}

// Map draws the site's request path and what watches it, with live numbers, and dots that run
// along the edges: visitors' requests, the uptime checks and their results, a deploy. The GitHub
// profile embeds it (/api/map.svg, ?theme=light). Plain SVG with SMIL, so it moves inside an <img>;
// with reduced motion the dots are hidden and the numbers stay.
func Map(d Data, l Live, darkTheme bool) []byte {
	p, deploy, panel := light, "#8250df", "#f6f8fa"
	if darkTheme {
		p, deploy, panel = dark, "#a371f7", "#161b22"
	}

	latency := "no visitors yet"
	if l.P50 > 0 || l.P95 > 0 {
		latency = fmt.Sprintf("p50 %s · p95 %s ms", mapMs(l.P50), mapMs(l.P95))
	}
	instance := "asia-southeast1"
	if l.Up > 0 {
		instance = "instance up " + upFor(l.Up)
	}
	watched := fmt.Sprintf("objective %.1f%%", slo.Target*100)
	if d.SLOAvailable {
		watched = fmt.Sprintf("%.3f%% up", slo.FloorPct(d.Availability, 3))
	}
	shipped := d.Commit
	if d.Delivery != nil && d.Delivery.Deploys > 0 {
		shipped = fmt.Sprintf("%s · %d deploys", d.Commit, d.Delivery.Deploys)
	}
	nodes := map[string]node{
		"you":        {title: "You", sub: "any browser", accent: true},
		"gfe":        {title: "Google front end", sub: "terminates TLS"},
		"run":        {title: "Cloud Run · Go", sub: instance, accent: true},
		"page":       {title: "This page", sub: "static export", accent: true},
		"api":        {title: "/api", sub: latency},
		"actions":    {title: "GitHub Actions", sub: shipped},
		"probes":     {title: "Uptime checks", sub: "3 regions · 1/min"},
		"monitoring": {title: "Cloud Monitoring", sub: watched},
	}

	var b bytes.Buffer
	esc := html.EscapeString
	w := func(format string, a ...any) { fmt.Fprintf(&b, format, a...) }

	desc := fmt.Sprintf("Visitors' requests go through Google's front end to a Go server on Cloud Run in %s (%s), answering %s. "+
		"Uptime checks from three regions call it every minute and Cloud Monitoring records them: %s. GitHub Actions deployed commit %s",
		d.Region, instance, latency, watched, d.Commit)
	if d.Delivery != nil && d.Delivery.Deploys > 0 {
		desc += fmt.Sprintf("; %d deploys in %d days", d.Delivery.Deploys, d.Delivery.WindowDays)
	}
	desc += "."

	w(`<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d" role="img" aria-labelledby="mt md">`+"\n", mapW, mapH, mapW, mapH)
	w("<title id=\"mt\">Li ZhenXi's portfolio, live: the request path and what keeps watch over it</title>\n")
	w("<desc id=\"md\">%s</desc>\n", esc(desc))
	w("<style>@media (prefers-reduced-motion: reduce){.dot{display:none}}</style>\n")
	w(`<rect x="0.5" y="0.5" width="%d" height="%d" rx="12" fill="%s" stroke="%s"/>`+"\n", mapW-1, mapH-1, p.bg, p.border)

	// Header: what this is, with a live light that breathes.
	w(`<circle cx="26" cy="24" r="4" fill="%s"><animate attributeName="opacity" values="1;0.35;1" dur="2s" repeatCount="indefinite"/></circle>`+"\n", p.good)
	w(`<text x="38" y="28" font-size="13" font-weight="600" fill="%s" font-family="%s">portfolio, live</text>`+"\n", p.text, sans)
	w(`<text x="%d" y="28" font-size="11" fill="%s" font-family="%s" text-anchor="end">%s</text>`+"\n", mapW-20, p.muted, mono, esc(d.Region))

	// Edges first, so the boxes cover their ends and the dots slip under them.
	edge := func(a, z string, stroke string, dashed bool) {
		dash := ""
		if dashed {
			dash = ` stroke-dasharray="4 4"`
		}
		w(`<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="%s" stroke-width="1.5"%s/>`+"\n", at[a][0], at[a][1], at[z][0], at[z][1], stroke, dash)
	}
	edge("you", "gfe", p.accent, false)
	edge("gfe", "run", p.accent, false)
	edge("run", "page", p.accent, false)
	edge("run", "api", p.border, false)
	edge("actions", "run", p.border, true)
	edge("probes", "gfe", p.border, true)
	edge("probes", "monitoring", p.border, true)
	edge("monitoring", "api", p.border, true)

	// Dots. Each runs its route once a cycle; keyPoints hold it under a box (out of sight) for the
	// rest, so an uptime check goes by every 6 s and a deploy every 9 s, not continuously.
	dot := func(fill, path string, dur float64, begin float64, keyPoints, keyTimes string) {
		hold := ""
		if keyPoints != "" {
			hold = fmt.Sprintf(` keyPoints="%s" keyTimes="%s" calcMode="linear"`, keyPoints, keyTimes)
		}
		// Hidden until its first run: before then it would sit at the top-left corner.
		w(`<circle class="dot" r="4.5" fill="%s" opacity="0"><set attributeName="opacity" to="1" begin="%gs"/><animateMotion dur="%gs" begin="%gs" repeatCount="indefinite" path="%s"%s/></circle>`+"\n",
			fill, begin, dur, begin, path, hold)
	}
	toPage, toAPI := route("you", "gfe", "run", "page"), route("you", "gfe", "run", "api")
	dot(p.accent, toPage, 3, 0, "", "")
	dot(p.accent, toPage, 3, 1.5, "", "")
	dot(p.accent, toAPI, 3, 0.75, "", "")
	dot(p.good, route("probes", "gfe", "run", "api"), 6, 2, "0;1;1", "0;0.5;1")
	dot(p.good, route("probes", "monitoring", "api"), 6, 2, "0;0;1;1", "0;0.5;0.8;1")
	dot(deploy, route("actions", "run"), 9, 1, "0;0;1;1", "0;0.8;0.92;1")

	// Boxes and their words.
	for _, name := range []string{"you", "gfe", "run", "page", "api", "actions", "probes", "monitoring"} {
		n, c := nodes[name], at[name]
		stroke := p.border
		if n.accent {
			stroke = p.accent
		}
		w(`<rect x="%d" y="%d" width="%d" height="%d" rx="10" fill="%s" stroke="%s"/>`+"\n", c[0]-boxW/2, c[1]-boxH/2, boxW, boxH, panel, stroke)
		w(`<text x="%d" y="%d" font-size="12" font-weight="600" fill="%s" font-family="%s" text-anchor="middle">%s</text>`+"\n", c[0], c[1]-3, p.text, sans, esc(n.title))
		w(`<text x="%d" y="%d" font-size="10" fill="%s" font-family="%s" text-anchor="middle">%s</text>`+"\n", c[0], c[1]+12, p.muted, mono, esc(n.sub))
	}

	// Footer: the legend, and when and by whom this was drawn.
	legend := []struct{ fill, label string }{{p.accent, "requests"}, {p.good, "uptime checks"}, {deploy, "deploys"}}
	x := 26
	for _, it := range legend {
		w(`<circle cx="%d" cy="304" r="4" fill="%s"/>`+"\n", x, it.fill)
		w(`<text x="%d" y="308" font-size="11" fill="%s" font-family="%s">%s</text>`+"\n", x+9, p.muted, sans, it.label)
		x += 18 + 7*len(it.label)
	}
	w(`<text x="%d" y="308" font-size="11" fill="%s" font-family="%s" text-anchor="end">drawn %s by the server it shows</text>`+"\n",
		mapW-20, p.muted, sans, d.Now.UTC().Format("15:04 UTC"))
	b.WriteString("</svg>\n")
	return b.Bytes()
}
