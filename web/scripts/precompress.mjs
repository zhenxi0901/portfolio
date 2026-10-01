// Writes .br and .gz copies of the static export's text files, so the Go server can send
// them compressed without spending CPU on every request. Runs after `next build`.
// The extension list matches contentTypes in api/internal/server/static.go.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const OUT = fileURLToPath(new URL("../out/", import.meta.url));
const TEXT = new Set([".html", ".js", ".css", ".json", ".txt", ".svg", ".xml"]);
const MIN_BYTES = 1024; // below this, headers outweigh the saving

const kb = (n) => `${Math.round(n / 1024)} KB`;
let files = 0;
let raw = 0;
let brotli = 0;

for (const entry of await readdir(OUT, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !TEXT.has(extname(entry.name))) continue;
  const file = join(entry.parentPath, entry.name);
  const body = await readFile(file);
  if (body.length < MIN_BYTES) continue;

  const br = brotliCompressSync(body, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
      [constants.BROTLI_PARAM_SIZE_HINT]: body.length,
    },
  });
  const gz = gzipSync(body, { level: 9 });
  // Keep a variant only when it saves at least 10%; otherwise the original is fine.
  if (br.length < body.length * 0.9) await writeFile(`${file}.br`, br);
  if (gz.length < body.length * 0.9) await writeFile(`${file}.gz`, gz);

  files++;
  raw += body.length;
  brotli += Math.min(br.length, body.length);
}

console.log(`precompressed ${files} files: ${kb(raw)} -> ${kb(brotli)} with brotli`);
