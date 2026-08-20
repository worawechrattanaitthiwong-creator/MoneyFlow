import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const workerPath = join(root, 'src', 'index.js');
let worker = await readFile(workerPath, 'utf8');

if (!worker.includes('MONEYFLOW_VOICE_MIC_POLICY_V1')) {
  const marker = "const MAX_RPC_BODY_BYTES = 5 * 1024 * 1024;";
  if (!worker.includes(marker)) throw new Error('Worker body-size marker not found');
  worker = worker.replace(marker, marker + "\n\n/* MONEYFLOW_VOICE_MIC_POLICY_V1 */");
}

const blocked = "headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');";
const allowed = "headers.set('permissions-policy', 'camera=(), microphone=(self), geolocation=(), payment=(), usb=()');";
if (worker.includes(blocked)) worker = worker.replace(blocked, allowed);
if (!worker.includes(allowed)) throw new Error('Unable to enable same-origin microphone permission');

// Normalize the pre-AI build every run so production-test remains repeatable.
// The Thai AI platform step intentionally bumps this to .7 after the legacy production gate passes.
worker = worker.replace(/version: '6\.2-cloudflare\.\d+'/g, "version: '6.2-cloudflare.6'");
await writeFile(workerPath, worker);

console.log('Enabled same-origin microphone permission and normalized pre-AI Worker version');
