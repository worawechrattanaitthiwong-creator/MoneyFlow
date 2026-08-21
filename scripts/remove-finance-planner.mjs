import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = join(root, 'public', 'index.html');
const swPath = join(root, 'public', 'sw.js');
const workerPath = join(root, 'src', 'index.js');

const html = await readFile(htmlPath, 'utf8');
let worker = await readFile(workerPath, 'utf8');
let sw = await readFile(swPath, 'utf8');

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
  'Capture Inbox (วางข้อความเอง)',
  'แผนการเงิน'
];

for (const marker of forbidden) {
  if (html.includes(marker) || worker.includes(marker)) {
    throw new Error(`Finance planner marker is still active: ${marker}`);
  }
}

sw = sw.replace(/moneyflow-shell-v\d+/g, 'moneyflow-shell-v10');
worker = worker.replace(/version: '6\.2-cloudflare\.\d+'/g, "version: '6.2-cloudflare.9'");

await writeFile(swPath, sw);
await writeFile(workerPath, worker);
console.log('Finalized planner-free MoneyFlow release and bumped PWA cache');
