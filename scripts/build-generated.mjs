import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function readBundledSource(folder) {
  const dir = join(root, 'source-bundles', folder);
  const names = (await readdir(dir)).filter((name) => name.endsWith('.b64')).sort();
  let base64 = '';
  for (const name of names) base64 += await readFile(join(dir, name), 'utf8');
  return gunzipSync(Buffer.from(base64, 'base64')).toString('utf8');
}

function addCloudflareDataCompatibility(code) {
  const patch = `

/* ============================================================
   CLOUDFLARE DATA COMPATIBILITY PATCH
   - Include DailyWallet + DailyWalletLedger in backup/restore.
   - Restore all imported rows under the currently authenticated user.
   - Upsert the one-row DailyWallet instead of creating duplicates.
   - De-duplicate seeded Categories, CurrencyRates and same-day snapshots.
   ============================================================ */
function exportBackupJson(token){
  const user=authenticate_(token);ensureV6User_(user);ensureNetWorthSheet_();ensureDailyWalletSheets_();const userId=String(user.id);
  const names=[APP.SHEETS.TRANSACTIONS,APP.SHEETS.CATEGORIES,APP.SHEETS.BUDGETS,APP.SHEETS.GOALS,APP.SHEETS.ACCOUNTS,APP.SHEETS.ACCOUNT_LEDGER,APP.SHEETS.RECURRING,APP.SHEETS.CURRENCY_RATES,APP.SHEETS.FINANCE_SETTINGS,APP.SHEETS.NET_WORTH_SNAPSHOTS,V63_DAILY_WALLET_SHEET,V63_DAILY_LEDGER_SHEET];
  const out={version:'6.2.0',exportedAt:now_(),user:sanitizeUser_(user),data:{}};
  names.forEach(function(name){out.data[name]=getRows_(name).filter(function(r){return String(r.userId)===userId;}).map(stripRow_);});
  return JSON.stringify(out,null,2);
}

function restoreBackupJson(token,jsonText){
  const user=authenticate_(token);ensureV6User_(user);ensureNetWorthSheet_();ensureDailyWalletSheets_();let backup;
  try{backup=JSON.parse(String(jsonText||''));}catch(e){throw new Error('ไฟล์ Backup JSON ไม่ถูกต้อง');}
  if(!backup||!backup.data)throw new Error('รูปแบบ Backup ไม่ถูกต้อง');
  const userId=String(user.id);let restored=0;
  const idSheets=[APP.SHEETS.BUDGETS,APP.SHEETS.GOALS,APP.SHEETS.ACCOUNTS,APP.SHEETS.ACCOUNT_LEDGER,APP.SHEETS.TRANSACTIONS,APP.SHEETS.RECURRING,V63_DAILY_LEDGER_SHEET];
  withLock_(function(){
    idSheets.forEach(function(name){
      const incoming=Array.isArray(backup.data[name])?backup.data[name]:[],existing=getRows_(name),ids={};
      existing.filter(function(r){return String(r.userId)===userId;}).forEach(function(r){if(r.id)ids[String(r.id)]=true;});
      incoming.forEach(function(r){
        const row=Object.assign({},r,{userId:user.id});delete row._row;
        if(row.id&&ids[String(row.id)])return;
        appendObject_(name,row);if(row.id)ids[String(row.id)]=true;restored++;
      });
    });

    const categoryIncoming=Array.isArray(backup.data[APP.SHEETS.CATEGORIES])?backup.data[APP.SHEETS.CATEGORIES]:[];
    const categoryRows=getRows_(APP.SHEETS.CATEGORIES).filter(function(r){return String(r.userId)===userId;});
    const categoryByKey={};categoryRows.forEach(function(r){categoryByKey[String(r.type||'')+'|'+String(r.name||'').trim()]=r;});
    categoryIncoming.forEach(function(r){
      const row=Object.assign({},r,{userId:user.id});delete row._row;
      const key=String(row.type||'')+'|'+String(row.name||'').trim(),current=categoryByKey[key];
      if(current){
        updateObject_(APP.SHEETS.CATEGORIES,current._row,{icon:row.icon||current.icon,updatedAt:row.updatedAt||current.updatedAt||now_()});
      }else{
        appendObject_(APP.SHEETS.CATEGORIES,row);categoryByKey[key]=row;
      }
      restored++;
    });

    const rateIncoming=Array.isArray(backup.data[APP.SHEETS.CURRENCY_RATES])?backup.data[APP.SHEETS.CURRENCY_RATES]:[];
    const rateRows=getRows_(APP.SHEETS.CURRENCY_RATES).filter(function(r){return String(r.userId)===userId;});
    const rateByCurrency={};rateRows.forEach(function(r){rateByCurrency[String(r.currency||'').toUpperCase()]=r;});
    rateIncoming.forEach(function(r){
      const row=Object.assign({},r,{userId:user.id});delete row._row;
      const key=String(row.currency||'').toUpperCase(),current=rateByCurrency[key];
      if(current)updateObject_(APP.SHEETS.CURRENCY_RATES,current._row,row);else appendObject_(APP.SHEETS.CURRENCY_RATES,row);
      restored++;
    });

    const snapshotIncoming=Array.isArray(backup.data[APP.SHEETS.NET_WORTH_SNAPSHOTS])?backup.data[APP.SHEETS.NET_WORTH_SNAPSHOTS]:[];
    const snapshotRows=getRows_(APP.SHEETS.NET_WORTH_SNAPSHOTS).filter(function(r){return String(r.userId)===userId;});
    const snapshotByDate={};snapshotRows.forEach(function(r){snapshotByDate[String(r.date||'')]=r;});
    snapshotIncoming.forEach(function(r){
      const row=Object.assign({},r,{userId:user.id});delete row._row;
      const key=String(row.date||''),current=snapshotByDate[key];
      if(current)updateObject_(APP.SHEETS.NET_WORTH_SNAPSHOTS,current._row,row);else appendObject_(APP.SHEETS.NET_WORTH_SNAPSHOTS,row);
      restored++;
    });

    const settingsIncoming=Array.isArray(backup.data[APP.SHEETS.FINANCE_SETTINGS])?backup.data[APP.SHEETS.FINANCE_SETTINGS]:[];
    if(settingsIncoming.length){
      const incoming=Object.assign({},settingsIncoming[0],{userId:user.id});delete incoming._row;
      const current=getRows_(APP.SHEETS.FINANCE_SETTINGS).find(function(r){return String(r.userId)===userId;});
      if(current)updateObject_(APP.SHEETS.FINANCE_SETTINGS,current._row,incoming);else appendObject_(APP.SHEETS.FINANCE_SETTINGS,incoming);restored++;
    }

    const walletIncoming=Array.isArray(backup.data[V63_DAILY_WALLET_SHEET])?backup.data[V63_DAILY_WALLET_SHEET]:[];
    if(walletIncoming.length){
      const incoming=Object.assign({},walletIncoming[0],{userId:user.id});delete incoming._row;
      const current=getRows_(V63_DAILY_WALLET_SHEET).find(function(r){return String(r.userId)===userId;});
      if(current)updateObject_(V63_DAILY_WALLET_SHEET,current._row,incoming);else appendObject_(V63_DAILY_WALLET_SHEET,incoming);restored++;
    }
  });
  ensureDefaultAccount_(user);SpreadsheetApp.flush();return {success:true,restored:restored,version:backup.version||'unknown'};
}
`;
  return code.trimEnd() + patch;
}

function makeLegacyCore(code) {
  const matches = [...code.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)];
  const totals = new Map();
  const seen = new Map();
  for (const match of matches) totals.set(match[1], (totals.get(match[1]) || 0) + 1);

  let pos = 0;
  let transformed = '';
  for (const match of matches) {
    const name = match[1];
    const n = (seen.get(name) || 0) + 1;
    seen.set(name, n);
    transformed += code.slice(pos, match.index);
    let declaration = match[0];
    if (n < totals.get(name)) {
      declaration = declaration.replace(`function ${name}(`, `function __legacy_old_${n}_${name}(`);
    }
    transformed += declaration;
    pos = match.index + match[0].length;
  }
  transformed += code.slice(pos);

  const imports = "import { SpreadsheetApp, Utilities, Session, CacheService, PropertiesService, LockService, DriveApp, DocumentApp, HtmlService, MimeType, Logger } from './gas-runtime.js';\n\n";
  const exports = `\n\n\n\nexport const legacyRpc = {\n  addCategory,\n  addTransaction,\n  adjustAccountBalance,\n  adjustDailyUseBalance,\n  adjustDailyWalletBalance,\n  changePassword,\n  deleteBudget,\n  deleteGoal,\n  deleteRecurring,\n  deleteSavingsAccount,\n  deleteTransaction,\n  exportBackupJson,\n  exportTransactionsCsv,\n  getAppData,\n  getBudgets,\n  getCalendarData,\n  getCategories,\n  getCurrencyRates,\n  getCurrentUser,\n  getDailyUseAccount,\n  getDailyWallet,\n  getDashboard,\n  getFastBootData,\n  getFinanceSettings,\n  getGoals,\n  getInstantSessionData,\n  getNotifications,\n  getRecurring,\n  getReportData,\n  getSavingsAccountDetail,\n  getSavingsOverview,\n  getSavingsSecurityStatus,\n  getSecurityCenterData,\n  getTransactions,\n  importTransactionsCsv,\n  login,\n  logout,\n  logoutOtherSessions,\n  markAllNotificationsRead,\n  markNotificationRead,\n  register,\n  restoreBackupJson,\n  runBackgroundMaintenance,\n  runDeferredInitialization,\n  saveBudget,\n  saveCurrencyRate,\n  saveFinanceSettings,\n  saveGoal,\n  saveRecurring,\n  saveSavingsAccount,\n  saveSavingsTransaction,\n  saveTransfer,\n  setDefaultAccount,\n  setSavingsPin,\n  toggleSavingsAccountHidden,\n  updateGoalAmount,\n  updateProfile,\n  updateTransaction,\n  verifySavingsPin\n};\nexport { setupApp };\n`;
  return imports + transformed.trimEnd() + exports;
}

function makePublicIndex(indexHtml) {
  const shim = `\n  <script>\n  // Cloudflare compatibility layer: preserves the original google.script.run API.\n  (function(){\n    function callRpc(method,args){\n      return fetch('/api/rpc',{\n        method:'POST',\n        headers:{'content-type':'application/json'},\n        credentials:'same-origin',\n        body:JSON.stringify({method:String(method),args:Array.from(args||[])})\n      }).then(async function(res){\n        let payload={};\n        try{payload=await res.json();}catch(e){}\n        if(!res.ok||payload.ok===false){\n          const msg=payload&&payload.error&&payload.error.message?payload.error.message:('HTTP '+res.status);\n          throw new Error(msg);\n        }\n        return payload.result;\n      });\n    }\n    function runner(success,failure){\n      return new Proxy({}, {\n        get:function(_target,prop){\n          if(prop==='then')return undefined;\n          if(prop==='withSuccessHandler')return function(fn){return runner(fn,failure);};\n          if(prop==='withFailureHandler')return function(fn){return runner(success,fn);};\n          return function(){\n            const args=arguments;\n            callRpc(prop,args).then(function(result){if(typeof success==='function')success(result);})\n              .catch(function(err){if(typeof failure==='function')failure({message:err.message});else console.error(err);});\n          };\n        }\n      });\n    }\n    window.google=window.google||{};\n    window.google.script=window.google.script||{};\n    Object.defineProperty(window.google.script,'run',{configurable:true,get:function(){return runner(null,null);}});\n  })();\n  </script>\n`;
  if (!indexHtml.includes('</head>')) throw new Error('Index.html has no </head>');
  return indexHtml.replace('</head>', shim + '\n</head>');
}

const originalCode = await readBundledSource('code');
const code = addCloudflareDataCompatibility(originalCode);
const index = await readBundledSource('index');

await mkdir(join(root, 'legacy'), { recursive: true });
await mkdir(join(root, 'src'), { recursive: true });
await mkdir(join(root, 'public'), { recursive: true });

await writeFile(join(root, 'legacy', 'Code.gs'), code);
await writeFile(join(root, 'legacy', 'Index.html'), index);
await writeFile(join(root, 'src', 'legacy-core.js'), makeLegacyCore(code));
await writeFile(join(root, 'public', 'index.html'), makePublicIndex(index));

console.log('Generated legacy sources with Cloudflare data compatibility patches');
