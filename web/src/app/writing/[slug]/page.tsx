import { notFound } from "next/navigation";
import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { posts, type Block } from "@/content/writing";
import { ArticleShell, Bullets, Part, StatRow } from "@/components/article/article-shell";
import { ProductTag } from "@/components/site/product-tag";
import { readMinutes } from "@/components/sections/writing";
import { pageMetadata } from "@/lib/page-metadata";

// Static export: only these posts exist; anything else is the 404 page.
export const dynamicParams = false;

export function generateStaticParams() {
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata(props: PageProps<"/writing/[slug]">) {
  const { slug } = await props.params;
  const post = posts.find((p) => p.slug === slug);
  if (!post) return {};
  return pageMetadata({ title: post.title, description: post.summary, path: `/writing/${post.slug}` });
}

function Body({ blocks }: { blocks: Block[] }) {
  return (
    <div className="mt-12">
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "h2":
            return (
              <h2 key={i} className="mt-12 text-2xl font-semibold tracking-[-0.025em]">
                {b.text}
              </h2>
            );
          case "p":
            return (
              <p key={i} className="mt-5 text-[17px] leading-[1.75] text-ink-2">
                {b.text}
              </p>
            );
          case "code":
            return (
              <figure key={i} className="mt-6">
                <pre className="overflow-x-auto rounded-2xl border border-line bg-surface p-4 font-mono text-sm text-ink">
                  <code>{b.text}</code>
                </pre>
                {b.caption && <figcaption className="mt-2 font-mono text-xs text-ink-3">{b.caption}</figcaption>}
              </figure>
            );
          case "list":
            return (
              <div key={i} className="mt-5">
                <Bullets items={b.items} />
              </div>
            );
          case "callout":
            return (
              <p
                key={i}
                className="mt-8 rounded-2xl border-l-4 border-accent-ink bg-[color-mix(in_oklab,var(--accent)_12%,var(--surface))] px-5 py-4 text-lg font-medium leading-snug"
              >
                {b.text}
              </p>
            );
        }
      })}
    </div>
  );
}

export default async function PostPage(props: PageProps<"/writing/[slug]">) {
  const { slug } = await props.params;
  const post = posts.find((p) => p.slug === slug);
  if (!post) notFound();
  const others = posts.filter((p) => p.slug !== post.slug);

  return (
    <ArticleShell back={{ href: "/#writing", label: "All writing" }}>
      <article>
        <p className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2">
          <ProductTag p={post.product} />
          <span className="font-mono text-xs text-ink-3">
            {post.date} · {readMinutes(post)} min read
          </span>
        </p>
        <h1 className="mt-4 text-[clamp(2.25rem,5.5vw,3.75rem)] font-semibold leading-[1.02] tracking-[-0.045em]">{post.title}</h1>
        <p className="mt-6 max-w-[60ch] text-lg leading-relaxed text-ink-2">{post.summary}</p>
        <StatRow stats={post.stats} />
        <Body blocks={post.body} />
      </article>

      <Part title="Go further">
        <ul className="divide-y divide-line rounded-3xl border border-line bg-surface">
          {post.links.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                {...(l.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
                className="group flex items-center justify-between gap-4 p-4 text-[15px] sm:p-5 sm:text-base"
              >
                <span className="text-ink-2 group-hover:text-ink">{l.label}</span>
                <ArrowUpRight size={16} className="shrink-0 text-ink-3 group-hover:text-ink" />
              </a>
            </li>
          ))}
        </ul>
      </Part>

      {others.length > 0 && (
        <nav aria-label="More writing" className="mt-14">
          <h2 className="text-sm font-semibold text-ink-3">More writing</h2>
          <ul className="mt-4 grid gap-3">
            {others.map((o) => (
              <li key={o.slug}>
                <a
                  href={`/writing/${o.slug}`}
                  className="group block rounded-3xl border border-line bg-surface p-5 transition-colors hover:border-ink-3"
                >
                  <span className="font-semibold leading-snug">{o.title}</span>
                  <span className="mt-1 block text-sm text-ink-2">{o.summary}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </ArticleShell>
  );
}
