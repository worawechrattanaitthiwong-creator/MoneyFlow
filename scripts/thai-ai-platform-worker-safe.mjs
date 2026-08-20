import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const workerPath = join(root, 'src', 'index.js');
const sourcePath = join(root, 'scripts', 'thai-ai-platform-worker.mjs');
let worker = await readFile(workerPath, 'utf8');
const source = await readFile(sourcePath, 'utf8');

function extractRuntimeHelper(text) {
  const startMarker = '  const helper = String.raw`';
  const endMarker = '`;\n  worker = worker.replace(headerNeedle, headerNeedle + helper);';
  const start = text.indexOf(startMarker);
  if (start < 0) throw new Error('Thai AI helper start marker not found');
  const bodyStart = start + startMarker.length;
  const end = text.indexOf(endMarker, bodyStart);
  if (end < 0) throw new Error('Thai AI helper end marker not found');
  return text.slice(bodyStart, end);
}

if (!worker.includes('MONEYFLOW_THAI_AI_PLATFORM_V1')) {
  const headerNeedle = "const MAX_RPC_BODY_BYTES = 5 * 1024 * 1024;";
  if (!worker.includes(headerNeedle)) throw new Error('Worker body-size marker not found');
  worker = worker.replace(headerNeedle, headerNeedle + extractRuntimeHelper(source));

  const planNeedle = "  exportTransactionsCsv: [...FINANCE_SHEETS, 'Transactions']";
  if (!worker.includes(planNeedle)) throw new Error('Worker RPC plan marker not found');
  const planLines = [
    "  exportTransactionsCsv: [...FINANCE_SHEETS, 'Transactions'],",
    "  getAIProductHub: [...FINANCE_SHEETS, 'Transactions', 'Accounts', ...MF_AI_PRODUCT_SHEETS],",
    "  saveAIProductProfile: [...AUTH_SHEETS, 'ProductProfiles'],",
    "  saveFamilyMember: [...AUTH_SHEETS, 'ProductProfiles', 'FamilyMembers'],",
    "  deleteFamilyMember: [...AUTH_SHEETS, 'ProductProfiles', 'FamilyMembers'],",
    "  saveDebtPlan: [...AUTH_SHEETS, 'ProductProfiles', 'DebtPlans'],",
    "  deleteDebtPlan: [...AUTH_SHEETS, 'ProductProfiles', 'DebtPlans'],",
    "  saveFreelancerProfile: [...AUTH_SHEETS, 'ProductProfiles', 'FreelancerProfiles'],",
    "  getSmartCategorySuggestion: [...AUTH_SHEETS, 'CategoryRules'],",
    "  queueCaptureCandidate: [...AUTH_SHEETS, 'CaptureInbox'],",
    "  updateCaptureCandidateStatus: [...AUTH_SHEETS, 'CaptureInbox']"
  ].join('\n');
  worker = worker.replace(planNeedle, planLines);

  const genericNeedle = [
    "    } else {",
    "      const fn = legacyRpc[method];",
    "      if (typeof fn !== 'function') throw new Error('ไม่รองรับ API: ' + method);",
    "      result = fn(...args);",
    "    }"
  ].join('\n');
  if (!worker.includes(genericNeedle)) throw new Error('Worker generic RPC block not found');
  const specialLines = [
    "    } else if (method === 'getAIProductHub') {",
    "      const user = legacyRpc.getCurrentUser(args[0]); result = mfBuildProductHub(ctx, mfUserId(user));",
    "    } else if (method === 'saveAIProductProfile') {",
    "      const user = legacyRpc.getCurrentUser(args[0]); result = mfSaveProductProfile(ctx, mfUserId(user), args[1] || {});",
    "    } else if (method === 'saveFamilyMember') {",
    "      const user = legacyRpc.getCurrentUser(args[0]); result = mfSaveFamilyMember(ctx, mfUserId(user), args[1] || {});",
    "    } else if (method === 'deleteFamilyMember') {",
    "      const user = legacyRpc.getCurrentUser(args[0]); result = mfDeleteFamilyMember(ctx, mfUserId(user), args[1]);",
    "    } else if (method === 'saveDebtPlan') {",
    "      const user = legacyRpc.getCurrentUser(args[0]); result = mfSaveDebtPlan(ctx, mfUserId(user), args[1] || {});",
    "    } else if (method === 'deleteDebtPlan') {",
    "      const user = legacyRpc.getCurrentUser(args[0]); result = mfDeleteDebtPlan(ctx, mfUserId(user), args[1]);",
    "    } else if (method === 'saveFreelancerProfile') {",
    "      const user = legacyRpc.getCurrentUser(args[0]); result = mfSaveFreelancer(ctx, mfUserId(user), args[1] || {});",
    "    } else if (method === 'getSmartCategorySuggestion') {",
    "      const user = legacyRpc.getCurrentUser(args[0]); result = mfSuggestCategory(ctx, mfUserId(user), args[1] || {});",
    "    } else if (method === 'queueCaptureCandidate') {",
    "      const user = legacyRpc.getCurrentUser(args[0]); result = mfQueueCapture(ctx, mfUserId(user), args[1] || {});",
    "    } else if (method === 'updateCaptureCandidateStatus') {",
    "      const user = legacyRpc.getCurrentUser(args[0]); result = mfSetCaptureStatus(ctx, mfUserId(user), args[1] || {});",
    "    } else {",
    "      const fn = legacyRpc[method];",
    "      if (typeof fn !== 'function') throw new Error('ไม่รองรับ API: ' + method);",
    "      const beforeTxCount = method === 'addTransaction' && ctx.spreadsheet.getSheetByName('Transactions') ? ctx.spreadsheet.getSheetByName('Transactions').rows.length : -1;",
    "      result = fn(...args);",
    "      try {",
    "        if (method === 'addTransaction' && beforeTxCount >= 0) { const user = legacyRpc.getCurrentUser(args[0]); mfAnnotateNewTransaction(ctx, mfUserId(user), beforeTxCount); }",
    "        else if (method === 'updateTransaction') { const user = legacyRpc.getCurrentUser(args[0]); const payload = [...args].reverse().find(v => v && typeof v === 'object' && !Array.isArray(v) && ('category' in v || 'description' in v)); if (payload) mfLearnCategory(ctx, mfUserId(user), payload); }",
    "      } catch (learningError) { console.warn('MoneyFlow smart learning skipped', learningError); }",
    "    }"
  ].join('\n');
  worker = worker.replace(genericNeedle, specialLines);
}

worker = worker.replace(/version: '6\.2-cloudflare\.\d+'/g, "version: '6.2-cloudflare.7'");
await writeFile(workerPath, worker);
console.log('Applied safe Thai AI Personal Finance backend platform');
