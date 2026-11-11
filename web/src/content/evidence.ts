// Where the site's claims come from. Three kinds of proof, said plainly: something anyone can
// check right now, something on public record, or work in a private repository that this page
// cannot link to. The /evidence page renders this.
import delivery from "@/content/generated/delivery.json";
import { fyp, profile, publication, stats } from "@/content/profile";
import { SITE_URL } from "@/lib/site";

export type ProofKind = "live" | "public" | "private";

/** A check the page can run from the visitor's browser against this site's own API. */
export type LiveCheck = "slo" | "status" | "mcp";

export type Claim = {
  claim: string;
  /** Where the site makes the claim. */
  seen: { label: string; href: string };
  kind: ProofKind;
  /** What the proof is, in a sentence. */
  proof: string;
  links?: { label: string; href: string }[];
  /** A command that checks it from a terminal. */
  command?: string;
  check?: LiveCheck;
};

export type ClaimGroup = { id: string; title: string; lead: string; claims: Claim[] };

const REPO = `${profile.github}/portfolio`;
const ARIES_MERGED = `${fyp.aries}/pulls?q=is%3Apr+author%3Azhenxi0901+is%3Amerged`;
const drill = delivery.safeguards.lastDrill;
const failureRate = delivery.changeFailureRate == null ? "" : `, with a change failure rate of ${Math.round(delivery.changeFailureRate * 100)}%`;
const stat = (value: number) => stats.find((s) => s.value === value);
if (!stat(169) || !stat(320)) throw new Error("evidence.ts quotes headline numbers that profile.ts no longer has");

export const claimGroups: ClaimGroup[] = [
  {
    id: "site",
    title: "This site",
    lead: "The site is the one system here that I can open up completely, so most of what it says about itself can be checked from where you are sitting.",
    claims: [
      {
        claim: "Availability is measured from outside against a 99.9% objective.",
        seen: { label: "Status", href: "/status" },
        kind: "live",
        proof: "The API reads Google Cloud's uptime checks, which request the site every minute from three regions, and returns what they recorded.",
        command: `curl -s ${SITE_URL}/api/slo`,
        check: "slo",
        links: [{ label: "infra/slo.tf: the uptime check", href: `${REPO}/blob/main/infra/slo.tf` }],
      },
      {
        claim: "The commit shown on the page is the commit that is running.",
        seen: { label: "Live status", href: "/#status" },
        kind: "live",
        proof: "The server reports the commit it was built from. Compare it with the head of the main branch on GitHub.",
        command: `curl -s ${SITE_URL}/api/status`,
        check: "status",
        links: [{ label: "Commits on main", href: `${REPO}/commits/main` }],
      },
      {
        claim: "The site is an MCP server that an AI agent can call.",
        seen: { label: "For agents", href: "/agents" },
        kind: "live",
        proof: "Ask the server for its tools. The page for agents has a console that calls each one.",
        check: "mcp",
        links: [{ label: "api/internal/mcp/mcp.go", href: `${REPO}/blob/main/api/internal/mcp/mcp.go` }],
      },
      {
        claim: `${delivery.deploys} deploys in the ${delivery.windowDays} days to ${delivery.generated.slice(0, 10)}${failureRate}.`,
        seen: { label: "How this site ships", href: "/#status" },
        kind: "public",
        proof: "Computed by the pipeline from its own run history. Every run is public, and the changelog lists each release with the commits it shipped.",
        links: [
          { label: "Deploy runs", href: `${REPO}/actions/workflows/deploy.yml` },
          { label: "Changelog", href: "/changelog" },
        ],
      },
      ...(drill?.restoreSeconds != null
        ? [
            {
              claim: `A rollback drill in production had traffic back on the previous revision ${drill.restoreSeconds} seconds after the switch.`,
              seen: { label: "How this site ships", href: "/#status" },
              kind: "public" as const,
              proof: "The drill is a workflow run that fails its own live check on purpose and passes only if the rollback then works. Its log has the timestamps.",
              links: [{ label: "The drill's run", href: drill.url }],
            },
          ]
        : []),
      {
        claim: "Every release is one image, built once, with an SBOM and signed build provenance.",
        seen: { label: "Decisions, ADR 3", href: "/decisions#build-once-check-before-traffic" },
        kind: "public",
        proof: "Each GitHub release carries the SBOM and the signature bundles, and the repository lists its attestations.",
        links: [
          { label: "Releases", href: `${REPO}/releases` },
          { label: "Attestations", href: `${REPO}/attestations` },
        ],
      },
      {
        claim: "Accessibility and SEO score 100 on every release.",
        seen: { label: "The footer of every page", href: "/" },
        kind: "public",
        proof: "CI runs Lighthouse on a page of every kind, and on the home and status pages in dark as well, and fails the build if either score drops. The reports are attached to each run.",
        links: [{ label: "CI runs", href: `${REPO}/actions/workflows/ci.yml` }],
      },
      {
        claim: "Three things went wrong while building it, and each has a postmortem.",
        seen: { label: "Postmortems", href: "/#postmortems" },
        kind: "public",
        proof: "The write-ups cite the commits that caused and fixed each problem. The commits are in the repository's history.",
        links: [{ label: "Commit history", href: `${REPO}/commits/main` }],
      },
    ],
  },
  {
    id: "open",
    title: "Research and open source",
    lead: "Code I wrote in other people's public repositories. The pull requests are the record: what changed, who reviewed it, when it merged.",
    claims: [
      {
        claim: "I wrote the Toolathlon adapter for ARIES, the lab's agent-serving framework.",
        seen: { label: "Research", href: "/#research" },
        kind: "public",
        proof: "Merged upstream in October 2026.",
        links: [
          { label: "ARIES #55", href: `${fyp.aries}/pull/55` },
          { label: "All my merged pull requests there", href: ARIES_MERGED },
        ],
      },
      {
        claim: `An Apptainer backend runs the whole stack on a supercomputer without root: ${fyp.apptainer.lines.toLocaleString("en-GB")} lines across ${fyp.apptainer.files} files.`,
        seen: { label: "Running an agent benchmark without root", href: "/writing/agents-without-root" },
        kind: "public",
        proof: `Merged upstream on ${fyp.apptainer.merged}. The diff has the line and file counts.`,
        links: [{ label: "ARIES #92", href: fyp.apptainer.pr }],
      },
      {
        claim: "Portable plugins (skills and MCP servers) that work in both of ARIES's agent harnesses.",
        seen: { label: "Research", href: "/#research" },
        kind: "public",
        proof: "Open and in review, not merged. Listed here so the site does not imply otherwise.",
        links: [{ label: "ARIES #96", href: fyp.plugins.pr }],
      },
      {
        claim: "Co-author of a paper at ICCV 2025.",
        seen: { label: "Research", href: "/#research" },
        kind: "public",
        proof: `${publication.title}. The code is public and the paper lists its authors.`,
        links: [{ label: "PVChat code", href: publication.code }],
      },
      {
        claim: "21 merged pull requests on a robot car's Android controller.",
        seen: { label: "Experience", href: "/#experience" },
        kind: "public",
        proof: "A team repository for NTU's Multidisciplinary Design Project. The pull requests are public.",
        links: [{ label: "My merged pull requests", href: "https://github.com/whupdido/mdp/pulls?q=is%3Apr+author%3Azhenxi0901+is%3Amerged" }],
      },
      {
        claim: "320 agent runs: MCP tool calls were 2.7% of agent time, 96% of input tokens came from the prefix cache, and four tasks at once gave 3.02x the throughput.",
        seen: { label: "What 320 agent runs taught me", href: "/writing/serving-llm-agents" },
        kind: "private",
        proof: "From my final-year project's report and result files, which are in a private repository while the project is still in progress. The write-up gives the method, the models and the hardware.",
      },
    ],
  },
  {
    id: "work",
    title: "Work at Primustech",
    lead: "This is an employer's production system. Its repository, bills and documents are private, and nothing here links to them. I am saying that plainly rather than dressing it up.",
    claims: [
      {
        claim: "169 of my pull requests merged into a production IoT platform's repository.",
        seen: { label: "The numbers under the hero", href: "/" },
        kind: "private",
        proof: "Counted from the private repository's pull request history under my GitHub account.",
      },
      {
        claim: "Cloud spend cut by about 15%, including 914 orphaned Kafka topics removed and 40% fewer monitoring samples.",
        seen: { label: "Cutting cloud spend", href: "/work/reaper" },
        kind: "private",
        proof: "The cost review I wrote for the platform records each cut and its trade-off: 914 orphaned topics removed, 40% fewer samples per scrape, the database and pods resized. The case study gives each move with its before and after.",
      },
      {
        claim: "Three remote-control lanes are measured against one written safety pattern of ten principles, and the bridge that drives them has 431 tests.",
        seen: { label: "Remote control that fails safe", href: "/work/control" },
        kind: "private",
        proof: "The pattern, the tests and the commissioning records are in the private repository. The case study has a working model of the guards.",
      },
      {
        claim: "A network-policy rehearsal found that the obvious rollout closed 28 of the 46 paths meant to close only at cutover, and could not be undone cleanly.",
        seen: { label: "Changing a live cluster in steps", href: "/work/two-step" },
        kind: "private",
        proof: "From the rehearsal's own record of each path checked, kept with the change in the private repository.",
      },
    ],
  },
];

export const proofKinds: Record<ProofKind, { label: string; meaning: string }> = {
  live: { label: "Check it now", meaning: "This site answers for itself. Press the button or run the command." },
  public: { label: "Public record", meaning: "A pull request, workflow run or file that anyone can open." },
  private: { label: "Private", meaning: "In a private repository. No link, and I will not pretend there is one. Ask me and I will walk you through it." },
};

export const proofCounts = Object.fromEntries(
  (Object.keys(proofKinds) as ProofKind[]).map((k) => [k, claimGroups.flatMap((g) => g.claims).filter((c) => c.kind === k).length]),
) as Record<ProofKind, number>;
