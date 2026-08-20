import { readFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(join(root, 'public', 'index.html'), 'utf8');
const workerPath = join(root, 'src', 'index.js');
const worker = await readFile(workerPath, 'utf8');
const sw = await readFile(join(root, 'public', 'sw.js'), 'utf8');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

for (const marker of [
  'MONEYFLOW_THAI_AI_UI_V1',
  'MONEYFLOW_AI_CATEGORY_HOOK_V1',
  'mfAiHubButton',
  '__moneyflowOpenAIHub',
  'getAIProductHub',
  'saveAIProductProfile',
  'saveFamilyMember',
  'saveDebtPlan',
  'saveFreelancerProfile',
  'queueCaptureCandidate',
  'getSmartCategorySuggestion',
  'Family Workspace',
  'Debt & Credit Planner',
  'Freelancer Mode',
  'Auto Capture Inbox',
  "__moneyflowVoiceScope='daily_wallet+salary_only'"
]) {
  if (!html.includes(marker)) throw new Error(`Thai AI UI marker missing: ${marker}`);
}

if (html.includes('MONEYFLOW_VOICE_FINANCE_COMMANDS_V2') || html.includes("rpc('executeVoiceTransfer'")) {
  throw new Error('Broad voice finance commands must remain disabled');
}

for (const marker of [
  'MONEYFLOW_THAI_AI_PLATFORM_V1',
  'MF_AI_PRODUCT_SHEETS',
  'mfSmartAnalytics',
  'mfLearnCategory',
  'mfAnnotateNewTransaction',
  'getAIProductHub:',
  'saveAIProductProfile:',
  'saveFamilyMember:',
  'saveDebtPlan:',
  'saveFreelancerProfile:',
  'getSmartCategorySuggestion:',
  'queueCaptureCandidate:',
  "version: '6.2-cloudflare.7'",
  'microphone=(self)'
]) {
  if (!worker.includes(marker)) throw new Error(`Thai AI Worker marker missing: ${marker}`);
}

if (worker.includes('executeVoiceTransfer') || worker.includes('MONEYFLOW_VOICE_TRANSFER_ADAPTER_V1')) {
  throw new Error('Voice transfer adapter returned unexpectedly');
}
if (!sw.includes('moneyflow-shell-v8')) throw new Error('PWA cache must be v8 for Thai AI platform');

const build = String(pkg.scripts && pkg.scripts['build:generated'] || '');
for (const file of ['thai-ai-platform-worker-safe.mjs','thai-ai-product-ui.mjs','ai-platform-test.mjs']) {
  if (!build.includes(file)) throw new Error(`Build pipeline missing ${file}`);
  await access(join(root, 'scripts', file));
}
if (build.indexOf('production-test.mjs') > build.indexOf('thai-ai-platform-worker-safe.mjs')) {
  throw new Error('Legacy production test should run before Thai AI assembly');
}
if (build.indexOf('ai-platform-test.mjs') < build.indexOf('thai-ai-product-ui.mjs')) {
  throw new Error('Thai AI platform test must run last');
}

const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]).filter(Boolean);
for (let i = 0; i < scripts.length; i++) {
  try { new vm.Script(scripts[i], { filename: `ai-inline-${i}.js` }); }
  catch (error) { throw new Error(`Thai AI inline script ${i} syntax error: ${error.message}`); }
}

for (const path of [workerPath, join(root,'scripts','thai-ai-platform-worker-safe.mjs'), join(root,'scripts','thai-ai-product-ui.mjs')]) {
  const checked = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
  if (checked.status !== 0) throw new Error(`Node syntax check failed for ${path}: ${checked.stderr || checked.stdout}`);
}

console.log('Thai AI Personal Finance platform checks passed');
