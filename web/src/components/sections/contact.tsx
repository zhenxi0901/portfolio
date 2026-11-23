"use client";

import { useState } from "react";
import { ArrowUpRight, Copy, PaperPlaneTilt } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api, API_BASE } from "@/lib/api";
import { profile } from "@/content/profile";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion/reveal";

// 16 px on a phone: iOS zooms the page into any field set smaller.
const field =
  "w-full rounded-md border border-line-strong bg-surface px-4 py-3 text-base text-ink sm:text-[15px] outline-none transition-colors placeholder:text-ink-3 focus:border-accent-ink";

export function Contact() {
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (sending) return;
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form)) as Record<string, string>;
    const next: Record<string, string> = {};
    if (!data.name?.trim()) next.name = "Tell me who you are.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email ?? "")) next.email = "That email doesn't look right.";
    if ((data.message ?? "").trim().length < 10) next.message = "A little more detail, please (10 characters or more).";
    setErrors(next);
    if (Object.keys(next).length) return;

    setSending(true);
    try {
      await api.contact({ name: data.name, email: data.email, message: data.message, leave_empty: data.leave_empty ?? "" });
      form.reset();
      toast.success("Message sent", { description: "Thanks. I'll reply from my NTU email." });
    } catch (err) {
      const status = (err as { status?: number }).status;
      toast.error(status === 429 ? "Too many messages" : "Couldn't send right now", {
        description: status === 429 ? `Please wait a few minutes, or email me directly at ${profile.email}.` : `Email me directly at ${profile.email}.`,
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <section id="contact" className="-scroll-mt-14 sm:-scroll-mt-22 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-[1320px] gap-14 px-4 pb-40 pt-24 sm:px-8 sm:pt-32 lg:grid-cols-12">
        <Reveal className="lg:col-span-6">
          <h2 className="text-[clamp(1.75rem,3.4vw,2.625rem)] font-semibold leading-[1.12] tracking-[-0.022em]">Get in touch</h2>
          <p className="mt-4 max-w-[44ch] text-lg leading-relaxed text-ink-2">
            I graduate in June 2027 and I&apos;m looking for SRE, DevOps, cloud and AI-infrastructure roles. Write to me about a role, or
            about anything on this site you would have done differently.
          </p>
          <ul className="mt-8 space-y-2.5 text-sm text-ink-2">
            <li className="flex items-center gap-1">
              <a href={`mailto:${profile.email}`} className="font-mono underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink">
                {profile.email}
              </a>
              <button
                type="button"
                aria-label="Copy the email address"
                title="Copy"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(profile.email);
                    toast.success("Email copied", { description: profile.email });
                  } catch {
                    // Refused (permissions, an embedded browser): the address is on the screen, so say so.
                    toast.error("Couldn't copy it", { description: `Copy it by hand: ${profile.email}` });
                  }
                }}
                className="inline-flex size-9 items-center justify-center rounded-md transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <Copy size={15} />
              </button>
            </li>
            <li>
              <a
                href={profile.linkedin}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink"
              >
                LinkedIn
                <ArrowUpRight size={13} aria-hidden />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
          </ul>
        </Reveal>

        <Reveal className="lg:col-span-6" delay={0.1}>
          {/* method and action: without this page's script the browser sends the form itself, and the server
              answers with a page. Left out, it would put the message in the address bar. */}
          <form onSubmit={onSubmit} method="post" action={`${API_BASE}/api/contact`} noValidate className="grid gap-5">
            {/* For bots, which fill every field. People never see it. It is not called "company" or anything
                else a browser knows how to fill in, and a message that has it filled in is delivered all the
                same, marked (contact.go). */}
            <div aria-hidden className="absolute -left-[9999px]">
              <label>
                Leave this empty
                <input name="leave_empty" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
            <Field id="name" label="Name" error={errors.name}>
              <input id="name" name="name" autoComplete="name" className={field} aria-invalid={!!errors.name} />
            </Field>
            <Field id="email" label="Email" error={errors.email}>
              <input id="email" name="email" type="email" autoComplete="email" className={field} aria-invalid={!!errors.email} />
            </Field>
            <Field id="message" label="Message" error={errors.message} hint="The role, the team, and how to reach you.">
              <textarea id="message" name="message" rows={5} maxLength={4000} className={field + " resize-y"} aria-invalid={!!errors.message} />
            </Field>
            <Button type="submit" size="lg" aria-disabled={sending || undefined} className="w-fit">
              <PaperPlaneTilt weight="fill" /> {sending ? "Sending..." : "Send message"}
            </Button>
          </form>
        </Reveal>
      </div>
    </section>
  );
}

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-sm text-critical" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}
