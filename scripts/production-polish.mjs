import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = join(root, 'public', 'index.html');
let html = await readFile(indexPath, 'utf8');

if (!html.includes('MONEYFLOW_PRODUCTION_POLISH_V1')) {
  const css = `
<style id="moneyflow-production-polish-css">
  .mf-sync-pill{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border-radius:999px;background:rgba(99,102,241,.10);color:#4f46e5;font-size:11px;font-weight:700;white-space:nowrap;transition:.2s ease}
  .mf-sync-pill[data-state="syncing"]{background:rgba(245,158,11,.12);color:#b45309}
  .mf-sync-pill[data-state="offline"]{background:rgba(239,68,68,.10);color:#b91c1c}
  .mf-sync-pill[data-state="saved"]{background:rgba(16,185,129,.12);color:#047857}
  .mf-account-tap-hint{display:inline-flex;align-items:center;gap:5px;margin-top:6px;color:var(--muted);font-size:11px}
  .mf-account-locked .savings-balance,.mf-account-locked .savings-account-main{cursor:pointer}
  .mf-account-locked .savings-balance:after{content:'  🔐 แตะเพื่อดูยอด';font-size:10px;font-weight:600;color:var(--muted)}
  .mf-health-card{margin-top:14px;border:1px solid var(--border);border-radius:18px;padding:14px;background:var(--card)}
  .mf-health-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
  .mf-health-title{font-weight:800}.mf-health-sub{font-size:11px;color:var(--muted);margin-top:3px;line-height:1.5}
  .mf-health-badge{padding:6px 9px;border-radius:999px;font-size:11px;font-weight:800;background:#ecfdf5;color:#047857}
  .mf-health-badge.warn{background:#fff7ed;color:#c2410c}.mf-health-badge.error{background:#fef2f2;color:#b91c1c}
  #mfUndoBar{position:fixed;left:50%;bottom:calc(94px + env(safe-area-inset-bottom));transform:translateX(-50%) translateY(16px);z-index:99999;min-width:min(92vw,420px);max-width:92vw;padding:12px 14px;border-radius:16px;background:#172033;color:#fff;box-shadow:0 18px 40px rgba(15,23,42,.28);display:flex;align-items:center;justify-content:space-between;gap:14px;opacity:0;pointer-events:none;transition:.2s ease}
  #mfUndoBar.show{opacity:1;pointer-events:auto;transform:translateX(-50%) translateY(0)}
  #mfUndoBar button{border:0;border-radius:10px;padding:8px 11px;background:#fff;color:#4f46e5;font-weight:800}
  .mf-dashboard-help{margin:8px 0 0;font-size:11px;color:var(--muted);line-height:1.5}
  .mf-offline-note{display:none;margin:8px 0 0;padding:9px 11px;border-radius:12px;background:#fff7ed;color:#9a3412;font-size:11px;line-height:1.5}
  body.mf-offline .mf-offline-note{display:block}
  .mf-saving-pending:after{content:' • รอซิงก์';color:#b45309;font-size:10px;font-weight:700}
  #transactionModal .mf-quick-row{display:flex;gap:7px;flex-wrap:wrap;margin:-2px 0 12px}
  #transactionModal .mf-quick-chip{border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:999px;padding:7px 10px;font-size:12px;font-weight:700}
  @media(max-width:699px){
    .mf-sync-pill{padding:6px 8px;font-size:10px}
    #transactionModal{align-items:flex-end;padding:0}
    #transactionModal .modal{width:100%;max-width:none;margin:0;border-radius:24px 24px 0 0;max-height:92vh;padding-bottom:calc(22px + env(safe-area-inset-bottom));animation:mfSheetUp .18s ease-out}
    #transactionAmount{font-size:28px!important;font-weight:800!important;min-height:56px!important;text-align:right}
    #transactionModal .btn.btn-primary{position:sticky;bottom:0;z-index:3;min-height:52px;font-size:16px;box-shadow:0 -8px 18px rgba(99,102,241,.08)}
    @keyframes mfSheetUp{from{transform:translateY(28px);opacity:.75}to{transform:none;opacity:1}}
  }
  @media(prefers-reduced-motion:reduce){*,*:before,*:after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
  body.dark .mf-sync-pill{background:#242b3d;color:#c7d2fe}body.dark .mf-health-card{background:#171d2a}body.dark #mfUndoBar{background:#0f172a}
</style>`;
  html = html.replace('</head>', css + '\n</head>');

  const runtime = `
<script>
/* MONEYFLOW_PRODUCTION_POLISH_V1 */
(function(){
  const MF_OFFLINE_METHODS = new Set(['addTransaction','updateTransaction','deleteTransaction']);
  const MF_QUEUE_KEY = 'moneyflow_offline_queue_v1';
  const MF_LAST_PREF_KEY = 'moneyflow_quick_pref_v1';
  let MF_PENDING_DETAIL_ID = '';
  let MF_DELETE_TIMER = null;
  let MF_DELETE_SNAPSHOT = null;
  let MF_SYNC_RESET_TIMER = null;
  let MF_HEALTH_LOADING = false;

  function mfEl(id){return document.getElementById(id)}
  function mfJsonGet(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'')||fallback}catch(e){return fallback}}
  function mfJsonSet(key,val){try{localStorage.setItem(key,JSON.stringify(val))}catch(e){}}
  function mfOnline(){return navigator.onLine !== false}

  function mfEnsureChrome(){
    const actions=document.querySelector('.top-actions');
    if(actions&&!mfEl('mfSyncStatus')){
      const pill=document.createElement('span');pill.id='mfSyncStatus';pill.className='mf-sync-pill';pill.dataset.state='saved';pill.textContent='✓ พร้อมใช้งาน';
      const refresh=mfEl('refreshDataBtn');if(refresh&&refresh.parentNode===actions)actions.insertBefore(pill,refresh.nextSibling);else actions.prepend(pill);
    }
    if(!mfEl('mfUndoBar')){const bar=document.createElement('div');bar.id='mfUndoBar';bar.innerHTML='<span id="mfUndoText">ลบรายการแล้ว</span><button type="button" id="mfUndoBtn">ย้อนกลับ</button>';document.body.appendChild(bar);mfEl('mfUndoBtn').onclick=mfUndoDelete;}
    if(!mfEl('mfOfflineNote')){const dash=document.querySelector('#page-dashboard .balance-card');if(dash){const note=document.createElement('div');note.id='mfOfflineNote';note.className='mf-offline-note';note.textContent='ออฟไลน์อยู่ • ดูข้อมูลล่าสุดที่บันทึกไว้ในเครื่องได้ และรายการใหม่จะรอซิงก์เมื่อกลับมาออนไลน์';dash.insertAdjacentElement('afterend',note);}}
  }

  function mfSetSync(state,text,sticky){
    mfEnsureChrome();const pill=mfEl('mfSyncStatus');if(!pill)return;clearTimeout(MF_SYNC_RESET_TIMER);pill.dataset.state=state||'saved';pill.textContent=text||'✓ บันทึกแล้ว';
    if(!sticky&&state!=='offline')MF_SYNC_RESET_TIMER=setTimeout(()=>{if(mfOnline()){pill.dataset.state='saved';pill.textContent='✓ บันทึกแล้ว'}},2200);
  }

  function mfSetNetworkState(){document.body.classList.toggle('mf-offline',!mfOnline());if(mfOnline()){mfSetSync('syncing','↻ กำลังซิงก์...',true);mfFlushQueue();}else mfSetSync('offline','● ออฟไลน์',true)}

  function mfQueue(){return mfJsonGet(MF_QUEUE_KEY,[])}
  function mfSaveQueue(rows){mfJsonSet(MF_QUEUE_KEY,rows)}
  function mfQueueRpc(method,args){const rows=mfQueue();const id='q_'+Date.now()+'_'+Math.random().toString(16).slice(2);rows.push({id,method:String(method),args:Array.from(args||[]),createdAt:new Date().toISOString()});mfSaveQueue(rows);mfSetSync('offline','● รอซิงก์ '+rows.length+' รายการ',true);return {queued:true,offline:true,queueId:id}}

  async function mfDirectRpc(method,args){
    const res=await fetch('/api/rpc',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify({method:String(method),args:Array.from(args||[])})});
    let payload={};try{payload=await res.json()}catch(e){}
    if(!res.ok||payload.ok===false){const msg=payload&&payload.error&&payload.error.message?payload.error.message:('HTTP '+res.status);throw new Error(msg)}
    return payload.result;
  }

  window.__moneyflowRpcTransport = async function(method,args){
    const m=String(method||'');
    if(!mfOnline()&&MF_OFFLINE_METHODS.has(m)){
      const queued=mfQueueRpc(m,args);setTimeout(()=>{if(typeof toast==='function')toast('บันทึกไว้ในเครื่องแล้ว • จะซิงก์เมื่อออนไลน์','warning')},40);return queued;
    }
    try{
      const result=await mfDirectRpc(m,args);
      try{if(typeof window.__moneyflowRpcCompleted==='function')window.__moneyflowRpcCompleted(m,result)}catch(e){}
      return result;
    }catch(error){
      const networkLike=!mfOnline()||/failed to fetch|network|load failed/i.test(String(error&&error.message||error));
      if(networkLike&&MF_OFFLINE_METHODS.has(m)){
        const queued=mfQueueRpc(m,args);setTimeout(()=>{if(typeof toast==='function')toast('เน็ตหลุด • เก็บรายการไว้รอซิงก์แล้ว','warning')},40);return queued;
      }
      throw error;
    }
  };

  const originalRpcDone=window.__moneyflowRpcCompleted;
  window.__moneyflowRpcCompleted=function(method,result){
    if(typeof originalRpcDone==='function')try{originalRpcDone(method,result)}catch(e){}
    const m=String(method||'');
    if(MF_OFFLINE_METHODS.has(m)){
      if(result&&result.offline)mfSetSync('offline','● รอซิงก์ '+mfQueue().length+' รายการ',true);
      else mfSetSync('saved','✓ บันทึกแล้ว');
    }
  };

  const oldOpenSavingsDetail=window.openSavingsDetail;
  if(typeof oldOpenSavingsDetail==='function'){
    window.openSavingsDetail=function(id){
      if(typeof SAVINGS_MASK_ALL!=='undefined'&&SAVINGS_MASK_ALL&&!(Date.now()<Number(SAVINGS_UNLOCKED_UNTIL||0))){
        MF_PENDING_DETAIL_ID=String(id||'');
        try{
          const loaded=!!(SAVINGS_PIN_STATUS&&SAVINGS_PIN_STATUS.loaded);
          const hasPin=loaded?!!SAVINGS_PIN_STATUS.hasPin:true;
          openSavingsPinModal(hasPin?'verify':'setup');
          if(!loaded){
            google.script.run.withSuccessHandler(function(status){
              SAVINGS_PIN_STATUS={loaded:true,hasPin:!!(status&&status.hasPin)};
              if(!SAVINGS_PIN_STATUS.hasPin&&MF_PENDING_DETAIL_ID)openSavingsPinModal('setup');
              if(typeof saveLocalSnapshot==='function')saveLocalSnapshot();
            }).withFailureHandler(function(){}).getSavingsSecurityStatus(TOKEN);
          }
        }catch(e){openSavingsPinForReveal()}
        return;
      }
      return oldOpenSavingsDetail(id);
    };
  }
  const oldApplySavingsMask=window.applySavingsMask;
  if(typeof oldApplySavingsMask==='function'){
    window.applySavingsMask=function(hidden){const result=oldApplySavingsMask(hidden);if(!hidden&&MF_PENDING_DETAIL_ID){const id=MF_PENDING_DETAIL_ID;MF_PENDING_DETAIL_ID='';setTimeout(()=>oldOpenSavingsDetail&&oldOpenSavingsDetail(id),60)}return result};
  }

  const oldRenderSavings=window.renderSavings;
  if(typeof oldRenderSavings==='function'){
    window.renderSavings=function(data){const result=oldRenderSavings(data);const box=mfEl('savingsAccountList');if(box){box.classList.toggle('mf-account-locked',!!SAVINGS_MASK_ALL);box.querySelectorAll('.savings-account-card').forEach(card=>{card.setAttribute('role','button');card.setAttribute('tabindex','0')})}mfRenderHealthCard();return result};
  }

  const oldOpenTx=window.openTransactionModal;
  if(typeof oldOpenTx==='function')window.openTransactionModal=function(pref){pref=Object.assign({},pref||{});const saved=mfJsonGet(MF_LAST_PREF_KEY,{});if(!pref.accountId&&saved.accountId)pref.accountId=saved.accountId;if(!pref.type&&saved.type)pref.type=saved.type;const out=oldOpenTx(pref);setTimeout(()=>{try{if(saved.category&&mfEl('transactionCategory')){const ok=[...mfEl('transactionCategory').options].some(o=>o.value===saved.category);if(ok)mfEl('transactionCategory').value=saved.category}if(saved.paymentMethod&&mfEl('paymentMethod'))mfEl('paymentMethod').value=saved.paymentMethod;mfInjectQuickAmounts();const a=mfEl('transactionAmount');if(a){a.focus();a.select()}}catch(e){}},70);return out};
  const oldSaveTx=window.saveTransaction;
  if(typeof oldSaveTx==='function')window.saveTransaction=function(){try{mfJsonSet(MF_LAST_PREF_KEY,{type:mfEl('transactionType')&&mfEl('transactionType').value,accountId:mfEl('transactionAccount')&&mfEl('transactionAccount').value,category:mfEl('transactionCategory')&&mfEl('transactionCategory').value,paymentMethod:mfEl('paymentMethod')&&mfEl('paymentMethod').value})}catch(e){}mfSetSync('syncing','↻ กำลังบันทึก...',true);return oldSaveTx()};

  function mfInjectQuickAmounts(){const modal=mfEl('transactionModal');if(!modal||modal.querySelector('.mf-quick-row'))return;const amount=mfEl('transactionAmount');if(!amount)return;const row=document.createElement('div');row.className='mf-quick-row';[20,50,100,200,500].forEach(n=>{const b=document.createElement('button');b.type='button';b.className='mf-quick-chip';b.textContent='฿'+n;b.onclick=()=>{amount.value=n;amount.focus()};row.appendChild(b)});amount.closest('.field')?.insertAdjacentElement('afterend',row)}

  window.removeTransaction=function(id){
    if(MF_DELETE_TIMER){clearTimeout(MF_DELETE_TIMER);MF_DELETE_TIMER=null;mfCommitDelete()}
    const oldRows=(CURRENT_TRANSACTIONS||[]).slice();const row=oldRows.find(x=>String(x.id)===String(id));if(!row)return;
    MF_DELETE_SNAPSHOT={id,row,rows:oldRows};CURRENT_TRANSACTIONS=oldRows.filter(x=>String(x.id)!==String(id));CACHE.transactions=CURRENT_TRANSACTIONS;CACHE.at.transactions=0;if(mfEl('page-transactions')?.classList.contains('active'))renderTransactions(CURRENT_TRANSACTIONS);closeModal('transactionModal');
    const bar=mfEl('mfUndoBar');mfEl('mfUndoText').textContent='ลบ “'+String(row.description||row.category||'รายการ')+'” แล้ว';bar.classList.add('show');
    MF_DELETE_TIMER=setTimeout(mfCommitDelete,7000);
  };
  function mfUndoDelete(){if(!MF_DELETE_SNAPSHOT)return;clearTimeout(MF_DELETE_TIMER);MF_DELETE_TIMER=null;CURRENT_TRANSACTIONS=MF_DELETE_SNAPSHOT.rows.slice();CACHE.transactions=CURRENT_TRANSACTIONS;if(mfEl('page-transactions')?.classList.contains('active'))renderTransactions(CURRENT_TRANSACTIONS);MF_DELETE_SNAPSHOT=null;mfEl('mfUndoBar')?.classList.remove('show');if(typeof toast==='function')toast('ยกเลิกการลบแล้ว','success')}
  function mfCommitDelete(){const snap=MF_DELETE_SNAPSHOT;MF_DELETE_SNAPSHOT=null;MF_DELETE_TIMER=null;mfEl('mfUndoBar')?.classList.remove('show');if(!snap)return;mfSetSync('syncing','↻ กำลังลบ...',true);google.script.run.withSuccessHandler(()=>{CACHE.at.dashboard=0;CACHE.at.savings=0;CACHE.reports={};mfSetSync('saved','✓ ลบแล้ว');if(mfEl('page-dashboard')?.classList.contains('active'))loadDashboard(true)}).withFailureHandler(error=>{CURRENT_TRANSACTIONS=snap.rows;CACHE.transactions=snap.rows;if(mfEl('page-transactions')?.classList.contains('active'))renderTransactions(snap.rows);serverError(error)}).deleteTransaction(TOKEN,snap.id)}

  function mfClarifyDashboard(){
    const map=[['dashNetWorth','มูลค่าสุทธิ','รวมเฉพาะบัญชีที่ตั้งให้ “รวมในมูลค่าสุทธิ”'],['dashSavingsBalance','เงินเก็บ','ยอดรวมบัญชีประเภทเงินเก็บ'],['dashInvestmentBalance','การลงทุน','ยอดรวมบัญชีประเภทการลงทุน'],['monthBalance','สุทธิเดือนนี้','รายรับเดือนนี้ − รายจ่ายเดือนนี้']];
    map.forEach(([id,label,help])=>{const node=mfEl(id);if(!node)return;const card=node.closest('.professional-mini,.stat-card,.card');if(card){card.title=help;const small=card.querySelector('small');if(small)small.textContent=label}});
    const balance=mfEl('totalBalance');if(balance&&balance.parentElement&&!balance.parentElement.querySelector('.mf-dashboard-help')){const p=document.createElement('div');p.className='mf-dashboard-help';p.textContent='เงินพร้อมใช้ = เงินใช้ประจำวันและบัญชีสภาพคล่องที่ระบบนับเป็นเงินพร้อมใช้';balance.parentElement.appendChild(p)}
  }
  const oldRenderDashboard=window.renderDashboard;if(typeof oldRenderDashboard==='function')window.renderDashboard=function(data){const out=oldRenderDashboard(data);mfClarifyDashboard();return out};

  function mfRenderHealthCard(){const page=mfEl('page-savings');if(!page||mfEl('mfAccountingHealth'))return;const box=document.createElement('div');box.id='mfAccountingHealth';box.className='mf-health-card';box.innerHTML='<div class="mf-health-row"><div><div class="mf-health-title">🩺 ความถูกต้องของยอดบัญชี</div><div id="mfHealthSub" class="mf-health-sub">ตรวจยอดบัญชีกับ Ledger และเงินใช้ประจำวัน</div></div><div style="display:flex;align-items:center;gap:8px"><span id="mfHealthBadge" class="mf-health-badge">รอตรวจ</span><button type="button" class="btn btn-light" style="width:auto;padding:8px 10px" id="mfHealthBtn">ตรวจ</button></div></div>';const list=mfEl('savingsAccountList');if(list)list.insertAdjacentElement('beforebegin',box);else page.appendChild(box);mfEl('mfHealthBtn').onclick=mfLoadAccountingHealth}
  function mfLoadAccountingHealth(){if(MF_HEALTH_LOADING)return;MF_HEALTH_LOADING=true;mfEl('mfHealthBadge').textContent='กำลังตรวจ...';google.script.run.withSuccessHandler(data=>{MF_HEALTH_LOADING=false;const badge=mfEl('mfHealthBadge'),sub=mfEl('mfHealthSub');const issues=(data&&data.issues)||[];badge.className='mf-health-badge'+(issues.length?' warn':'');badge.textContent=issues.length?'พบ '+issues.length+' จุด':'✓ ยอดสอดคล้อง';sub.textContent=issues.length?issues.map(x=>x.message).slice(0,2).join(' • '):'Daily Wallet และยอดบัญชีที่มี Ledger ตรงกัน'}).withFailureHandler(error=>{MF_HEALTH_LOADING=false;mfEl('mfHealthBadge').className='mf-health-badge error';mfEl('mfHealthBadge').textContent='ตรวจไม่สำเร็จ';serverError(error)}).getAccountingHealth(TOKEN)}

  const oldOpenPage=window.openPage;if(typeof oldOpenPage==='function')window.openPage=function(page){const out=oldOpenPage(page);if(page==='savings')setTimeout(()=>{mfRenderHealthCard();mfLoadAccountingHealth()},180);return out};

  addEventListener('online',mfSetNetworkState);addEventListener('offline',mfSetNetworkState);document.addEventListener('DOMContentLoaded',()=>{mfEnsureChrome();mfSetNetworkState();mfClarifyDashboard();mfRenderHealthCard();setTimeout(mfFlushQueue,700)},{once:true});
  if(document.readyState!=='loading'){mfEnsureChrome();mfSetNetworkState();mfClarifyDashboard();mfRenderHealthCard();setTimeout(mfFlushQueue,700)}
})();
</script>`;
  html = html.replace('</body>', runtime + '\n</body>');

  const callRpcNeedle = "function callRpc(method,args){\n      return fetch('/api/rpc',{";
  if (html.includes(callRpcNeedle) && !html.includes('window.__moneyflowRpcTransport(method,args)')) {
    html = html.replace(callRpcNeedle, "function callRpc(method,args){\n      if(typeof window.__moneyflowRpcTransport==='function')return window.__moneyflowRpcTransport(method,args);\n      return fetch('/api/rpc',{");
  }

  await writeFile(indexPath, html);
}

console.log('Applied MoneyFlow production polish: account PIN reveal, quick add, undo, sync/offline UX, health UI');
