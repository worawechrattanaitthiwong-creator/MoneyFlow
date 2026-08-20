import { readFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(join(root, 'public', 'index.html'), 'utf8');
const core = await readFile(join(root, 'src', 'legacy-core.js'), 'utf8');
const worker = await readFile(join(root, 'src', 'index.js'), 'utf8');
const store = await readFile(join(root, 'src', 'store.js'), 'utf8');
const sw = await readFile(join(root, 'public', 'sw.js'), 'utf8');

const requiredHtml = [
  'MONEYFLOW_PRODUCTION_POLISH_V1',
  'MONEYFLOW_RUNTIME_FIX_V1',
  'MONEYFLOW_PIN_INSTANT_V1',
  'MONEYFLOW_HELP_V1',
  'MONEYFLOW_VOICE_ENTRY_V1',
  'MONEYFLOW_LATEST_FIRST_V1',
  'MONEYFLOW_SWIPE_DELETE_V1',
  '__moneyflowRpcTransport',
  '__moneyflowFlushQueue',
  '__moneyflowSortTransactionsLatest',
  'mfAccountingHealth',
  'MF_PENDING_DETAIL_ID',
  'mfUndoBar',
  'mf-sync-pill',
  'mfInfoOverlay',
  'openMoneyFlowInfo',
  'dashboard.networth',
  'budget.item',
  'goals.item',
  'report.networth',
  'mfVoiceButton',
  '__moneyflowParseVoiceText',
  'webkitSpeechRecognition',
  'mfSwipeDeleteHint',
  'SWIPE_THRESHOLD=84',
  'requestAnimationFrame(()=>window.removeTransaction(current.id))',
  '.deleteTransaction(TOKEN,id)',
  'กดค้างเพื่อพูด',
  'ปล่อยเพื่อลบ',
  'แตะเพื่อดูยอด'
];
for (const marker of requiredHtml) {
  if (!html.includes(marker)) throw new Error(`production polish marker missing: ${marker}`);
}
if (html.lastIndexOf('MONEYFLOW_SWIPE_DELETE_V1') < html.lastIndexOf('MONEYFLOW_PRODUCTION_POLISH_V1')) {
  throw new Error('swipe delete runtime must load after legacy undo-delete runtime');
}
for (const marker of ['MONEYFLOW_ACCOUNTING_HEALTH_V1', 'getAccountingHealth']) {
  if (!core.includes(marker)) throw new Error(`accounting health marker missing: ${marker}`);
}
for (const marker of ["version: '6.2-cloudflare.4'", 'getAccountingHealth:']) {
  if (!worker.includes(marker)) throw new Error(`worker production marker missing: ${marker}`);
}
for (const marker of ['ensureOptimizationSchema', 'mf_transactions_native', 'idx_mf_rows_sheet_user_date']) {
  if (!store.includes(marker)) throw new Error(`D1 optimization marker missing: ${marker}`);
}
if (!sw.includes('moneyflow-shell-v4')) throw new Error('PWA cache version was not bumped for swipe-delete UI');

for (const file of ['manifest.webmanifest', 'sw.js', 'offline.html', 'icons/icon-192.png', 'icons/icon-512.png']) {
  await access(join(root, 'public', file));
}

const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]).filter(Boolean);
for (let i = 0; i < scripts.length; i++) {
  try { new vm.Script(scripts[i], { filename: `inline-${i}.js` }); }
  catch (error) { throw new Error(`inline script ${i} syntax error: ${error.message}`); }
}

console.log('Production polish checks passed');
