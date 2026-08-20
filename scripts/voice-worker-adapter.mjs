import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const workerPath = join(root, 'src', 'index.js');
let worker = await readFile(workerPath, 'utf8');

if (!worker.includes('MONEYFLOW_VOICE_TRANSFER_ADAPTER_V1')) {
  const headerNeedle = "const MAX_RPC_BODY_BYTES = 5 * 1024 * 1024;";
  if (!worker.includes(headerNeedle)) throw new Error('Worker body-size marker not found');
  const helper = `

/* MONEYFLOW_VOICE_TRANSFER_ADAPTER_V1 */
function voiceTransferData(command = {}) {
  const sourceId = String(command.sourceAccountId || command.fromAccountId || command.sourceId || command.fromId || '');
  const targetId = String(command.targetAccountId || command.toAccountId || command.destinationAccountId || command.targetId || command.toId || '');
  const amount = Number(command.amount || command.value || 0);
  const date = String(command.date || new Date().toISOString().slice(0, 10));
  const note = String(command.note || command.description || 'Voice transfer');
  if (!sourceId || !targetId) throw new Error('คำสั่งโอนยังขาดบัญชีต้นทางหรือปลายทาง');
  if (sourceId === targetId) throw new Error('บัญชีต้นทางและปลายทางต้องไม่ใช่บัญชีเดียวกัน');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('จำนวนเงินโอนไม่ถูกต้อง');
  const payload = {
    fromAccountId: sourceId, sourceAccountId: sourceId, fromId: sourceId, sourceId,
    accountFromId: sourceId, fromAccount: sourceId, sourceAccount: sourceId, from: sourceId,
    toAccountId: targetId, targetAccountId: targetId, destinationAccountId: targetId, toId: targetId, targetId,
    accountToId: targetId, toAccount: targetId, targetAccount: targetId, destinationAccount: targetId, to: targetId,
    amount, value: amount, transferAmount: amount,
    date, transferDate: date, transactionDate: date,
    note, description: note, memo: note,
    kind: String(command.kind || 'transfer'), type: 'transfer'
  };
  return { sourceId, targetId, amount, date, note, payload, kind: String(command.kind || 'transfer') };
}

function invokeVoiceTransfer(token, command) {
  const fn = legacyRpc && legacyRpc.saveTransfer;
  if (typeof fn !== 'function') throw new Error('MoneyFlow ไม่พบระบบโอนเงินเดิม');
  const data = voiceTransferData(command);
  const source = Function.prototype.toString.call(fn);
  const match = source.match(/^[^(]*\\(([^)]*)\\)/);
  const params = match ? match[1].split(',').map((x) => x.trim()).filter(Boolean) : [];
  if (params.length <= 2) return fn(token, data.payload);

  const values = params.map((raw, index) => {
    const name = raw.replace(/=.*$/, '').replace(/^\\.\\.\\./, '').trim().toLowerCase();
    if (index === 0 || /token|session|auth/.test(name)) return token;
    if (/payload|data|input|transfer/.test(name) && !/amount|date|from|source|to|target|dest/.test(name)) return data.payload;
    if (/from|source|debit/.test(name)) return data.sourceId;
    if (/to|target|dest|credit/.test(name)) return data.targetId;
    if (/amount|value|sum/.test(name)) return data.amount;
    if (/date|day/.test(name)) return data.date;
    if (/note|memo|desc|remark|detail/.test(name)) return data.note;
    if (/kind|type/.test(name)) return data.kind;
    return undefined;
  });
  if (values.some((value, index) => index > 0 && value === undefined)) {
    throw new Error('รูปแบบระบบโอนเงินเดิมไม่รองรับ Voice Router รุ่นนี้');
  }
  return fn(...values);
}`;
  worker = worker.replace(headerNeedle, headerNeedle + helper);

  const policyOld = "headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');";
  const policyNew = "headers.set('permissions-policy', 'camera=(), microphone=(self), geolocation=(), payment=(), usb=()');";
  if (!worker.includes(policyOld) && !worker.includes(policyNew)) throw new Error('Worker permissions policy marker not found');
  worker = worker.replace(policyOld, policyNew);

  const planNeedle = "  getAccountingHealth: [...FINANCE_SHEETS, 'Transactions', 'Accounts', 'AccountLedger', 'DailyWalletLedger'],";
  if (!worker.includes(planNeedle)) throw new Error('Worker accounting plan marker not found');
  worker = worker.replace(planNeedle, planNeedle + "\n  executeVoiceTransfer: [...FINANCE_SHEETS, 'Transactions', 'Accounts', 'AccountLedger', 'DailyWalletLedger'],");

  const rpcNeedle = `    } else if (method === 'createReportPdf') {
      const token = args[0], month = args[1];
      const data = legacyRpc.getReportData(token, month);
      special = { type: 'pdf', data };
    } else {`;
  const rpcReplacement = `    } else if (method === 'createReportPdf') {
      const token = args[0], month = args[1];
      const data = legacyRpc.getReportData(token, month);
      special = { type: 'pdf', data };
    } else if (method === 'executeVoiceTransfer') {
      result = invokeVoiceTransfer(args[0], args[1] || {});
    } else {`;
  if (!worker.includes(rpcNeedle)) throw new Error('Worker RPC dispatch marker not found');
  worker = worker.replace(rpcNeedle, rpcReplacement);

  worker = worker.replace("version: '6.2-cloudflare.4'", "version: '6.2-cloudflare.5'");
  await writeFile(workerPath, worker);
}

console.log('Applied Worker voice-transfer adapter and same-origin microphone permission');
