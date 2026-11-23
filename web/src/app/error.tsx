"use client";

import { useEffect } from "react";

/**
 * A page whose code failed after it loaded. The top bar and footer are part of the page, so they are gone
 * too: say what happened, and offer the ways on that do not rely on the code that broke.
 */
export default function PageError({ error }: { error: unknown }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const link = "font-medium text-ink underline decoration-line-strong decoration-2 underline-offset-[5px] hover:decoration-ink";
  return (
    <main id="main" className="mx-auto max-w-[880px] px-4 pb-24 pt-28 sm:px-8 sm:pt-36">
      <h1 className="max-w-[18ch] text-[clamp(2.25rem,4.6vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.028em]">This page broke in your browser</h1>
      <p className="mt-6 max-w-[58ch] text-lg leading-relaxed text-ink-2" role="status">
        Its code failed after it had loaded. The server may be fine; the status page says whether it is, and reloading usually gets the page back.
      </p>
      <p className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-[15px]">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md bg-accent px-5 py-3 font-medium text-on-accent transition-opacity hover:opacity-85"
        >
          Reload the page
        </button>
        <a href="/status" className={link}>
          Status
        </a>
        <a href="/" className={link}>
          Home
        </a>
      </p>
    </main>
  );
}
