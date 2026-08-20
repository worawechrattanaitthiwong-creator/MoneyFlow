import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const corePath = join(root, 'src', 'legacy-core.js');
let code = await readFile(corePath, 'utf8');

if (!code.includes('MONEYFLOW_ACCOUNTING_HEALTH_V1')) {
  const fn = `

/* MONEYFLOW_ACCOUNTING_HEALTH_V1
   Read-only consistency checks for the compatibility data model.
   This never changes balances or ledger rows.
*/
function getAccountingHealth(token){
  const user=authenticate_(token);ensureV6User_(user);ensureDailyWalletSheets_();
  const userId=String(user.id),issues=[],tolerance=.01;
  const userRows=function(name){return getRows_(name).filter(function(r){return String(r.userId)===userId;});};
  const number=function(v){const n=Number(v);return isFinite(n)?n:0;};
  const latest=function(rows){return rows.slice().sort(function(a,b){return Number(a._row||0)-Number(b._row||0);}).pop()||null;};
  const push=function(code,message,severity,details){issues.push({code:code,message:message,severity:severity||'warning',details:details||{}});};

  const accounts=userRows(APP.SHEETS.ACCOUNTS);
  const accountLedger=userRows(APP.SHEETS.ACCOUNT_LEDGER);
  const transactions=userRows(APP.SHEETS.TRANSACTIONS);
  const wallets=userRows(V63_DAILY_WALLET_SHEET);
  const dailyLedger=userRows(V63_DAILY_LEDGER_SHEET);

  const accountIds={};accounts.forEach(function(a){if(a.id)accountIds[String(a.id)]=true;});
  const transactionIds={};transactions.forEach(function(t){if(t.id){const id=String(t.id);transactionIds[id]=(transactionIds[id]||0)+1;}});

  Object.keys(transactionIds).forEach(function(id){if(transactionIds[id]>1)push('duplicate_transaction_id','พบ Transaction ID ซ้ำ '+id,'error',{id:id,count:transactionIds[id]});});

  const wallet=wallets[0]||null;
  const lastWalletLedger=latest(dailyLedger);
  if(wallet&&lastWalletLedger&&Math.abs(number(wallet.balance)-number(lastWalletLedger.balanceAfter))>tolerance){
    push('daily_wallet_mismatch','ยอดเงินใช้ประจำวันไม่ตรงกับ DailyWalletLedger','error',{balance:number(wallet.balance),ledgerBalance:number(lastWalletLedger.balanceAfter)});
  }

  accounts.forEach(function(account){
    if(!account.id)return;
    const rows=accountLedger.filter(function(r){return String(r.accountId||'')===String(account.id);});
    const last=latest(rows);
    if(last&&String(last.balanceAfter||'')!==''&&Math.abs(number(account.balance)-number(last.balanceAfter))>tolerance){
      push('account_ledger_mismatch','ยอดบัญชี “'+String(account.name||account.id)+'” ไม่ตรงกับ Ledger','error',{accountId:String(account.id),balance:number(account.balance),ledgerBalance:number(last.balanceAfter)});
    }
  });

  transactions.forEach(function(t){
    const id=String(t.id||'');
    const source=String(t.accountId||'');
    const target=String(t.toAccountId||'');
    if(source&&source!=='daily_wallet'&&!accountIds[source])push('missing_source_account','รายการ '+(t.description||id||'ไม่ทราบชื่อ')+' อ้างถึงบัญชีต้นทางที่ไม่มีอยู่','warning',{transactionId:id,accountId:source});
    if(String(t.type||'')==='transfer'){
      if(!source||!target||source===target)push('invalid_transfer','พบรายการโอนที่บัญชีต้นทาง/ปลายทางไม่ถูกต้อง','error',{transactionId:id,accountId:source,toAccountId:target});
      if(target&&target!=='daily_wallet'&&!accountIds[target])push('missing_target_account','รายการโอน '+(t.description||id||'ไม่ทราบชื่อ')+' อ้างถึงบัญชีปลายทางที่ไม่มีอยู่','warning',{transactionId:id,toAccountId:target});
    }
  });

  accountLedger.forEach(function(r){const tid=String(r.transactionId||'');if(tid&&!transactionIds[tid]&&String(r.movementType||'')!=='opening')push('orphan_account_ledger','AccountLedger อ้างถึงรายการที่หาไม่พบ','warning',{transactionId:tid,accountId:String(r.accountId||'')});});
  dailyLedger.forEach(function(r){const tid=String(r.transactionId||'');if(tid&&!transactionIds[tid]&&String(r.movementType||'')!=='opening'&&String(r.movementType||'')!=='reconciliation')push('orphan_daily_ledger','DailyWalletLedger อ้างถึงรายการที่หาไม่พบ','warning',{transactionId:tid});});

  return {
    ok:issues.filter(function(x){return x.severity==='error';}).length===0,
    checkedAt:now_(),
    issues:issues,
    summary:{accounts:accounts.length,transactions:transactions.length,accountLedger:accountLedger.length,dailyWalletLedger:dailyLedger.length,dailyWalletBalance:wallet?number(wallet.balance):0}
  };
}
`;
  const exportMarker = '\nexport const legacyRpc = {';
  if (!code.includes(exportMarker)) throw new Error('legacyRpc export marker not found');
  code = code.replace(exportMarker, fn + exportMarker);
  code = code.replace('export const legacyRpc = {\n', 'export const legacyRpc = {\n  getAccountingHealth,\n');
  await writeFile(corePath, code);
}

console.log('Injected MoneyFlow accounting integrity health RPC');
