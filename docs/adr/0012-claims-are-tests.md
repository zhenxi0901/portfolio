<!-- Generated from web/src/content/decisions.ts by web/scripts/gen-adr.mts. Edit that file, not this one. -->

# 12. Claims are tests, and one is false on purpose

- Status: Accepted
- Date: 2026-11-23

## Context

A portfolio is a list of claims, and /evidence says where each comes from. Nothing checked that they stayed true. In one week of November the changelog said no release had a GitHub release, the deploys "in the last 30 days" were counted a week before, and one of 56 releases had shipped without the SBOM every release is said to have; nothing failed.

Most of what is claimed can be checked against a record somebody else keeps: GitHub's runs and releases, other people's repositories, a conference's page, the API as any visitor gets it.

## Decision

Each claim on /evidence that can be checked from outside has a test in /claims, under the claim's id, which is given the claim's own numbers as the live site publishes them. A checkable claim without an id fails the build, and a claim without a test, or a test without a claim, fails the run.

A GitHub workflow runs them against the live site after every deploy and on a schedule, and leaves the results in the job's own annotations. The server reads those back over GitHub's public API, so the results the site shows are GitHub's record of the run, and nothing needs the right to write one.

One more claim is false on purpose, and its test has to fail. If it passes, the tests cannot tell true from false, and the site says not to trust the rest.

## Consequences

What it buys:

- What stops being true shows on the page that claims it, within hours, with what the test saw.
- Adding a claim means writing down what would make it false.

What it costs:

- A test says only what it tests. That a name is on a paper's page says nothing of what the work was.
- GitHub starts scheduled runs late, and stops them after 60 days without activity in the repository, so the site always says how old the results are.
- Annotations are an unusual place for results. A check of their own on the commit came first, and GitHub listed it inside that commit's CI run, as if a CI job had failed.
- The claims about private work cannot be tested, and say so.

## Evidence

- [claims/tests.mjs: one test per claim](../../claims/tests.mjs)
- [claims/harness.test.mjs: the tests can fail](../../claims/harness.test.mjs)
- [.github/workflows/claims.yml](../../.github/workflows/claims.yml)
- [api/internal/claims/claims.go: reading GitHub's record back](../../api/internal/claims/claims.go)
