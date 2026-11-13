# Break-fix drill 01: green checks, failing users

You're on call for this site. Scripts and agents that call its Ask API (`/api/ask`) say it sometimes answers with an error, though visitors to the site haven't noticed a thing. The uptime checks, which are what the site's SLO is measured by, are all green.

Find out why, and fix it.

This branch is the portfolio's real Go server with one bug planted in it. Nothing is simulated: the server, its logs, its metrics and the tests are the ones that run in production.

## Start

```sh
make drill
```

That builds the server, starts it on port 8080 with the site's real knowledge base, and sends it the kind of traffic it gets: uptime checks, status polls, and questions from many visitors. Every two seconds you get what those visitors saw. Press Ctrl+C to stop the traffic; the server keeps running.

## Investigate

Everything an on-call engineer would have:

| | |
|---|---|
| The server's log | `tail -f /tmp/drill-server.log` |
| Its metrics | `curl -s localhost:8080/metrics \| grep http_requests_total` |
| Its own view of itself | `curl -s localhost:8080/api/status` |
| One question, by hand | `curl -s localhost:8080/api/ask -H 'Content-Type: application/json' -d '{"question":"how did you cut the cloud bill"}'` |
| The code | `api/`, the Go module (`api/internal/ask` answers questions) |

## Fix and check

```sh
make check
```

That runs the tests, restarts the server with your change, and asks 36 questions of every length. It passes when every one gets a 200 with a real answer and the server doesn't panic once. `make stop` stops the server.

## The one rule

Don't compare this branch with `main`, and don't read its history: the bug is the only difference from `main` in the server code, so that comparison is the answer key. Everything else is fair.

## Hints

<details>
<summary>Hint 1: who is affected?</summary>

Health and status checks never fail; only some questions do. Ask the traffic's questions yourself, one by one. What do the failing ones have in common?
</details>

<details>
<summary>Hint 2: an error with no message</summary>

A Go server that answers 500 without having written an error itself has usually panicked. This one's recovery middleware logs every panic at level ERROR with its value: look for `"msg":"panic"` in the log, and read what the value says.
</details>

<details>
<summary>Hint 3: where</summary>

The value says an index was out of range on an empty slice, on the way to answering a question. Follow `/api/ask` from `api/internal/ask/service.go` into `retrieval.go`, and look for an index that assumes there is at least one of something.
</details>

## Afterwards: the postmortem

Before you close it, answer the questions a blameless postmortem would:

- Why did the uptime checks stay green the whole time? (What do they call, and what does that code path not touch?)
- Why did visitors to the site never notice? Look at what the Ask console does when the API fails (`web/src/components/sections/ask.tsx`), and decide whether that is a feature or a blind spot.
- What test would have caught this before it shipped? Write it.
- What alert would have caught it in production, before a user reported it?

The site has [a postmortem about the same blind spot](https://portfolio-emsghin2iq-as.a.run.app/postmortems/healthz): a health check that only proved one path worked.
