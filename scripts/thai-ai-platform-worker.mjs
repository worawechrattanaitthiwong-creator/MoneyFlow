import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const workerPath = join(root, 'src', 'index.js');
let worker = await readFile(workerPath, 'utf8');

if (!worker.includes('MONEYFLOW_THAI_AI_PLATFORM_V1')) {
  const headerNeedle = "const MAX_RPC_BODY_BYTES = 5 * 1024 * 1024;";
  if (!worker.includes(headerNeedle)) throw new Error('Worker body-size marker not found');
  const helper = String.raw`

/* MONEYFLOW_THAI_AI_PLATFORM_V1 */
const MF_AI_PRODUCT_SHEETS = ['ProductProfiles', 'FamilyMembers', 'DebtPlans', 'FreelancerProfiles', 'CategoryRules', 'CaptureInbox'];

function mfNowIso() { return new Date().toISOString(); }
function mfStr(value, max = 180) { return String(value == null ? '' : value).trim().slice(0, max); }
function mfNum(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function mfBool(value, fallback = false) { return value == null ? fallback : (value === true || String(value).toLowerCase() === 'true'); }
function mfRows(ctx, name) { const sheet = ctx.spreadsheet.getSheetByName(name); return sheet ? sheet.rows.map(r => r.data) : []; }
function mfEnsureSheet(ctx, name, headers) {
  let sheet = ctx.spreadsheet.getSheetByName(name);
  if (!sheet) sheet = ctx.spreadsheet.insertSheet(name);
  const next = Array.isArray(headers) ? headers : [];
  if (!sheet.headers.length) { sheet.headers = next.slice(); sheet.metaDirty = true; }
  else {
    for (const h of next) if (!sheet.headers.includes(h)) { sheet.headers.push(h); sheet.metaDirty = true; }
  }
  return sheet;
}
function mfAppendObject(sheet, data) {
  sheet.appendRow(sheet.headers.map(h => data[h] == null ? '' : data[h]));
  return sheet.rows[sheet.rows.length - 1];
}
function mfUpsert(sheet, predicate, data) {
  const rec = sheet.rows.find(r => predicate(r.data));
  if (rec) { Object.assign(rec.data, data); rec.dirty = true; return rec.data; }
  return mfAppendObject(sheet, data).data;
}
function mfDeleteWhere(sheet, predicate) {
  for (let i = sheet.rows.length - 1; i >= 0; i--) if (predicate(sheet.rows[i].data)) sheet.deleteRow(i + 2);
}
function mfUserId(user) { return String(user && user.id != null ? user.id : ''); }
function mfBangkokNow() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(p => [p.type, p.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), key: parts.year + '-' + parts.month, date: parts.year + '-' + parts.month + '-' + parts.day };
}
function mfDateKey(value) { const s = String(value || ''); const m = s.match(/^(\d{4}-\d{2}-\d{2})/); return m ? m[1] : ''; }
function mfMonthKey(value) { const d = mfDateKey(value); return d ? d.slice(0, 7) : ''; }
function mfMedian(values) { const a = values.map(Number).filter(Number.isFinite).sort((x, y) => x - y); if (!a.length) return 0; const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }
function mfRound(value, digits = 2) { const p = 10 ** digits; return Math.round((Number(value) || 0) * p) / p; }

function mfProductDefaults(userId) {
  return {
    id: 'product:' + userId,
    userId,
    experienceMode: 'personal',
    aiEnabled: true,
    activeFamilyMemberId: '',
    transactionContext: 'personal',
    debtStrategy: 'avalanche',
    betaFullAccess: true,
    billingStatus: 'not_configured',
    familySharingStatus: 'single_account_workspace',
    updatedAt: ''
  };
}
function mfGetProductProfile(ctx, userId) {
  const row = mfRows(ctx, 'ProductProfiles').find(r => String(r.userId || '') === userId);
  return Object.assign(mfProductDefaults(userId), row || {});
}
function mfSaveProductProfile(ctx, userId, payload = {}) {
  const sheet = mfEnsureSheet(ctx, 'ProductProfiles', ['id','userId','experienceMode','aiEnabled','activeFamilyMemberId','transactionContext','debtStrategy','betaFullAccess','billingStatus','familySharingStatus','createdAt','updatedAt']);
  const current = mfGetProductProfile(ctx, userId);
  const modes = new Set(['personal','pro','family','freelancer']);
  const contexts = new Set(['personal','business']);
  const strategies = new Set(['snowball','avalanche']);
  const next = {
    id: current.id || ('product:' + userId), userId,
    experienceMode: modes.has(String(payload.experienceMode || '')) ? String(payload.experienceMode) : current.experienceMode,
    aiEnabled: payload.aiEnabled == null ? mfBool(current.aiEnabled, true) : mfBool(payload.aiEnabled, true),
    activeFamilyMemberId: payload.activeFamilyMemberId == null ? mfStr(current.activeFamilyMemberId, 80) : mfStr(payload.activeFamilyMemberId, 80),
    transactionContext: contexts.has(String(payload.transactionContext || '')) ? String(payload.transactionContext) : current.transactionContext,
    debtStrategy: strategies.has(String(payload.debtStrategy || '')) ? String(payload.debtStrategy) : current.debtStrategy,
    betaFullAccess: true,
    billingStatus: 'not_configured',
    familySharingStatus: 'single_account_workspace',
    createdAt: current.createdAt || mfNowIso(), updatedAt: mfNowIso()
  };
  mfUpsert(sheet, r => String(r.userId || '') === userId, next);
  return next;
}

function mfFamilyMembers(ctx, userId) {
  return mfRows(ctx, 'FamilyMembers').filter(r => String(r.userId || '') === userId && String(r.status || 'active') !== 'deleted');
}
function mfSaveFamilyMember(ctx, userId, payload = {}) {
  const sheet = mfEnsureSheet(ctx, 'FamilyMembers', ['id','userId','name','role','status','createdAt','updatedAt']);
  const existing = mfFamilyMembers(ctx, userId);
  const id = mfStr(payload.id, 80) || crypto.randomUUID();
  if (!existing.some(r => String(r.id) === id) && existing.length >= 10) throw new Error('Family รองรับสมาชิกสูงสุด 10 คนในรุ่นนี้');
  const name = mfStr(payload.name, 60); if (!name) throw new Error('กรุณาระบุชื่อสมาชิก');
  const roles = new Set(['owner','partner','parent','child','other']);
  const role = roles.has(String(payload.role || '')) ? String(payload.role) : 'other';
  const old = existing.find(r => String(r.id) === id) || {};
  const row = { id, userId, name, role, status: 'active', createdAt: old.createdAt || mfNowIso(), updatedAt: mfNowIso() };
  mfUpsert(sheet, r => String(r.userId || '') === userId && String(r.id || '') === id, row);
  return row;
}
function mfDeleteFamilyMember(ctx, userId, id) {
  const sheet = mfEnsureSheet(ctx, 'FamilyMembers', ['id','userId','name','role','status','createdAt','updatedAt']);
  const rec = sheet.rows.find(r => String(r.data.userId || '') === userId && String(r.data.id || '') === String(id || ''));
  if (rec) { rec.data.status = 'deleted'; rec.data.updatedAt = mfNowIso(); rec.dirty = true; }
  const profile = mfGetProductProfile(ctx, userId);
  if (String(profile.activeFamilyMemberId || '') === String(id || '')) mfSaveProductProfile(ctx, userId, { activeFamilyMemberId: '' });
  return { success: true };
}

function mfDebtPlans(ctx, userId) { return mfRows(ctx, 'DebtPlans').filter(r => String(r.userId || '') === userId && String(r.status || 'active') !== 'deleted'); }
function mfSaveDebtPlan(ctx, userId, payload = {}) {
  const sheet = mfEnsureSheet(ctx, 'DebtPlans', ['id','userId','name','balance','apr','minimumPayment','dueDay','accountId','status','createdAt','updatedAt']);
  const id = mfStr(payload.id, 80) || crypto.randomUUID();
  const name = mfStr(payload.name, 80); if (!name) throw new Error('กรุณาระบุชื่อหนี้หรือบัตร');
  const balance = Math.max(0, mfNum(payload.balance));
  const apr = Math.min(100, Math.max(0, mfNum(payload.apr)));
  const minimumPayment = Math.max(0, mfNum(payload.minimumPayment));
  const dueDay = Math.min(31, Math.max(1, Math.round(mfNum(payload.dueDay, 1))));
  const old = mfDebtPlans(ctx, userId).find(r => String(r.id) === id) || {};
  const row = { id, userId, name, balance, apr, minimumPayment, dueDay, accountId: mfStr(payload.accountId, 100), status: 'active', createdAt: old.createdAt || mfNowIso(), updatedAt: mfNowIso() };
  mfUpsert(sheet, r => String(r.userId || '') === userId && String(r.id || '') === id, row);
  return row;
}
function mfDeleteDebtPlan(ctx, userId, id) {
  const sheet = mfEnsureSheet(ctx, 'DebtPlans', ['id','userId','name','balance','apr','minimumPayment','dueDay','accountId','status','createdAt','updatedAt']);
  const rec = sheet.rows.find(r => String(r.data.userId || '') === userId && String(r.data.id || '') === String(id || ''));
  if (rec) { rec.data.status = 'deleted'; rec.data.updatedAt = mfNowIso(); rec.dirty = true; }
  return { success: true };
}

function mfGetFreelancer(ctx, userId) {
  const row = mfRows(ctx, 'FreelancerProfiles').find(r => String(r.userId || '') === userId);
  return Object.assign({ id: 'freelancer:' + userId, userId, businessName: '', taxReservePct: 10, defaultContext: 'personal', updatedAt: '' }, row || {});
}
function mfSaveFreelancer(ctx, userId, payload = {}) {
  const sheet = mfEnsureSheet(ctx, 'FreelancerProfiles', ['id','userId','businessName','taxReservePct','defaultContext','createdAt','updatedAt']);
  const current = mfGetFreelancer(ctx, userId);
  const context = ['personal','business'].includes(String(payload.defaultContext || '')) ? String(payload.defaultContext) : current.defaultContext;
  const row = { id: current.id || ('freelancer:' + userId), userId, businessName: mfStr(payload.businessName, 120), taxReservePct: Math.min(50, Math.max(0, mfNum(payload.taxReservePct, current.taxReservePct || 10))), defaultContext: context, createdAt: current.createdAt || mfNowIso(), updatedAt: mfNowIso() };
  mfUpsert(sheet, r => String(r.userId || '') === userId, row);
  mfSaveProductProfile(ctx, userId, { experienceMode: 'freelancer', transactionContext: context });
  return row;
}

function mfNormalizeRuleText(value) {
  return String(value || '').toLowerCase().replace(/[๐-๙]/g, c => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(c))).replace(/\d[\d,.]*/g, ' ').replace(/บาท|฿|จ่าย|ซื้อ|ได้รับ|รับเงิน|ได้เงิน|รายรับ|รายจ่าย|วันนี้|เมื่อวาน/g, ' ').replace(/[^a-z0-9ก-๙\s]/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
}
function mfLearnCategory(ctx, userId, payload = {}) {
  const category = mfStr(payload.category, 80); const type = mfStr(payload.type, 20).toLowerCase();
  if (!category || !['income','expense'].includes(type) || /อื่น|ทั่วไป/.test(category)) return null;
  const key = mfNormalizeRuleText(payload.description || payload.note || payload.merchant || '');
  if (key.length < 2) return null;
  const sheet = mfEnsureSheet(ctx, 'CategoryRules', ['id','userId','key','type','category','count','lastSeen','createdAt','updatedAt']);
  let rec = sheet.rows.find(r => String(r.data.userId || '') === userId && r.data.key === key && r.data.type === type && r.data.category === category);
  if (rec) { rec.data.count = mfNum(rec.data.count, 0) + 1; rec.data.lastSeen = mfNowIso(); rec.data.updatedAt = mfNowIso(); rec.dirty = true; return rec.data; }
  const row = { id: crypto.randomUUID(), userId, key, type, category, count: 1, lastSeen: mfNowIso(), createdAt: mfNowIso(), updatedAt: mfNowIso() };
  mfAppendObject(sheet, row); return row;
}
function mfSuggestCategory(ctx, userId, payload = {}) {
  const type = mfStr(payload.type, 20).toLowerCase(); const key = mfNormalizeRuleText(payload.text || payload.description || '');
  if (!key || !['income','expense'].includes(type)) return null;
  const rules = mfRows(ctx, 'CategoryRules').filter(r => String(r.userId || '') === userId && r.type === type);
  const exact = rules.filter(r => r.key === key).sort((a,b) => mfNum(b.count) - mfNum(a.count))[0];
  if (exact) return { category: exact.category, confidence: Math.min(.97, .72 + Math.min(5, mfNum(exact.count)) * .05), source: 'learned_exact' };
  const tokens = key.split(' ').filter(t => t.length > 1);
  let best = null;
  for (const r of rules) {
    const rt = String(r.key || '').split(' '); const overlap = tokens.filter(t => rt.includes(t)).length;
    const score = overlap / Math.max(1, Math.max(tokens.length, rt.length));
    if (overlap && (!best || score > best.score || (score === best.score && mfNum(r.count) > mfNum(best.row.count)))) best = { row: r, score };
  }
  if (best && best.score >= .5) return { category: best.row.category, confidence: mfRound(.62 + Math.min(.22, best.score * .22), 2), source: 'learned_similar' };
  return null;
}

function mfCaptureInbox(ctx, userId) { return mfRows(ctx, 'CaptureInbox').filter(r => String(r.userId || '') === userId && String(r.status || 'pending') === 'pending').slice(-30).reverse(); }
function mfQueueCapture(ctx, userId, payload = {}) {
  const sheet = mfEnsureSheet(ctx, 'CaptureInbox', ['id','userId','source','text','amount','type','merchant','date','fingerprint','status','createdAt','updatedAt']);
  const fingerprint = mfStr(payload.fingerprint, 160);
  if (fingerprint) {
    const old = sheet.rows.find(r => String(r.data.userId || '') === userId && r.data.fingerprint === fingerprint && String(r.data.status || 'pending') !== 'rejected');
    if (old) return Object.assign({ deduped: true }, old.data);
  }
  const type = ['income','expense'].includes(String(payload.type || '')) ? String(payload.type) : '';
  const row = { id: crypto.randomUUID(), userId, source: mfStr(payload.source || 'manual', 40), text: mfStr(payload.text, 500), amount: Math.max(0, mfNum(payload.amount)), type, merchant: mfStr(payload.merchant, 120), date: mfStr(payload.date, 20), fingerprint: fingerprint || crypto.randomUUID(), status: 'pending', createdAt: mfNowIso(), updatedAt: mfNowIso() };
  const pendingCount = sheet.rows.filter(r => String(r.data.userId || '') === userId && String(r.data.status || 'pending') === 'pending').length;
  if (pendingCount >= 100) throw new Error('Capture Inbox เต็ม กรุณาตรวจรายการค้างก่อน');
  mfAppendObject(sheet, row); return row;
}
function mfSetCaptureStatus(ctx, userId, payload = {}) {
  const id = mfStr(payload.id, 80), status = ['reviewed','rejected','pending'].includes(String(payload.status || '')) ? String(payload.status) : 'reviewed';
  const sheet = mfEnsureSheet(ctx, 'CaptureInbox', ['id','userId','source','text','amount','type','merchant','date','fingerprint','status','createdAt','updatedAt']);
  const rec = sheet.rows.find(r => String(r.data.userId || '') === userId && String(r.data.id || '') === id);
  if (!rec) throw new Error('ไม่พบรายการใน Capture Inbox');
  rec.data.status = status; rec.data.updatedAt = mfNowIso(); rec.dirty = true; return rec.data;
}

function mfTransactionRows(ctx) { return mfRows(ctx, 'Transactions'); }
function mfSmartAnalytics(ctx, userId) {
  const now = mfBangkokNow(); const currentKey = now.key;
  const tx = mfTransactionRows(ctx).filter(r => String(r.userId || '') === userId || !r.userId).map(r => Object.assign({}, r, { _type: String(r.type || '').toLowerCase(), _amount: Math.max(0, mfNum(r.amount)), _date: mfDateKey(r.date) })).filter(r => r._date && ['income','expense','transfer'].includes(r._type));
  const current = tx.filter(r => mfMonthKey(r._date) === currentKey && r._type !== 'transfer');
  const income = current.filter(r => r._type === 'income').reduce((s,r) => s + r._amount, 0);
  const expense = current.filter(r => r._type === 'expense').reduce((s,r) => s + r._amount, 0);
  const daysInMonth = new Date(Date.UTC(now.year, now.month, 0)).getUTCDate(); const remainingDays = Math.max(0, daysInMonth - now.day);
  const prevMonths = [];
  for (let i = 1; i <= 3; i++) { const d = new Date(Date.UTC(now.year, now.month - 1 - i, 1)); prevMonths.push(d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2,'0')); }
  const monthIncome = prevMonths.map(k => tx.filter(r => mfMonthKey(r._date) === k && r._type === 'income').reduce((s,r) => s + r._amount, 0)).filter(v => v > 0);
  const monthExpense = prevMonths.map(k => tx.filter(r => mfMonthKey(r._date) === k && r._type === 'expense').reduce((s,r) => s + r._amount, 0)).filter(v => v > 0);
  const avgIncome = monthIncome.length ? monthIncome.reduce((a,b) => a+b,0)/monthIncome.length : income;
  const priorDailyExpense = monthExpense.length ? (monthExpense.reduce((a,b) => a+b,0)/monthExpense.length) / 30.44 : 0;
  const currentDailyExpense = now.day ? expense / now.day : 0; const baselineDaily = currentDailyExpense || priorDailyExpense;
  const projectedExpense = expense + baselineDaily * remainingDays; const projectedIncome = Math.max(income, avgIncome || 0); const projectedNet = projectedIncome - projectedExpense;
  const dailyWallet = mfRows(ctx, 'DailyWallet').find(r => String(r.userId || '') === userId) || mfRows(ctx, 'DailyWallet')[0] || {};
  const dailyWalletBalance = mfNum(dailyWallet.balance);
  const projectedRemainingExpense = baselineDaily * remainingDays; const safeBuffer = dailyWalletBalance - projectedRemainingExpense; const safePerDay = remainingDays >= 0 ? Math.max(0, dailyWalletBalance / Math.max(1, remainingDays + 1)) : 0;
  const savingRate = income > 0 ? Math.max(0, (income - expense) / income * 100) : 0;
  const categoryMap = new Map(); for (const r of current.filter(r => r._type === 'expense')) { const c = mfStr(r.category || 'อื่นๆ', 80) || 'อื่นๆ'; categoryMap.set(c, (categoryMap.get(c) || 0) + r._amount); }
  const topCategories = [...categoryMap.entries()].map(([category,amount]) => ({category,amount:mfRound(amount)})).sort((a,b) => b.amount-a.amount).slice(0,5);
  const historyExpenses = tx.filter(r => r._type === 'expense').map(r => r._amount).filter(v => v > 0); const medianExpense = mfMedian(historyExpenses); const anomalyThreshold = Math.max(1500, medianExpense * 3);
  const anomalies = current.filter(r => r._type === 'expense' && r._amount >= anomalyThreshold).sort((a,b) => b._amount-a._amount).slice(0,5).map(r => ({ id: r.id || '', amount: mfRound(r._amount), category: r.category || 'อื่นๆ', description: r.description || '', date: r._date }));
  const insights = [];
  if (projectedIncome > 0 && projectedExpense > projectedIncome) insights.push({ level:'warning', title:'รายจ่ายมีแนวโน้มสูงกว่ารายรับ', text:'ถ้าใช้จ่ายด้วยจังหวะปัจจุบัน สิ้นเดือนอาจติดลบประมาณ ฿' + Math.round(Math.abs(projectedNet)).toLocaleString('th-TH') });
  else if (income > 0 && savingRate >= 20) insights.push({ level:'good', title:'อัตราออมอยู่ในระดับดี', text:'เดือนนี้เหลือสุทธิประมาณ ' + mfRound(savingRate,1) + '% ของรายรับ' });
  if (topCategories[0] && expense > 0 && topCategories[0].amount / expense >= .35) insights.push({ level:'info', title:'หมวดที่ใช้มากที่สุดคือ ' + topCategories[0].category, text:'คิดเป็นประมาณ ' + Math.round(topCategories[0].amount / expense * 100) + '% ของรายจ่ายเดือนนี้' });
  if (anomalies.length) insights.push({ level:'warning', title:'พบรายจ่ายที่สูงกว่าปกติ ' + anomalies.length + ' รายการ', text:'ระบบเทียบกับรูปแบบยอดใช้จ่ายที่ผ่านมา ควรตรวจรายการที่ยอดสูงผิดปกติ' });
  if (dailyWalletBalance > 0) insights.push({ level: safeBuffer < 0 ? 'warning' : 'info', title:'เงินใช้ประจำวันต่อวัน', text:'จากยอดปัจจุบัน แบ่งใช้ได้เฉลี่ยประมาณ ฿' + Math.round(safePerDay).toLocaleString('th-TH') + '/วัน จนถึงสิ้นเดือน' });
  return { month: currentKey, income:mfRound(income), expense:mfRound(expense), net:mfRound(income-expense), savingRate:mfRound(savingRate,1), projectedIncome:mfRound(projectedIncome), projectedExpense:mfRound(projectedExpense), projectedNet:mfRound(projectedNet), dailyWalletBalance:mfRound(dailyWalletBalance), safeBuffer:mfRound(safeBuffer), safePerDay:mfRound(safePerDay), remainingDays, topCategories, anomalies, insights, sampleSize: tx.length };
}
function mfFamilyAnalytics(ctx, userId, members) {
  const now = mfBangkokNow(); const tx = mfTransactionRows(ctx).filter(r => mfMonthKey(r.date) === now.key && String(r.type || '').toLowerCase() !== 'transfer');
  return members.map(m => { const rows = tx.filter(r => String(r.familyMemberId || '') === String(m.id)); return { id:m.id, name:m.name, income:mfRound(rows.filter(r => String(r.type).toLowerCase()==='income').reduce((s,r)=>s+mfNum(r.amount),0)), expense:mfRound(rows.filter(r => String(r.type).toLowerCase()==='expense').reduce((s,r)=>s+mfNum(r.amount),0)), count:rows.length }; });
}
function mfFreelancerAnalytics(ctx, userId, freelancer) {
  const now = mfBangkokNow(); const tx = mfTransactionRows(ctx).filter(r => mfMonthKey(r.date) === now.key && String(r.moneyContext || '') === 'business');
  const income = tx.filter(r => String(r.type).toLowerCase()==='income').reduce((s,r)=>s+mfNum(r.amount),0); const expense = tx.filter(r => String(r.type).toLowerCase()==='expense').reduce((s,r)=>s+mfNum(r.amount),0); const profit = income-expense; const reserve = Math.max(0, profit) * mfNum(freelancer.taxReservePct,10)/100;
  return { income:mfRound(income), expense:mfRound(expense), profit:mfRound(profit), taxReserveEstimate:mfRound(reserve), taggedTransactions:tx.length };
}
function mfDebtSummary(ctx, userId, profile) {
  const debts = mfDebtPlans(ctx, userId); const totalBalance = debts.reduce((s,d)=>s+mfNum(d.balance),0); const totalMinimum = debts.reduce((s,d)=>s+mfNum(d.minimumPayment),0);
  const avalanche = debts.slice().sort((a,b)=>mfNum(b.apr)-mfNum(a.apr)||mfNum(a.balance)-mfNum(b.balance)); const snowball = debts.slice().sort((a,b)=>mfNum(a.balance)-mfNum(b.balance)||mfNum(b.apr)-mfNum(a.apr)); const strategy = profile.debtStrategy === 'snowball' ? snowball : avalanche;
  return { debts, totalBalance:mfRound(totalBalance), totalMinimum:mfRound(totalMinimum), strategy:profile.debtStrategy || 'avalanche', nextTarget:strategy[0] || null };
}
function mfBuildProductHub(ctx, userId) {
  const profile = mfGetProductProfile(ctx,userId); const family = mfFamilyMembers(ctx,userId); const freelancer = mfGetFreelancer(ctx,userId); const analytics = mfSmartAnalytics(ctx,userId); const debt = mfDebtSummary(ctx,userId,profile); const captureInbox = mfCaptureInbox(ctx,userId);
  return { profile, analytics, family:{ members:family, stats:mfFamilyAnalytics(ctx,userId,family), sharingStatus:'single_account_workspace' }, debt, freelancer:{ profile:freelancer, analytics:mfFreelancerAnalytics(ctx,userId,freelancer) }, capture:{ inbox:captureInbox, nativeAndroidRequired:true, emailConnectorConfigured:false, openDataConfigured:false }, product:{ betaFullAccess:true, billingStatus:'not_configured', tiers:['free','pro','family','freelancer'] }, roadmap:{ voice:'active_limited_daily_salary', categoryLearning:'active', smartInsights:'active', forecast:'active', anomalyDetection:'active', familyWorkspace:'active_single_account', debtPlanner:'active', freelancerMode:'active', captureInbox:'active', androidNotificationCapture:'native_client_required', emailAutoCapture:'connector_required', openData:'partner_required', appStoreBilling:'not_configured' } };
}
function mfAnnotateNewTransaction(ctx, userId, beforeCount) {
  const sheet = ctx.spreadsheet.getSheetByName('Transactions'); if (!sheet || sheet.rows.length <= beforeCount) return null;
  const rec = sheet.rows[sheet.rows.length - 1]; if (!rec) return null; const profile = mfGetProductProfile(ctx,userId);
  if (profile.experienceMode === 'family' && profile.activeFamilyMemberId) rec.data.familyMemberId = String(profile.activeFamilyMemberId);
  rec.data.moneyContext = profile.experienceMode === 'freelancer' ? (profile.transactionContext === 'business' ? 'business' : 'personal') : (rec.data.moneyContext || 'personal');
  rec.dirty = true; mfLearnCategory(ctx,userId,rec.data); return rec.data;
}
`;
  worker = worker.replace(headerNeedle, headerNeedle + helper);

  const planNeedle = "  exportTransactionsCsv: [...FINANCE_SHEETS, 'Transactions']";
  if (!worker.includes(planNeedle)) throw new Error('Worker RPC plan marker not found');
  const plans = `  exportTransactionsCsv: [...FINANCE_SHEETS, 'Transactions'],\n  getAIProductHub: [...FINANCE_SHEETS, 'Transactions', 'Accounts', ...MF_AI_PRODUCT_SHEETS],\n  saveAIProductProfile: [...AUTH_SHEETS, 'ProductProfiles'],\n  saveFamilyMember: [...AUTH_SHEETS, 'ProductProfiles', 'FamilyMembers'],\n  deleteFamilyMember: [...AUTH_SHEETS, 'ProductProfiles', 'FamilyMembers'],\n  saveDebtPlan: [...AUTH_SHEETS, 'ProductProfiles', 'DebtPlans'],\n  deleteDebtPlan: [...AUTH_SHEETS, 'ProductProfiles', 'DebtPlans'],\n  saveFreelancerProfile: [...AUTH_SHEETS, 'ProductProfiles', 'FreelancerProfiles'],\n  getSmartCategorySuggestion: [...AUTH_SHEETS, 'CategoryRules'],\n  queueCaptureCandidate: [...AUTH_SHEETS, 'CaptureInbox'],\n  updateCaptureCandidateStatus: [...AUTH_SHEETS, 'CaptureInbox']`;
  worker = worker.replace(planNeedle, plans);

  const dispatchNeedle = `    } else if (method === 'createReportPdf') {\n      const token = args[0], month = args[1];\n      const data = legacyRpc.getReportData(token, month);\n      special = { type: 'pdf', data };\n    } else {\n      const fn = legacyRpc[method];\n      if (typeof fn !== 'function') throw new Error('ไม่รองรับ API: ' + method);\n      result = fn(...args);\n    }`;
  if (!worker.includes(dispatchNeedle)) throw new Error('Worker RPC dispatch marker not found');
  const dispatch = `    } else if (method === 'createReportPdf') {\n      const token = args[0], month = args[1];\n      const data = legacyRpc.getReportData(token, month);\n      special = { type: 'pdf', data };\n    } else if (method === 'getAIProductHub') {\n      const user = legacyRpc.getCurrentUser(args[0]); result = mfBuildProductHub(ctx, mfUserId(user));\n    } else if (method === 'saveAIProductProfile') {\n      const user = legacyRpc.getCurrentUser(args[0]); result = mfSaveProductProfile(ctx, mfUserId(user), args[1] || {});\n    } else if (method === 'saveFamilyMember') {\n      const user = legacyRpc.getCurrentUser(args[0]); result = mfSaveFamilyMember(ctx, mfUserId(user), args[1] || {});\n    } else if (method === 'deleteFamilyMember') {\n      const user = legacyRpc.getCurrentUser(args[0]); result = mfDeleteFamilyMember(ctx, mfUserId(user), args[1]);\n    } else if (method === 'saveDebtPlan') {\n      const user = legacyRpc.getCurrentUser(args[0]); result = mfSaveDebtPlan(ctx, mfUserId(user), args[1] || {});\n    } else if (method === 'deleteDebtPlan') {\n      const user = legacyRpc.getCurrentUser(args[0]); result = mfDeleteDebtPlan(ctx, mfUserId(user), args[1]);\n    } else if (method === 'saveFreelancerProfile') {\n      const user = legacyRpc.getCurrentUser(args[0]); result = mfSaveFreelancer(ctx, mfUserId(user), args[1] || {});\n    } else if (method === 'getSmartCategorySuggestion') {\n      const user = legacyRpc.getCurrentUser(args[0]); result = mfSuggestCategory(ctx, mfUserId(user), args[1] || {});\n    } else if (method === 'queueCaptureCandidate') {\n      const user = legacyRpc.getCurrentUser(args[0]); result = mfQueueCapture(ctx, mfUserId(user), args[1] || {});\n    } else if (method === 'updateCaptureCandidateStatus') {\n      const user = legacyRpc.getCurrentUser(args[0]); result = mfSetCaptureStatus(ctx, mfUserId(user), args[1] || {});\n    } else {\n      const fn = legacyRpc[method];\n      if (typeof fn !== 'function') throw new Error('ไม่รองรับ API: ' + method);\n      const beforeTxCount = method === 'addTransaction' && ctx.spreadsheet.getSheetByName('Transactions') ? ctx.spreadsheet.getSheetByName('Transactions').rows.length : -1;\n      result = fn(...args);\n      try {\n        if (method === 'addTransaction' && beforeTxCount >= 0) { const user = legacyRpc.getCurrentUser(args[0]); mfAnnotateNewTransaction(ctx, mfUserId(user), beforeTxCount); }\n        else if (method === 'updateTransaction') { const user = legacyRpc.getCurrentUser(args[0]); const payload = [...args].reverse().find(v => v && typeof v === 'object' && !Array.isArray(v) && ('category' in v || 'description' in v)); if (payload) mfLearnCategory(ctx, mfUserId(user), payload); }\n      } catch (learningError) { console.warn('MoneyFlow smart learning skipped', learningError); }\n    }`;
  worker = worker.replace(dispatchNeedle, dispatch);
}

worker = worker.replace(/version: '6\.2-cloudflare\.\d+'/g, "version: '6.2-cloudflare.7'");
await writeFile(workerPath, worker);
console.log('Applied Thai AI Personal Finance backend platform');
