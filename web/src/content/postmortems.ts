// Blameless write-ups of things that went wrong while building and running this site. Every time
// is Singapore time (UTC+8) on 1 October 2026 unless it says otherwise. Sources: the repository's
// commits, the GitHub Actions run history, Cloud Run revisions and Cloud Run request logs.

export const REPO = "https://github.com/zhenxi0901/portfolio";

export type TimelineTag = "change" | "detect" | "investigate" | "fix" | "resolve";

export type Postmortem = {
  slug: string;
  title: string;
  /** One sentence for the card. */
  summary: string;
  date: string;
  kind: "Near miss" | "False alarm";
  stats: { value: string; label: string }[];
  impact: string;
  timeline: { at: string; what: string; tag: TimelineTag }[];
  rootCause: string[];
  contributing: string[];
  detection: string;
  wentWell: string[];
  lucky: string;
  actions: { what: string; done: boolean; commit?: string; when?: string }[];
  lesson: string;
};

export const postmortems: Postmortem[] = [
  {
    slug: "contact-form",
    title: "“Message sent” for messages nobody would read",
    summary:
      "For the site's first 3 h 36 min, the contact form said a message was sent while keeping it on a disk that Cloud Run throws away.",
    date: "1 Oct 2026",
    kind: "Near miss",
    stats: [
      { value: "3 h 36 min", label: "the form could lose a message" },
      { value: "11", label: "requests in that window, all the smoke test's" },
      { value: "0", label: "visitor messages lost" },
    ],
    impact:
      "None in the end. Cloud Run's request logs show 11 POSTs to the contact API while the bug was live, every one from the smoke test sending deliberately bad input: 8 rejected with 400, 3 with 429. No visitor used the form. Had a recruiter written in that window, they would have been told it was sent and never heard back.",
    timeline: [
      {
        at: "12:10",
        tag: "change",
        what: "The site's first revision goes live. The contact API validates a message, appends it to a file and replies 202. Forwarding to a webhook ran in the background, if one was configured. None was.",
      },
      {
        at: "12:14 to 15:36",
        tag: "change",
        what: "11 requests reach the contact API, all from the smoke test: 8 rejected as invalid, 3 by the rate limiter. No visitor writes in.",
      },
      {
        at: "Before 15:30",
        tag: "detect",
        what: "Found in review, walking the contact path end to end: on Cloud Run that file lives in per-instance scratch space that nobody reads.",
      },
      {
        at: "15:32",
        tag: "fix",
        what: "Fix committed: deliver to the webhook before replying, up to 3 attempts inside 6 s, and a 502 that tells the visitor to email instead if delivery fails.",
      },
      { at: "15:36", tag: "fix", what: "Deployed. Until a webhook URL is added, the form can still say “sent”." },
      {
        at: "15:45",
        tag: "fix",
        what: "Webhook URL added by hand as a Secret Manager version, so it never appears in the repository or in Terraform state.",
      },
      {
        at: "15:46",
        tag: "resolve",
        what: "A new revision picks up the secret. A test message is delivered at 15:46:31 and one from a browser at 15:51.",
      },
      {
        at: "16 Oct",
        tag: "resolve",
        what: "The last gap closed: on Cloud Run, a missing webhook now gets a 503 and the email fallback, never “sent”.",
      },
    ],
    rootCause: [
      "The success reply did not depend on delivery. The API answered 202 once the message was on local disk, and that disk is not durable: Cloud Run's writable filesystem is in memory, belongs to one instance and disappears with it.",
      "The background send would not have been reliable either. With request-based billing, an instance gets almost no CPU once it has replied, so work left running after the response can stall.",
    ],
    contributing: [
      "Built and tested locally, where the file persists and a developer can read it. The local setup hid the production storage model.",
      "The webhook was optional and its absence was silent: no startup warning, and the only metric counted replies, which were all “accepted”.",
    ],
    detection:
      "Code review, not monitoring. Nothing could have fired: every signal the system had said the form was working.",
    wentWell: [
      "Validation and rate limiting held: all 11 requests in the window were rejected.",
      "The webhook secret never touched the repository or Terraform state.",
      "The fix went from commit to live in 4 minutes, through the normal pipeline.",
    ],
    lucky: "Nobody used the form during the window. That is luck, not design.",
    actions: [
      { what: "Deliver before replying, with retries inside a 6 s budget and an email fallback on failure.", done: true, commit: "ccd58d5" },
      { what: "Keep the webhook URL in Secret Manager; Terraform creates the empty secret and wires it to the service.", done: true, commit: "ccd58d5" },
      { what: "Tests for the contact package: from none to 77% coverage.", done: true, commit: "ccd58d5" },
      { what: "Fail closed on Cloud Run: no webhook means a 503 and the email fallback, never “sent”.", done: true, when: "16 Oct" },
      { what: "Alert when undelivered messages appear. The counter exists (contact_submissions_total, result=\"undelivered\"); nothing pages on it yet.", done: false },
      { what: "A synthetic end-to-end contact check that delivers a marked test message the receiver filters out.", done: false },
    ],
    lesson: "Only say “done” after the durable handoff.",
  },
  {
    slug: "healthz",
    title: "The health check that only worked from inside",
    summary:
      "Cloud Run's front end answers some paths ending in “z” itself, so /healthz returned 404 to every outside check while the app was healthy.",
    date: "1 Oct 2026",
    kind: "Near miss",
    stats: [
      { value: "0", label: "visitors affected: caught before launch" },
      { value: "6 min", label: "from first sight to fix" },
      { value: "404", label: "from the front end; the app never saw the request" },
    ],
    impact:
      "None on the live site: it was caught on a trial deploy, before this site's own service existed. Had it shipped, every deploy's verification would have failed against a healthy revision, and an outside uptime check would have reported the site down permanently. That is the kind of false alarm that teaches people to ignore alerts.",
    timeline: [
      {
        at: "11:15",
        tag: "change",
        what: "First commit. The API serves /healthz and /readyz; the container health check, the CI smoke step and the deploy's verification all call /healthz. All green, because every test talks to the container directly.",
      },
      { at: "11:50", tag: "change", what: "A trial deploy to Cloud Run, before this site had its own project." },
      {
        at: "12:00",
        tag: "detect",
        what: "The trial service is not public yet, so an anonymous request should be refused with 403. /healthz gets 404 instead: something answered before access was even checked.",
      },
      {
        at: "12:00 to 12:06",
        tag: "investigate",
        what: "Cloud Run's documentation: some paths ending in “z” are reserved, and it recommends avoiding all of them.",
      },
      {
        at: "12:06",
        tag: "fix",
        what: "Fix committed: /api/health for every check that goes through the front end. /healthz and /readyz stay for the container probe, which connects directly.",
      },
      { at: "12:10", tag: "resolve", what: "This site's first revision goes live. The first pipeline deploy verifies against /api/health at 12:13 and passes." },
    ],
    rootCause: [
      "Cloud Run reserves some URL paths ending in “z”. Requests for them through the public front end are answered before they reach the container, so the app returns 200 to its own probe and the world gets 404.",
    ],
    contributing: [
      "Every pre-launch test hit the container directly: on localhost, and in CI's container smoke step. Nothing exercised the real front door.",
      "/healthz is the Kubernetes convention, where it is fine. It came along without checking the new platform's rules.",
    ],
    detection:
      "A manual check from outside, on a trial deploy. No automated check would have caught it before launch; after launch it would have looked like the deploy gate failing on healthy revisions.",
    wentWell: [
      "Checking from outside before sharing the link.",
      "Reading the odd status code instead of moving on: a 404 where a 403 was due pointed straight at the front end.",
    ],
    lucky: "It was found by a habit, not by a test designed to find it.",
    actions: [
      { what: "Add /api/health for checks that go through the front end; it also reports not-ready if the knowledge base failed to load.", done: true, commit: "36bdb78" },
      { what: "Run the full smoke test against the live URL after every deploy, so the real front door is tested every time.", done: true, commit: "cfcdeb9" },
      { what: "Leave a comment in the server code on why both health endpoints exist.", done: true, commit: "36bdb78" },
    ],
    lesson: "Test through the same front door your users use.",
  },
  {
    slug: "smoke-test",
    title: "A failing check on a healthy site",
    summary: "The smoke test reported /metrics as broken while Cloud Run's logs showed every /metrics request returning 200.",
    date: "1 Oct 2026",
    kind: "False alarm",
    stats: [
      { value: "43 / 43", label: "requests to /metrics answered 200 during the replay" },
      { value: "0 / 20", label: "replays of the check reproduced the failure" },
      { value: "2", label: "causes: one confirmed, one by construction" },
    ],
    impact:
      "No user impact. The cost was a red check on a healthy revision. Left alone, it would have failed deploys at random, and a gate that fails at random gets ignored or bypassed.",
    timeline: [
      { at: "12:41", tag: "change", what: "A revision serving precompressed pages goes live." },
      {
        at: "12:42:30",
        tag: "detect",
        what: "The smoke test against the live site reports “metrics exposed” as failed. Cloud Run's log for that same request: 200.",
      },
      {
        at: "12:42:40",
        tag: "investigate",
        what: "Replayed for 21 s: 20 runs of the check as written and 20 that read the whole body. None failed, and all 43 requests show 200 in the log.",
      },
      {
        at: "12:43",
        tag: "fix",
        what: "The pipe race is real by construction, so the checks stop using grep -q rather than waiting to catch it again.",
      },
      {
        at: "12:44:01",
        tag: "investigate",
        what: "Three back-to-back runs of the fixed script: the third fails the contact check. The log shows 429 from the rate limiter, not the 400 the check expected.",
      },
      { at: "12:44", tag: "fix", what: "Both fixes committed. CI and the deploy's verification switch to the same script." },
      { at: "12:48", tag: "resolve", what: "The fix's own deploy runs the full smoke test against the new revision and passes." },
    ],
    rootCause: [
      "Most likely: each check piped curl into grep -q under pipefail. grep -q exits at the first match; if curl still has body to write, the write fails and pipefail marks the whole check as failed. The metric it looked for sits partway down a 19 KB response, so grep can finish first. The replay never caught it, so this is the cause by construction, not by reproduction.",
      "Confirmed: the contact check sends bad input and expected a 400. The rate limiter runs first, so after 3 requests in 10 minutes it answers 429.",
    ],
    contributing: [
      "CI's smoke step and the deploy's verify step each had their own copy of the same greps. Fixing the script alone would have left both pipelines flaky.",
    ],
    detection:
      "The check itself, contradicted by Cloud Run's request logs. Trusting the logs over the check is what settled it.",
    wentWell: [
      "The request logs were checked before anyone touched the app.",
      "When the replay came back clean, the race was removed anyway instead of being written off as a one-off.",
      "Re-running back to back, rather than once, surfaced the second cause.",
    ],
    lucky: "It showed up on day one, while the whole pipeline was fresh in mind.",
    actions: [
      { what: "Read the whole response before matching, so a match can never fail the pipe.", done: true, commit: "cfcdeb9" },
      { what: "Count 429 as a rejection in the contact check.", done: true, commit: "cfcdeb9" },
      { what: "One smoke script, run locally, in CI against the container, and after every deploy against the live URL.", done: true, commit: "cfcdeb9" },
    ],
    lesson: "A flaky check is a broken check. Fix it before you trust it, and before you learn to ignore it.",
  },
];
