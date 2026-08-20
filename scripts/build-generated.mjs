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

const code = await readBundledSource('code');
const index = await readBundledSource('index');

await mkdir(join(root, 'legacy'), { recursive: true });
await mkdir(join(root, 'src'), { recursive: true });
await mkdir(join(root, 'public'), { recursive: true });

await writeFile(join(root, 'legacy', 'Code.gs'), code);
await writeFile(join(root, 'legacy', 'Index.html'), index);
await writeFile(join(root, 'src', 'legacy-core.js'), makeLegacyCore(code));
await writeFile(join(root, 'public', 'index.html'), makePublicIndex(index));

console.log('Generated exact legacy sources and Cloudflare runtime files');
