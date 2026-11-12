import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Internal links are plain <a>: a full load of a static file, like goTo() in lib/utils.ts. A
    // next/link prefetch asks this static export for segment files by names it does not write
    // (/writing/__next.writing.__PAGE__.txt for writing/__next.writing/__PAGE__.txt) and gets 404s.
    rules: {
      "@next/next/no-html-link-for-pages": "off",
      "no-restricted-imports": [
        "error",
        { paths: [{ name: "next/link", message: "Use a plain <a>: next/link prefetches files this static export names differently, and they 404." }] },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
