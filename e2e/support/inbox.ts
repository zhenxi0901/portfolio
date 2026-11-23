import { HOOK_URL } from "./env.ts";

/** Why the tests of what arrives are skipped, when they are. */
export const NO_INBOX = "HOOK_URL is not set, so there is no stand-in webhook to ask what arrived";

/** The text of every message the webhook behind the contact form has received. */
export async function received(): Promise<string[]> {
  const response = await fetch(HOOK_URL!);
  const bodies = (await response.json()) as string[];
  return bodies.map((body) => (JSON.parse(body) as { text: string }).text);
}
