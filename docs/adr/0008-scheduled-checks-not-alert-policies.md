<!-- Generated from web/src/content/decisions.ts by web/scripts/gen-adr.mts. Edit that file, not this one. -->

# 8. Page with scheduled checks, not Cloud Monitoring alert policies

- Status: Accepted
- Date: 2026-10-19

## Context

The contact-form postmortem left two actions open: alert when a message goes undelivered, and check the path end to end.

Cloud Monitoring alert policies are billed per condition, and the project's budget is S$1 a month.

## Decision

A GitHub Actions schedule searches Cloud Run's logs every hour for undelivered messages, as a read-only identity, and twice a day sends a message marked by a secret token through the live form and the real webhook, posted silently. A failed check fails the workflow, and GitHub emails me.

## Consequences

What it buys:

- Free, versioned with the code, and it tests the real path rather than a proxy for it.

What it costs:

- Up to an hour between a failure and the email, and email is not a pager.
- GitHub turns off schedules in a public repository after 60 days without activity.

## Evidence

- [.github/workflows/synthetic.yml](../../.github/workflows/synthetic.yml)
- [infra/watch.tf](../../infra/watch.tf)
