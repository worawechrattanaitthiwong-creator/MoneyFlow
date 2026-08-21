import { readFile, readdir, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function cleanBase64(text) {
  return String(text || '')
    .replace(/^\uFEFF/, '')
    .replace(/[^A-Za-z0-9+/=]/g, '');
}

async function normalizeFolder(folder) {
  const dir = join(root, 'source-bundles', folder);
  const names = (await readdir(dir)).filter(name => name.endsWith('.b64')).sort();
  if (!names.length) throw new Error(`[source-bundles/${folder}] no .b64 chunks found`);

  const pieces = [];
  const diagnostics = [];
  for (const name of names) {
    const raw = await readFile(join(dir, name), 'utf8');
    const clean = cleanBase64(raw);
    pieces.push(clean);
    diagnostics.push(`${name}:${raw.length}->${clean.length}`);
  }

  const base64 = pieces.join('');
  if (!base64.length) throw new Error(`[source-bundles/${folder}] bundle is empty`);
  if (base64.length % 4 !== 0) {
    throw new Error(`[source-bundles/${folder}] invalid Base64 length ${base64.length}; chunks ${diagnostics.join(', ')}`);
  }

  const firstPadding = base64.indexOf('=');
  if (firstPadding >= 0 && firstPadding < base64.length - 2) {
    throw new Error(`[source-bundles/${folder}] Base64 padding appears before the end at char ${firstPadding}`);
  }

  const compressed = Buffer.from(base64, 'base64');
  const header = compressed.subarray(0, 4).toString('hex');
  if (compressed.length < 18 || compressed[0] !== 0x1f || compressed[1] !== 0x8b) {
    throw new Error(`[source-bundles/${folder}] invalid gzip header ${header}; encoded=${base64.length}, decoded=${compressed.length}`);
  }

  let source;
  try {
    source = gunzipSync(compressed).toString('utf8');
  } catch (error) {
    const code = error && error.code ? error.code : 'UNKNOWN';
    const message = error && error.message ? error.message : String(error);
    throw new Error(`[source-bundles/${folder}] gzip validation failed (${code}: ${message}); encoded=${base64.length}, decoded=${compressed.length}, header=${header}; chunks ${diagnostics.join(', ')}`);
  }

  if (source.length < 1000) {
    throw new Error(`[source-bundles/${folder}] decompressed source is unexpectedly small (${source.length} chars)`);
  }

  // Canonicalize only inside the build workspace. Keeping one clean Base64 stream avoids
  // differences in newline/BOM handling between local builds, Bun installs and Cloudflare.
  await writeFile(join(dir, names[0]), base64, 'utf8');
  for (const name of names.slice(1)) await writeFile(join(dir, name), '', 'utf8');

  console.log(`[source-bundles/${folder}] OK: ${names.length} chunks, ${base64.length} base64 chars, ${compressed.length} gzip bytes, ${source.length} source chars`);
}

await normalizeFolder('code');
await normalizeFolder('index');
console.log('Source bundles normalized and validated for generated build');
