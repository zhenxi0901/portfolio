/** Where the site is served. */
export const BASE_URL = process.env.BASE_URL ?? "http://localhost:8080";

/** Where the stand-in webhook lists the messages it received; unset when there is none to ask. */
export const HOOK_URL = process.env.HOOK_URL;
