import { notFound } from "next/navigation";
import { ArrowRight, ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { posts, type Block } from "@/content/writing";
import { ArticleShell, Part } from "@/components/article/article-shell";
import { serif } from "@/components/article/serif";
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
  return pageMetadata({ title: post.title, description: post.description ?? post.summary, path: `/writing/${post.slug}`, markdown: `writing/${post.slug}.md` });
}

/**
 * A post's text is set for reading: a serif at about 19 px, at most 68 characters a line (it ran to 110),
 * with the headings in the site's sans so the structure still reads at a glance.
 */
function Body({ blocks }: { blocks: Block[] }) {
  return (
    <div className="mt-12 max-w-[68ch]">
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "h2":
            return (
              <h2 key={i} className="mt-14 text-2xl font-semibold tracking-[-0.02em]">
                {b.text}
              </h2>
            );
          case "p":
            return (
              <p key={i} className="mt-6 font-serif text-[1.1875rem] leading-[1.7] text-ink">
                {b.text}
              </p>
            );
          case "code":
            return (
              <figure key={i} className="mt-6">
                <pre tabIndex={0} role="region" aria-label={b.caption ? `Code: ${b.caption}` : "Code"} className="overflow-x-auto rounded-2xl border border-line bg-surface p-4 font-mono text-sm text-ink">
                  <code>{b.text}</code>
                </pre>
                {b.caption && <figcaption className="mt-2 text-sm text-ink-3">{b.caption}</figcaption>}
              </figure>
            );
          case "list":
            return (
              <ul key={i} className="mt-6 list-disc space-y-2 pl-6 font-serif text-[1.1875rem] leading-[1.7] text-ink marker:text-ink-3">
                {b.items.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            );
          case "callout":
            // The one line to take away, set as a pull quote rather than a tinted box.
            return (
              <p key={i} className="my-10 border-l-2 border-ink pl-5 font-serif text-[1.375rem] italic leading-[1.5] text-ink">
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
    <ArticleShell back={{ href: "/writing", label: "All writing" }} className={serif.variable}>
      <article>
        <h1 className="mt-10 max-w-[22ch] font-serif text-[clamp(2.25rem,4.8vw,3.5rem)] font-semibold leading-[1.08] tracking-[-0.012em]">
          {post.title}
        </h1>
        <p className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-3">
          <span>{post.date}</span>
          <span>{readMinutes(post)} min read</span>
          <ProductTag p={post.product} />
        </p>
        {/* The lede carries the numbers (the boxed trio of them that used to sit here repeated it). */}
        <p className="mt-8 max-w-[60ch] font-serif text-[1.3125rem] leading-[1.55] text-ink-2">{post.summary}</p>
        <Body blocks={post.body} />
      </article>

      <Part title="Go further">
        <ul className="divide-y divide-line border-y border-line">
          {post.links.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                {...(l.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
                className="group flex items-center justify-between gap-4 py-4 text-[15px] sm:text-base"
              >
                <span className="text-ink-2 group-hover:text-ink">{l.label}</span>
                {l.href.startsWith("http") ? (
                  <ArrowUpRight size={16} className="shrink-0 text-ink-3 group-hover:text-ink" />
                ) : (
                  <ArrowRight size={16} className="shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
                )}
              </a>
            </li>
          ))}
        </ul>
      </Part>

      {others.length > 0 && (
        <nav aria-label="More writing" className="mt-14">
          <h2 className="text-sm font-semibold text-ink-3">More writing</h2>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {others.map((o) => (
              <li key={o.slug}>
                <a href={`/writing/${o.slug}`} className="group block py-5">
                  <span className="font-semibold leading-snug group-hover:underline group-hover:underline-offset-4">{o.title}</span>
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
