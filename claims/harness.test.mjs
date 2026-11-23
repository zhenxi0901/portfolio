// The claims' tests are only worth something if the harness can say no. Run with `node --test "claims/*.test.mjs"`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CannotTell, headline, table, testClaims } from "./harness.mjs";
import { tests as realTests } from "./tests.mjs";

const yes = async () => ({ holds: true, saw: "yes" });
const no = async () => ({ holds: false, saw: "no" });
const down = async () => {
  throw new CannotTell("the service is down");
};
const falseClaim = { id: "lie", claim: "A lie." };

/** Runs claims a, b, c… against these tests, without the waits. */
const run = (tests, claims = Object.keys(tests).filter((id) => id !== "lie")) =>
  testClaims({ claims: claims.map((id) => ({ id })), falseClaim, tests: { lie: no, ...tests }, world: {}, pause: async () => {} });

test("claims that hold, with the false one failing, pass", async () => {
  const v = await run({ a: yes, b: yes });
  assert.deepEqual([v.ok, v.holding, v.total, v.failing, v.unknown], [true, 2, 2, 0, 0]);
  assert.equal(headline(v), "2 of 2 claims hold; the false one fails, as it should");
});

test("one claim that fails fails the run", async () => {
  const v = await run({ a: yes, b: no });
  assert.deepEqual([v.ok, v.trustworthy, v.holding, v.failing], [false, true, 1, 1]);
  assert.equal(headline(v), "1 of 2 claims hold; the false one fails, as it should");
});

test("a service that is down is not a claim that fails, and is not counted as one that holds", async () => {
  const v = await run({ a: yes, b: down });
  assert.deepEqual([v.ok, v.holding, v.unknown], [true, 1, 1]);
  assert.equal(v.claims[1].saw, "Could not be checked: the service is down.");
  assert.match(headline(v), /^1 of 2 claims hold, 1 could not be checked;/);
});

test("if the false claim passes, nothing else counts", async () => {
  const v = await run({ a: yes, lie: yes });
  assert.deepEqual([v.ok, v.trustworthy], [false, false]);
  assert.match(headline(v), /trust none of these/);
});

test("if the false claim cannot be told, nothing else counts either", async () => {
  const v = await run({ a: yes, lie: down });
  assert.deepEqual([v.ok, v.trustworthy], [false, false]);
});

test("without a test for the false claim the run is not to be trusted", async () => {
  const v = await run({ a: yes, lie: undefined });
  assert.deepEqual([v.ok, v.trustworthy], [false, false]);
});

test("a claim without a test fails", async () => {
  const v = await run({ a: yes }, ["a", "b"]);
  assert.equal(v.ok, false);
  assert.deepEqual(v.claims[1], { id: "b", verdict: "fails", saw: "There is no test for this claim." });
});

test("a test whose claim the site no longer makes is noticed", async () => {
  const v = await run({ a: yes, old: yes }, ["a"]);
  assert.deepEqual([v.ok, v.orphans], [false, ["old"]]);
});

test("an answer the test cannot read is a failure, not a shrug", async () => {
  const v = await run({
    a: async () => {
      throw new TypeError("Cannot read properties of undefined");
    },
  });
  assert.equal(v.claims[0].verdict, "fails");
});

test("a claim fails only if every try fails", async () => {
  let asked = 0;
  const third = async () => ({ holds: ++asked === 3, saw: `asked ${asked} times` });
  const v = await run({ a: third });
  assert.deepEqual([v.ok, v.claims[0].saw], [true, "asked 3 times"]);
  let refused = 0;
  await run({
    a: async () => {
      refused++;
      return { holds: false, saw: "no" };
    },
  });
  assert.equal(refused, 3);
});

test("a test gets the claim's own numbers", async () => {
  let seen;
  await testClaims({
    claims: [{ id: "a", facts: { merged: 21 } }],
    falseClaim,
    tests: {
      lie: no,
      a: async (_, facts) => {
        seen = facts;
        return { holds: true, saw: "" };
      },
    },
    world: {},
  });
  assert.deepEqual(seen, { merged: 21 });
});

test("what a test saw is kept short, and cannot break the table", async () => {
  const v = await run({ a: async () => ({ holds: false, saw: `a | b ${"x".repeat(400)}` }) });
  assert.equal(v.claims[0].saw.length, 240);
  const lines = table(v, (id) => id).split("\n");
  assert.equal(lines.length, 4);
  assert.match(lines[2], /^\| a \| \*\*fails\*\* \| a \\\| b x+… \|$/);
  assert.match(lines[3], /fails, as it should/);
});

// The tests themselves, against a world made up here: each one has to be able to fail.
const status = { commit: "4a87353", go_version: "go1.27.0" };
const github = (answers) => async (path) => {
  for (const [start, body] of Object.entries(answers)) if (path.startsWith(start)) return body;
  return null;
};

test("the false claim's test would hold if the claim were true", async () => {
  const world = (go_version) => ({ json: async () => ({ ...status, go_version }) });
  assert.equal((await realTests.php(world("go1.27.0"), {})).holds, false);
  assert.equal((await realTests.php(world("php8.4"), {})).holds, true);
});

test("a commit that is not the newest release's does not hold", async () => {
  const world = (release) => ({
    repo: "o/r",
    json: async () => status,
    github: github({ "/repos/o/r/releases": { tag_name: "v1", target_commitish: release }, "/repos/o/r/compare": { status: "ahead" } }),
  });
  assert.equal((await realTests.commit(world("4a87353b381a"), {})).holds, true);
  assert.equal((await realTests.commit(world("0000000b381a"), {})).holds, false);
});

test("a bill whose lines do not add up does not hold", async () => {
  const month = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const report = (cost) => ({
    available: true, start: month, updated: new Date().toISOString(), days: 2, list_price: 1.5, free_tier: 1, bill: 0.5,
    lines: [{ cost: 1 }, { cost }],
  });
  const world = (cost) => ({ json: async () => report(cost) });
  assert.equal((await realTests.cost(world(0.5), {})).holds, true);
  assert.equal((await realTests.cost(world(0.4), {})).holds, false);
});

test("a release without its SBOM does not hold", async () => {
  const full = { assets: [{ name: "sbom.spdx.json" }, { name: "provenance.sigstore.json" }], tag_name: "v2", body: "" };
  const world = (releases) => ({ repo: "o/r", pages: async () => releases, github: async () => ({ attestations: [1, 2] }) });
  assert.equal((await realTests.releases(world([full]), {})).holds, true);
  const v = await realTests.releases(world([full, { ...full, tag_name: "v1", assets: [] }]), {});
  assert.deepEqual([v.holds, /v1/.test(v.saw)], [false, true]);
});

test("pull requests are checked for their author, and for what became of them", async () => {
  const pr = { user: { login: "zhenxi0901" }, merged_at: "2026-11-10T04:03:44Z", state: "closed", draft: false, additions: 6678, changed_files: 46 };
  const world = (change) => ({ owner: "zhenxi0901", github: async () => ({ ...pr, ...change }) });
  const facts = { pr: "o/r#92", lines: 6678, files: 46, merged: "10 Nov 2026" };
  assert.equal((await realTests.apptainer(world({}), facts)).holds, true);
  assert.equal((await realTests.apptainer(world({ additions: 1 }), facts)).holds, false);
  assert.equal((await realTests.apptainer(world({ user: { login: "someone" } }), facts)).holds, false);
  // "Open and in review" stops being true the day it merges.
  assert.equal((await realTests.plugins(world({ state: "open", merged_at: null }), facts)).holds, true);
  assert.equal((await realTests.plugins(world({}), facts)).holds, false);
});
