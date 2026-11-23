import { now } from "@/content/profile";
import { Recently } from "@/components/home/recently";

/**
 * What I am doing now, dated by hand (it is only as true as its date), and beside it what I have done
 * lately, from GitHub and this site's own pipeline. Two columns of type, no box: neither is something
 * to press. Whether the site is up is the map's job above and the ledger's below.
 */
export function Now() {
  return (
    <section id="now" aria-labelledby="now-title" className="mx-auto max-w-[1320px] px-4 sm:px-8">
      <div className="grid gap-12 border-t border-line pt-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2 id="now-title" className="text-sm font-medium text-ink-3">
            Now, as of {now.updated}
          </h2>
          {/* This month's work, a line each; the bio is the hero's and /about's job. */}
          <ul className="mt-3 max-w-[56ch] space-y-3 text-lg leading-relaxed">
            {now.doing.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <Recently />
      </div>
    </section>
  );
}
