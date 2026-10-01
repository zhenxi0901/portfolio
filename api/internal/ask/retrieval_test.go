package ask

import (
	"slices"
	"strings"
	"testing"
)

func facts(t *testing.T) []Fact {
	t.Helper()
	fs, err := LoadFacts("testdata/knowledge.json")
	if err != nil {
		t.Fatal(err)
	}
	return fs
}

func TestRetrieveRanksTheRightFact(t *testing.T) {
	cases := []struct {
		question, wantSource, wantInAnswer string
	}{
		{"How did ZhenXi cut the cloud bill?", "case-reaper", "15%"},
		{"Which GPUs has ZhenXi used?", "skills", "A100"},
		{"What happens when a build has a critical CVE?", "case-pipeline", "CVE"},
		{"Tell me about the ICCV paper", "pvchat", "ICCV"},
		{"k8s migration", "case-gke", "GKE"},
		{"Where did ZhenXi study?", "education", "Nanyang"},
		{"How does traffic reach the cluster?", "path-user", "load balancer"},
		{"What do you monitor?", "monitoring", "silence"},
		{"How does a command reach the HVAC plant?", "path-command", "RPC"},
	}
	fs := facts(t)
	for _, c := range cases {
		res := Retrieve(c.question, fs)
		var ids []string
		for _, s := range res.Sources {
			ids = append(ids, s.ID)
		}
		if !slices.Contains(ids, c.wantSource) {
			t.Errorf("%q: sources %v, want %s among them", c.question, ids, c.wantSource)
		}
		if !strings.Contains(res.Answer, c.wantInAnswer) {
			t.Errorf("%q: answer %q does not mention %q", c.question, res.Answer, c.wantInAnswer)
		}
	}
}

func TestRetrieveNoMatch(t *testing.T) {
	res := Retrieve("zzqx plorf", facts(t))
	if res.Answer != noMatch || len(res.Sources) != 0 {
		t.Fatalf("expected the no-match answer, got %+v", res)
	}
}

func TestSplitSentencesKeepsDecimals(t *testing.T) {
	got := splitSentences("It ran 3.02x faster. Memory stayed at 6.4 GiB.")
	if len(got) != 2 || got[0] != "It ran 3.02x faster." {
		t.Fatalf("got %q", got)
	}
}

func TestTidyRemovesEmDashes(t *testing.T) {
	if got := tidy("GKE — with Terraform – mostly"); strings.ContainsAny(got, "—–") {
		t.Fatalf("dashes left in %q", got)
	}
}
