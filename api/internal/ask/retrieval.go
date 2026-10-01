// Package ask answers questions about ZhenXi from the site's own facts (knowledge.json).
package ask

import (
	"cmp"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"regexp"
	"slices"
	"strings"
)

// Keep in sync with web/src/lib/retrieval.ts: same tokenizer, aliases, BM25 and sentence pick.

// Fact is one entry of knowledge.json. Lead opens a retrieval answer; sentences starting with
// "Tools used:" are never picked.
type Fact struct {
	ID     string `json:"id"`
	Title  string `json:"title"`
	Text   string `json:"text"`
	Anchor string `json:"anchor"`
	Lead   string `json:"lead,omitempty"`
}

func LoadFacts(path string) ([]Fact, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var doc struct {
		Facts []Fact `json:"facts"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	if len(doc.Facts) == 0 {
		return nil, fmt.Errorf("%s: no facts", path)
	}
	return doc.Facts, nil
}

var stop = toSet(strings.Fields("a an and are as at be by did do does for from has have he her his how i in is it its me my of on or she so that the their them they this to was what when where which who why with you your zhenxi zhenxi's li about tell know please can could give describe explain"))

var aliases = map[string][]string{
	"k8s": {"kubernetes"}, "gcp": {"google", "cloud"}, "cost": {"spend", "bill"}, "money": {"spend", "bill"},
	"save": {"spend", "cut"}, "saved": {"spend", "cut"}, "gpu": {"a100", "nvidia"}, "gpus": {"a100", "nvidia"},
	"llm": {"agent", "llm"}, "ai": {"agent", "llm", "ai"}, "fyp": {"final-year", "project"},
	"thesis": {"final-year", "project"}, "school": {"education", "university"}, "study": {"education", "university"},
	"studied": {"education", "university"}, "job": {"intern", "role"}, "ci": {"pipeline", "build"},
	"cd": {"pipeline", "deploy"}, "paper": {"iccv", "publication"}, "monitoring": {"alerts", "grafana", "monitoring"},
	"sre": {"reliability", "alerts", "sre"},
}

var wordRe = regexp.MustCompile(`[a-z0-9][a-z0-9.+-]*`)

const (
	titleWeight  = 1.5
	maxSentences = 3
)

var suffixes = []string{"ations", "ation", "ating", "ated", "ates", "ings", "ing", "ions", "ion", "ed", "s"}

// stem strips a light set of suffixes so "migrated", "migrating" and "migration" meet at "migr".
func stem(w string) string {
	if strings.ContainsAny(w, "0123456789") {
		return w
	}
	// English "-es" plurals: reaches, passes, boxes.
	if len(w) >= 6 && (strings.HasSuffix(w, "ches") || strings.HasSuffix(w, "shes") ||
		strings.HasSuffix(w, "xes") || strings.HasSuffix(w, "sses")) {
		return w[:len(w)-2]
	}
	for _, suf := range suffixes {
		if strings.HasSuffix(w, suf) && len(w)-len(suf) >= 3 && !(suf == "s" && strings.HasSuffix(w, "ss")) {
			return w[:len(w)-len(suf)]
		}
	}
	return w
}

func tokenize(s string) []string {
	var out []string
	add := func(w string) {
		if w == "" || stop[w] {
			return
		}
		out = append(out, stem(w))
		for _, a := range aliases[w] {
			out = append(out, stem(a))
		}
	}
	for _, w := range wordRe.FindAllString(strings.ToLower(s), -1) {
		w = strings.TrimRight(w, ".")
		add(w)
		// "critical-cve" also counts as "critical" and "cve".
		if strings.Contains(w, "-") {
			for _, part := range strings.Split(w, "-") {
				add(part)
			}
		}
	}
	return out
}

func bm25(query []string, docs [][]string) []float64 {
	const k1, b = 1.4, 0.75
	n := float64(len(docs))
	var total float64
	df := map[string]float64{}
	for _, d := range docs {
		total += float64(len(d))
		for t := range toSet(d) {
			df[t]++
		}
	}
	avg := total / math.Max(n, 1)
	scores := make([]float64, len(docs))
	for i, d := range docs {
		tf := map[string]float64{}
		for _, t := range d {
			tf[t]++
		}
		for q := range toSet(query) {
			f := tf[q]
			if f == 0 {
				continue
			}
			idf := math.Log(1 + (n-df[q]+0.5)/(df[q]+0.5))
			scores[i] += idf * f * (k1 + 1) / (f + k1*(1-b+b*float64(len(d))/avg))
		}
	}
	return scores
}

type Result struct {
	Answer  string
	Sources []Fact
}

const noMatch = "I couldn't find that in what this site knows. Try asking about Primustech, the GKE migration, the cloud bill, the final-year project or the ICCV paper."

// Retrieve ranks facts with BM25 and stitches the best-matching sentences from the top two.
func Retrieve(question string, facts []Fact) Result {
	q := tokenize(question)
	// Title is scored as its own field (BM25F-style): a match there says more than one buried
	// in a long text, which BM25's length normalisation would otherwise discount.
	docs := make([][]string, len(facts))
	titleDocs := make([][]string, len(facts))
	for i, f := range facts {
		docs[i] = tokenize(f.Title + " " + f.Text)
		titleDocs[i] = tokenize(f.Title + " " + f.Lead)
	}
	scores := bm25(q, docs)
	for i, s := range bm25(q, titleDocs) {
		scores[i] += titleWeight * s
	}

	type ranked struct {
		f Fact
		s float64
	}
	var rs []ranked
	for i, f := range facts {
		if scores[i] > 0 {
			rs = append(rs, ranked{f, scores[i]})
		}
	}
	slices.SortStableFunc(rs, func(a, b ranked) int { return cmp.Compare(b.s, a.s) })
	if len(rs) > 2 {
		rs = rs[:2]
	}
	// A second fact only joins the answer when it is nearly as relevant as the first.
	if len(rs) == 2 && rs[1].s < 0.6*rs[0].s {
		rs = rs[:1]
	}
	if len(rs) == 0 {
		return Result{Answer: noMatch}
	}

	qs := toSet(q)
	type sent struct {
		text           string
		rank, pos, hit int
	}
	// The answer is written from the best fact only, so it stays on one topic; the runner-up is
	// still returned as a source the visitor can open.
	var sents []sent
	for rank, r := range rs[:1] {
		pos := -1
		for _, s := range splitSentences(r.f.Text) {
			if strings.HasPrefix(s, "Tools used:") {
				continue
			}
			pos++
			hits := 0
			for _, t := range tokenize(s) {
				if qs[t] {
					hits++
				}
			}
			sents = append(sents, sent{s, rank, pos, hits})
		}
	}
	picked := slices.DeleteFunc(slices.Clone(sents), func(s sent) bool { return s.hit == 0 })
	slices.SortStableFunc(picked, func(a, b sent) int {
		return cmp.Or(cmp.Compare(b.hit, a.hit), cmp.Compare(a.rank, b.rank), cmp.Compare(a.pos, b.pos))
	})
	if len(picked) > maxSentences {
		picked = picked[:maxSentences]
	}
	// Thin match: fill with the top fact's next sentences, in order, so the answer has substance.
	for _, s := range sents {
		if len(picked) >= maxSentences {
			break
		}
		if s.rank == 0 && !slices.ContainsFunc(picked, func(p sent) bool { return p.rank == s.rank && p.pos == s.pos }) {
			picked = append(picked, s)
		}
	}
	slices.SortStableFunc(picked, func(a, b sent) int {
		return cmp.Or(cmp.Compare(a.rank, b.rank), cmp.Compare(a.pos, b.pos))
	})
	var parts []string
	for _, s := range picked {
		parts = append(parts, s.text)
	}
	if lead := rs[0].f.Lead; lead != "" && !slices.Contains(parts, lead) {
		parts = append([]string{lead}, parts...)
	}
	out := Result{Answer: strings.Join(parts, " ")}
	for _, r := range rs {
		out.Sources = append(out.Sources, r.f)
	}
	return out
}

// splitSentences mirrors the client's split on ". " boundaries without breaking "3.02x".
func splitSentences(text string) []string {
	var out []string
	var cur strings.Builder
	for i, r := range text {
		cur.WriteRune(r)
		if (r == '.' || r == '!' || r == '?') && (i+1 == len(text) || text[i+1] == ' ') {
			if s := strings.TrimSpace(cur.String()); s != "" {
				out = append(out, s)
			}
			cur.Reset()
		}
	}
	if s := strings.TrimSpace(cur.String()); s != "" {
		out = append(out, s)
	}
	if len(out) == 0 {
		out = []string{text}
	}
	return out
}

func toSet(xs []string) map[string]bool {
	m := make(map[string]bool, len(xs))
	for _, x := range xs {
		m[x] = true
	}
	return m
}
