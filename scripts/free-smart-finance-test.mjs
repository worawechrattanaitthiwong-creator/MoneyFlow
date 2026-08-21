import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(join(root, 'public', 'index.html'), 'utf8');
const worker = await readFile(join(root, 'src', 'index.js'), 'utf8');
const sw = await readFile(join(root, 'public', 'sw.js'), 'utf8');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

for (const marker of [
  'MONEYFLOW_FREE_SMART_FINANCE_V1',
  "__moneyflowSmartFinanceCostMode='free_rule_based'",
  'MoneyFlow Smart Finance',
  'แผนการเงิน',
  'SMART PERSONAL FINANCE · ฟรี',
  'Family Workspace',
  'Debt & Credit Planner',
  'Freelancer Mode',
  'Capture Inbox (วางข้อความเอง)',
  'ไม่มีค่าบริการ API เพิ่ม',
  "['personal','family','freelancer']"
]) {
  if (!html.includes(marker)) throw new Error(`free smart finance marker missing: ${marker}`);
}

for (const forbidden of [
  'THAI AI PERSONAL FINANCE',
  '>Pro<',
  "['personal','pro','family','freelancer']",
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY'
]) {
  if (html.includes(forbidden) || worker.includes(forbidden)) throw new Error(`paid/external AI marker must not be active: ${forbidden}`);
}

const deps = Object.keys({...pkg.dependencies, ...pkg.devDependencies}).map(x => x.toLowerCase());
if (deps.some(x => /openai|anthropic|gemini|generative-ai|langchain/.test(x))) {
  throw new Error('external AI dependency found in package.json');
}

if (!worker.includes("version: '6.2-cloudflare.8'")) throw new Error('Worker version must be 6.2-cloudflare.8');
if (!sw.includes('moneyflow-shell-v9')) throw new Error('PWA cache must be v9');

for (const feature of ['mfSmartAnalytics','mfLearnCategory','mfFamilyMembers','mfDebtSummary','mfFreelancerAnalytics','mfCaptureInbox']) {
  if (!worker.includes(feature)) throw new Error(`free feature backend missing: ${feature}`);
}

const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]).filter(Boolean);
for (let i = 0; i < scripts.length; i++) {
  try { new vm.Script(scripts[i], { filename: `free-smart-inline-${i}.js` }); }
  catch (error) { throw new Error(`inline script ${i} syntax error: ${error.message}`); }
}

const syntax = spawnSync(process.execPath, ['--check', join(root, 'src', 'index.js')], { encoding: 'utf8' });
if (syntax.status !== 0) throw new Error(`Worker syntax error: ${syntax.stderr || syntax.stdout || 'unknown error'}`);

console.log('Free Smart Finance checks passed: local rules/data only, no paid external API');
