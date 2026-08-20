import { readFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(join(root, 'public', 'index.html'), 'utf8');
const worker = await readFile(join(root, 'src', 'index.js'), 'utf8');
const store = await readFile(join(root, 'src', 'store.js'), 'utf8');

const requiredHtml = [
  'MONEYFLOW_PRODUCTION_POLISH_V1',
  '__moneyflowRpcTransport',
  'mfAccountingHealth',
  'MF_PENDING_DETAIL_ID',
  'mfUndoBar',
  'mf-sync-pill'
];
for (const marker of requiredHtml) {
  if (!html.includes(marker)) throw new Error(`production polish marker missing: ${marker}`);
}
for (const marker of ['getAccountingHealth', "version: '6.2-cloudflare.4'"]) {
  if (!worker.includes(marker)) throw new Error(`worker production marker missing: ${marker}`);
}
for (const marker of ['ensureOptimizationSchema', 'mf_transactions_native', 'idx_mf_rows_sheet_user_date']) {
  if (!store.includes(marker)) throw new Error(`D1 optimization marker missing: ${marker}`);
}

for (const file of ['manifest.webmanifest', 'sw.js', 'offline.html', 'icons/icon-192.png', 'icons/icon-512.png']) {
  await access(join(root, 'public', file));
}

const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]).filter(Boolean);
for (let i = 0; i < scripts.length; i++) {
  try { new vm.Script(scripts[i], { filename: `inline-${i}.js` }); }
  catch (error) { throw new Error(`inline script ${i} syntax error: ${error.message}`); }
}

console.log('Production polish checks passed');
