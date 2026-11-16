import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { posts, type Post } from "@/content/writing";
import { SectionHeading } from "@/components/site/section-heading";
import { ProductTag } from "@/components/site/product-tag";
import { Reveal } from "@/components/motion/reveal";

/** Minutes to read at about 220 words a minute. */
export function readMinutes(post: Post) {
  const words = post.body
    .flatMap((b) => (b.kind === "list" ? b.items : [b.text]))
    .join(" ")
    .split(/\s+/).length;
  return Math.max(1, Math.round(words / 220));
}

/** `chapter`: the section opens /writing, so its heading is the page's h1. */
export function Writing({ chapter = false }: { chapter?: boolean } = {}) {
  // Straight under the page's h1 on /writing, a post's title is an h2; under the section's h2 elsewhere, an h3.
  const Title = chapter ? "h2" : "h3";
  return (
    <section id="writing" className="mx-auto max-w-[1320px] scroll-mt-20 px-4 py-24 sm:px-8 sm:py-32">
      <SectionHeading
        as={chapter ? "h1" : "h2"}
        title="Writing"
        lead="Longer notes on what the measurements showed. The numbers are the same ones the rest of this site uses."
      />
      <ul className="mt-12 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {posts.map((post, i) => (
          <Reveal key={post.slug} as="li" delay={i * 0.06} className="h-full">
            <a
              href={`/writing/${post.slug}`}
              className="group flex h-full flex-col rounded-3xl border border-line bg-surface p-6 transition-colors hover:border-ink-3 sm:p-7"
            >
              <p className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <ProductTag p={post.product} />
                <span className="text-xs text-ink-3">
                  {post.date} · {readMinutes(post)} min read
                </span>
              </p>
              <Title className="mt-4 text-[1.6rem] font-semibold leading-tight tracking-[-0.02em]">{post.title}</Title>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{post.summary}</p>
              <span className="mt-auto inline-flex items-center gap-1 pt-6 text-sm font-medium text-ink-2 group-hover:text-ink">
                Read it <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </a>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
