import { setRuntimeContext, clearRuntimeContext } from '../src/gas-runtime.js';
import { MemorySpreadsheet } from '../src/store.js';
import { legacyRpc, setupApp } from '../src/legacy-core.js';

const spreadsheet = new MemorySpreadsheet(new Map());
setRuntimeContext({ spreadsheet });
setupApp();

const reg = legacyRpc.register({ name:'ทดสอบ MoneyFlow', email:'smoke@example.com', password:'password123', deviceLabel:'Smoke test' });
const token = reg.token;
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
assert(reg.success, 'register failed');
assert(legacyRpc.login({ email:'smoke@example.com', password:'password123' }).success, 'login failed');
assert(legacyRpc.getCategories(token).length >= 20, 'default categories missing');

legacyRpc.addTransaction(token, { type:'income', amount:10000, category:'เงินเดือน', description:'ทดสอบรายรับ', date:'2026-08-20', accountId:'daily_wallet' });
legacyRpc.addTransaction(token, { type:'expense', amount:1000, category:'อาหาร', description:'ทดสอบรายจ่าย', date:'2026-08-20', accountId:'daily_wallet' });
legacyRpc.saveBudget(token, { category:'อาหาร', amount:5000, month:'2026-08' });
legacyRpc.saveGoal(token, { name:'ทดสอบเป้าหมาย', targetAmount:100000, currentAmount:0, targetDate:'2027-01-01', icon:'🎯' });

const dash = legacyRpc.getDashboard(token, '2026-08');
assert(Number(dash.income) === 10000, 'dashboard income mismatch');
assert(Number(dash.expense) === 1000, 'dashboard expense mismatch');
assert(legacyRpc.exportBackupJson(token).includes('Transactions'), 'backup failed');

const health = legacyRpc.getAccountingHealth(token);
assert(health && Array.isArray(health.issues), 'accounting health missing');
assert(health.summary && Number(health.summary.transactions) === 2, 'accounting health transaction count mismatch');
assert(!health.issues.some(x => x && x.severity === 'error'), 'accounting health found unexpected error');

clearRuntimeContext();
console.log('MoneyFlow legacy compatibility smoke test: PASS');
