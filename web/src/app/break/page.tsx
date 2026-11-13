import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { ArticleShell, Part } from "@/components/article/article-shell";
import { Lab } from "@/components/lab/lab";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Break it yourself: fault injection on a live server",
  description:
    "Pick what goes wrong on this site's server and how the client copes, then send real requests and watch retries, a circuit breaker and hedging handle them.",
  path: "/break",
});

const REPO = "https://github.com/zhenxi0901/portfolio";
const ext = "inline-flex items-center gap-0.5 underline underline-offset-4 hover:text-ink";

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={ext}>
      {children}
      <ArrowUpRight size={12} aria-hidden />
    </a>
  );
}

export default function BreakPage() {
  return (
    <ArticleShell back={{ href: "/", label: "Home" }} wide>
      <p className="mt-8 font-mono text-xs text-ink-3">Fault injection · real requests to the Go server on Cloud Run</p>
      <h1 id="break" className="mt-4 scroll-mt-28 text-[clamp(2.5rem,6vw,4.25rem)] font-semibold leading-[1] tracking-[-0.045em]">
        Break it yourself.
      </h1>
      <p className="mt-6 max-w-[64ch] text-lg leading-relaxed text-ink-2">
        Choose what goes wrong on the server and how the client copes, then send real requests and watch every attempt come back. The faults land
        on your requests only: the site&apos;s SLO is measured from outside, on another endpoint, so nothing here can hurt it.
      </p>

      <Lab />

      <Part title="How it works">
        <div className="max-w-[72ch] space-y-4 text-[15px] leading-relaxed text-ink-2">
          <p>
            <strong className="font-medium text-ink">The server</strong> answers <code className="font-mono text-sm">/api/lab/echo</code>, holding
            or failing each request with the odds you chose. It has limits of its own: at most 60% errors, 1.5 s holds, 24 requests held at once on
            an instance (8 of them per visitor), and 240 requests a minute from one visitor. They bound what a page like this can cost and what it can take from the rest
            of the site: a held request keeps an instance billed while it waits. Lab requests stay out of the live latency on{" "}
            <a href="/status" className="underline underline-offset-4 hover:text-ink">
              the status page
            </a>
            , and the server logs the 503s it injected at debug level rather than as errors (Cloud Run&apos;s own request log still lists them,
            as it lists every request). They are real 503s, so your browser&apos;s developer console shows them as failed requests. <Ext href={`${REPO}/tree/main/api/internal/lab`}>The server code</Ext>
          </p>
          <p>
            <strong className="font-medium text-ink">The client</strong> runs in your browser: a new request every 200 ms whatever happened to the
            ones before, the way visitors keep arriving at a struggling service, and a 1 s timeout per attempt. Compare all four meets every
            strategy with the same faults, request by request, so what differs is the strategy, not luck.{" "}
            <Ext href={`${REPO}/blob/main/web/src/lib/resilience.ts`}>The strategies fit on one screen</Ext>.
          </p>
          <p>
            <strong className="font-medium text-ink">Why these four.</strong> Retries hide errors but multiply load, which is why they wait a
            random, growing time between attempts:{" "}
            <Ext href="https://builder.aws.com/content/3EumjoZascWd1oZiEgL8ORlv3qE/timeouts-retries-and-backoff-with-jitter">Timeouts, retries and backoff with jitter</Ext>
            . A circuit breaker stops a struggling service from being hammered by its own clients:{" "}
            <Ext href="https://martinfowler.com/bliki/CircuitBreaker.html">CircuitBreaker</Ext>. Hedging trades a few extra requests for a shorter
            tail: <Ext href="https://research.google/pubs/the-tail-at-scale/">The Tail at Scale</Ext>.
          </p>
          <p>
            For a whole incident rather than a single request, <a href="/oncall" className="underline underline-offset-4 hover:text-ink">go on call</a>.
          </p>
        </div>
      </Part>
    </ArticleShell>
  );
}
