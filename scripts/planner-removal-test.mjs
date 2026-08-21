import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(join(root, 'public', 'index.html'), 'utf8');
const workerPath = join(root, 'src', 'index.js');
const worker = await readFile(workerPath, 'utf8');
const sw = await readFile(join(root, 'public', 'sw.js'), 'utf8');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

const forbidden = [
  'MONEYFLOW_THAI_AI_UI_V1',
  'MONEYFLOW_THAI_AI_PLATFORM_V1',
  'MONEYFLOW_FREE_SMART_FINANCE_V1',
  'mfAiHubButton',
  'getAIProductHub',
  'saveAIProductProfile',
  'saveFamilyMember',
  'saveDebtPlan',
  'saveFreelancerProfile',
  'queueCaptureCandidate',
  'Family Workspace',
  'Debt & Credit Planner',
  'Freelancer Mode',
  'แผนการเงิน'
];
for (const marker of forbidden) {
  if (html.includes(marker) || worker.includes(marker)) throw new Error(`Planner feature unexpectedly active: ${marker}`);
}

for (const marker of [
  'MONEYFLOW_VOICE_ENTRY_V1',
  "__moneyflowVoiceScope='daily_wallet+salary_only'",
  'MONEYFLOW_LATEST_FIRST_V1',
  'MONEYFLOW_SWIPE_DELETE_V1',
  'MONEYFLOW_SWIPE_RUNTIME_SAFE_V1',
  'MONEYFLOW_HELP_V1'
]) {
  if (!html.includes(marker)) throw new Error(`Core mobile feature missing after planner removal: ${marker}`);
}

if (!sw.includes('moneyflow-shell-v10')) throw new Error('PWA cache must be v10 after planner removal');
if (!worker.includes("version: '6.2-cloudflare.9'")) throw new Error('Worker version must be 6.2-cloudflare.9 after planner removal');

const build = String(pkg.scripts && pkg.scripts['build:generated'] || '');
for (const removed of [
  'thai-ai-platform-worker-safe.mjs',
  'free-product-backend.mjs',
  'thai-ai-product-ui.mjs',
  'ai-platform-test.mjs',
  'free-smart-finance.mjs',
  'free-smart-finance-test.mjs'
]) {
  if (build.includes(removed)) throw new Error(`Removed planner script still in build pipeline: ${removed}`);
}
for (const required of ['remove-finance-planner.mjs','planner-removal-test.mjs']) {
  if (!build.includes(required)) throw new Error(`Planner removal guard missing from build pipeline: ${required}`);
}

const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]).filter(Boolean);
for (let i = 0; i < scripts.length; i++) {
  try { new vm.Script(scripts[i], { filename: `planner-free-inline-${i}.js` }); }
  catch (error) { throw new Error(`Inline script ${i} syntax error after planner removal: ${error.message}`); }
}

const syntax = spawnSync(process.execPath, ['--check', workerPath], { encoding: 'utf8' });
if (syntax.status !== 0) throw new Error(`Worker syntax error after planner removal: ${syntax.stderr || syntax.stdout}`);

console.log('Planner-free MoneyFlow checks passed: core mobile finance only');
