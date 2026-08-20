import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = join(root, 'public', 'index.html');
let html = await readFile(indexPath, 'utf8');

if (!html.includes('MONEYFLOW_RUNTIME_FIX_V1')) {
  const flushRuntime = `
<script>
/* MONEYFLOW_RUNTIME_FIX_V1 */
(function(){
  const KEY='moneyflow_offline_queue_v1';
  let flushing=false;
  function setPill(state,text){const pill=document.getElementById('mfSyncStatus');if(!pill)return;pill.dataset.state=state;pill.textContent=text}
  function readQueue(){try{return JSON.parse(localStorage.getItem(KEY)||'[]')||[]}catch(e){return []}}
  function saveQueue(rows){try{localStorage.setItem(KEY,JSON.stringify(rows||[]))}catch(e){}}
  async function direct(method,args){
    const res=await fetch('/api/rpc',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify({method:String(method),args:Array.from(args||[])})});
    let payload={};try{payload=await res.json()}catch(e){}
    if(!res.ok||payload.ok===false)throw new Error(payload&&payload.error&&payload.error.message?payload.error.message:('HTTP '+res.status));
    return payload.result;
  }
  window.__moneyflowFlushQueue=async function(){
    if(flushing||navigator.onLine===false)return;
    let rows=readQueue();
    if(!rows.length){setPill('saved','✓ บันทึกแล้ว');return}
    flushing=true;setPill('syncing','↻ ซิงก์ '+rows.length+' รายการ...');
    try{
      while(rows.length&&navigator.onLine!==false){
        const item=rows[0];
        const result=await direct(item.method,item.args);
        rows.shift();saveQueue(rows);
        try{if(typeof window.__moneyflowRpcCompleted==='function')window.__moneyflowRpcCompleted(String(item.method),result)}catch(e){}
      }
      if(!rows.length){setPill('saved','✓ ซิงก์ครบแล้ว');try{if(typeof manualRefreshAll==='function')setTimeout(manualRefreshAll,120)}catch(e){}}
      else setPill('offline','● รอซิงก์ '+rows.length+' รายการ');
    }catch(error){
      console.warn('MoneyFlow offline queue sync stopped',error);
      setPill('offline','! ซิงก์ค้าง '+rows.length+' รายการ');
      try{if(typeof toast==='function')toast('ยังซิงก์รายการออฟไลน์ไม่ครบ: '+String(error&&error.message||error),'warning')}catch(e){}
    }finally{flushing=false}
  };
})();
</script>`;

  const marker = '<script>\n/* MONEYFLOW_PRODUCTION_POLISH_V1 */';
  if (!html.includes(marker)) throw new Error('Production polish runtime marker not found');
  html = html.replace(marker, flushRuntime + '\n' + marker);

  html = html.replaceAll('mfFlushQueue()', 'window.__moneyflowFlushQueue()');
  html = html.replaceAll('setTimeout(mfFlushQueue,700)', 'setTimeout(window.__moneyflowFlushQueue,700)');

  const unsafeNetworkQueue = "const networkLike=!mfOnline()||/failed to fetch|network|load failed/i.test(String(error&&error.message||error));\n      if(networkLike&&MF_OFFLINE_METHODS.has(m)){";
  const safeNetworkQueue = "const networkLike=!mfOnline()||/failed to fetch|network|load failed/i.test(String(error&&error.message||error));\n      if(!mfOnline()&&MF_OFFLINE_METHODS.has(m)){";
  if (html.includes(unsafeNetworkQueue)) html = html.replace(unsafeNetworkQueue, safeNetworkQueue);

  const varsNeedle = "let MF_HEALTH_LOADING = false;";
  if (html.includes(varsNeedle) && !html.includes('MF_ORIGINAL_REMOVE_TRANSACTION')) {
    html = html.replace(varsNeedle, varsNeedle + "\n  const MF_ORIGINAL_REMOVE_TRANSACTION=window.removeTransaction;");
  }
  html = html.replace(
    "const oldRows=(CURRENT_TRANSACTIONS||[]).slice();const row=oldRows.find(x=>String(x.id)===String(id));if(!row)return;",
    "const oldRows=(CURRENT_TRANSACTIONS||[]).slice();const row=oldRows.find(x=>String(x.id)===String(id));if(!row){if(typeof MF_ORIGINAL_REMOVE_TRANSACTION==='function')return MF_ORIGINAL_REMOVE_TRANSACTION(id);return;}"
  );

  html = html.replace(
    "google.script.run.withSuccessHandler(()=>{CACHE.at.dashboard=0;CACHE.at.savings=0;CACHE.reports={};mfSetSync('saved','✓ ลบแล้ว');if(mfEl('page-dashboard')?.classList.contains('active'))loadDashboard(true)})",
    "google.script.run.withSuccessHandler((result)=>{CACHE.at.dashboard=0;CACHE.at.savings=0;CACHE.reports={};if(result&&result.offline)mfSetSync('offline','● รอซิงก์ '+mfQueue().length+' รายการ',true);else mfSetSync('saved','✓ ลบแล้ว');if(mfEl('page-dashboard')?.classList.contains('active')&&!(result&&result.offline))loadDashboard(true)})"
  );

  await writeFile(indexPath, html);
}

console.log('Applied MoneyFlow production runtime safety fixes');
