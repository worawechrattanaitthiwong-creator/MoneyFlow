import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const workerPath = join(root, 'src', 'index.js');
let worker = await readFile(workerPath, 'utf8');

if (!worker.includes('MONEYFLOW_THAI_AI_PLATFORM_V1')) {
  throw new Error('Smart Finance backend marker missing; refusing free-mode patch');
}

const modesBefore = "const modes = new Set(['personal','pro','family','freelancer']);";
const modesAfter = "const modes = new Set(['personal','family','freelancer']);";
if (worker.includes(modesBefore)) worker = worker.replace(modesBefore, modesAfter);
if (!worker.includes(modesAfter)) throw new Error('Could not lock backend modes to personal/family/freelancer');

const profileBefore = "return Object.assign(mfProductDefaults(userId), row || {});";
const profileAfter = "const profile = Object.assign(mfProductDefaults(userId), row || {}); if (!['personal','family','freelancer'].includes(String(profile.experienceMode || ''))) profile.experienceMode = 'personal'; return profile;";
if (worker.includes(profileBefore)) worker = worker.replace(profileBefore, profileAfter);
if (!worker.includes(profileAfter)) throw new Error('Could not normalize legacy product mode');

if (!worker.includes('MONEYFLOW_FREE_PRODUCT_BACKEND_V1')) {
  worker = worker.replace('/* MONEYFLOW_THAI_AI_PLATFORM_V1 */', '/* MONEYFLOW_THAI_AI_PLATFORM_V1 */\n/* MONEYFLOW_FREE_PRODUCT_BACKEND_V1: free modes only, no Pro entitlement */');
}

if (worker.includes("['personal','pro','family','freelancer']")) {
  throw new Error('Pro mode remains active in Worker after free-mode patch');
}

await writeFile(workerPath, worker);
console.log('Locked Smart Finance backend to personal/family/freelancer free modes');
