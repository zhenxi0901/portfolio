"use client";

import { useState } from "react";
import { Copy, PaperPlaneTilt } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { profile } from "@/content/profile";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion/reveal";

const field =
  "w-full rounded-[14px] border border-line-strong bg-surface px-4 py-3 text-[15px] text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-accent-ink";

export function Contact() {
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
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
      await api.contact({ name: data.name, email: data.email, message: data.message, company: data.company ?? "" });
      form.reset();
      toast.success("Message sent", { description: "Thanks. I'll reply from my NTU email." });
    } catch (err) {
      const status = (err as { status?: number }).status;
      toast.error(status === 429 ? "Too many messages" : "Couldn't send right now", {
        description: status === 429 ? "Please wait a minute and try again." : `Email me directly at ${profile.email}.`,
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <section id="contact" className="scroll-mt-20 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-[1320px] gap-14 px-4 pb-40 pt-24 sm:px-8 sm:pt-32 lg:grid-cols-12">
        <Reveal className="lg:col-span-6">
          <h2 className="text-[clamp(2.75rem,7vw,5.5rem)] font-semibold leading-[0.95] tracking-[-0.05em]">
            Hiring for reliability?
          </h2>
          <p className="mt-6 max-w-[40ch] text-lg leading-relaxed text-ink-2">
            I graduate in June 2027 and I&apos;m looking for SRE, cloud, DevOps and AI infrastructure roles.
          </p>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(profile.email);
              toast.success("Email copied", { description: profile.email });
            }}
            className="mt-8 inline-flex items-center gap-2 font-mono text-sm text-ink-2 transition-colors hover:text-ink"
          >
            {profile.email} <Copy size={15} />
          </button>
        </Reveal>

        <Reveal className="lg:col-span-6" delay={0.1}>
          <form onSubmit={onSubmit} noValidate className="grid gap-5">
            {/* Honeypot: people never see it, bots fill it in. */}
            <div aria-hidden className="absolute -left-[9999px]">
              <label>
                Company
                <input name="company" tabIndex={-1} autoComplete="off" />
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
            <Button type="submit" size="lg" disabled={sending} className="w-fit">
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
