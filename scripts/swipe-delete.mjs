import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = join(root, 'public', 'index.html');
const swPath = join(root, 'public', 'sw.js');
let html = await readFile(indexPath, 'utf8');

if (!html.includes('MONEYFLOW_SWIPE_DELETE_V1')) {
  const css = `
<style id="moneyflow-swipe-delete-css">
  #mfUndoBar{display:none!important}
  [data-mf-swipe-tx-id]{touch-action:pan-y;will-change:transform}
  [data-mf-swipe-tx-id].mf-swipe-active{position:relative;z-index:2}
  [data-mf-swipe-tx-id].mf-swipe-ready{box-shadow:0 0 0 2px rgba(239,68,68,.18),0 12px 28px rgba(239,68,68,.16)!important}
  #mfSwipeDeleteHint{position:fixed;left:50%;bottom:calc(92px + env(safe-area-inset-bottom));transform:translate(-50%,12px);z-index:100090;padding:10px 14px;border-radius:999px;background:#b91c1c;color:#fff;font-size:12px;font-weight:850;box-shadow:0 14px 30px rgba(127,29,29,.28);opacity:0;pointer-events:none;transition:.14s ease;white-space:nowrap}
  #mfSwipeDeleteHint.show{opacity:1;transform:translate(-50%,0)}
  @media(min-width:700px){#mfSwipeDeleteHint{bottom:28px}}
  @media(prefers-reduced-motion:reduce){[data-mf-swipe-tx-id],#mfSwipeDeleteHint{transition:none!important}}
</style>`;
  html = html.replace('</head>', css + '\n</head>');

  const runtime = `
<script>
/* MONEYFLOW_SWIPE_DELETE_V1 */
(function(){
  const SWIPE_THRESHOLD=84;
  const SWIPE_MAX=132;
  const pendingDeletes=new Map();
  let swipe=null;
  let decorateTimer=null;
  const rowSelector='.transaction-item,.transaction-row,.transaction-card,.tx-item,.activity-item,.list-item,[data-transaction-id],[data-tx-id],tr';

  function el(id){return document.getElementById(id)}
  function rowsNow(){try{return Array.isArray(CURRENT_TRANSACTIONS)?CURRENT_TRANSACTIONS:[]}catch(e){return []}}
  function setSync(state,text){const pill=el('mfSyncStatus');if(!pill)return;pill.dataset.state=state;pill.textContent=text}
  function hideUndo(){const bar=el('mfUndoBar');if(bar)bar.classList.remove('show')}
  function ensureHint(){let hint=el('mfSwipeDeleteHint');if(!hint){hint=document.createElement('div');hint.id='mfSwipeDeleteHint';hint.textContent='🗑️ ปล่อยเพื่อลบ';document.body.appendChild(hint)}return hint}
  function showHint(ready){const hint=ensureHint();hint.textContent=ready?'🗑️ ปล่อยเพื่อลบ':'ปัดอีกนิดเพื่อลบ';hint.classList.add('show')}
  function hideHint(){el('mfSwipeDeleteHint')?.classList.remove('show')}
  function vibrate(pattern){try{if(navigator.vibrate)navigator.vibrate(pattern)}catch(e){}}
  function updateCaches(rows){
    try{CURRENT_TRANSACTIONS=rows}catch(e){}
    try{if(typeof CACHE==='object'&&CACHE){CACHE.transactions=rows;if(CACHE.at)CACHE.at.transactions=0}}catch(e){}
  }
  function renderRows(rows){try{if(typeof renderTransactions==='function')renderTransactions(rows)}catch(e){}}
  function refreshRelated(result){
    try{if(typeof CACHE==='object'&&CACHE){if(CACHE.at){CACHE.at.dashboard=0;CACHE.at.savings=0}CACHE.reports={}}}catch(e){}
    if(result&&result.offline){setSync('offline','● ลบแล้วในเครื่อง • รอซิงก์');return}
    setSync('saved','✓ ลบแล้ว');
    try{if(el('page-dashboard')?.classList.contains('active')&&typeof loadDashboard==='function')loadDashboard(true)}catch(e){}
  }
  function restoreDelete(id,snapshot,error){
    pendingDeletes.delete(id);
    if(snapshot&&Array.isArray(snapshot.rows)){
      const current=rowsNow();
      const already=current.some(row=>String(row&&row.id)===id);
      if(!already){updateCaches(snapshot.rows.slice());if(el('page-transactions')?.classList.contains('active'))renderRows(snapshot.rows.slice())}
    }
    setSync('saved','! ลบไม่สำเร็จ');
    try{if(typeof serverError==='function')serverError(error);else if(typeof toast==='function')toast('ลบรายการไม่สำเร็จ','error')}catch(e){}
  }

  window.removeTransaction=function(id){
    id=String(id==null?'':id);
    if(!id||pendingDeletes.has(id))return;
    hideUndo();
    const oldRows=rowsNow().slice();
    const row=oldRows.find(item=>String(item&&item.id)===id)||null;
    const snapshot={id,row,rows:oldRows};
    pendingDeletes.set(id,snapshot);
    if(row){
      const next=oldRows.filter(item=>String(item&&item.id)!==id);
      updateCaches(next);
      if(el('page-transactions')?.classList.contains('active'))renderRows(next);
    }
    try{if(typeof closeModal==='function')closeModal('transactionModal')}catch(e){}
    setSync('syncing','↻ กำลังลบ...');
    google.script.run
      .withSuccessHandler(function(result){
        pendingDeletes.delete(id);
        refreshRelated(result);
        try{if(typeof toast==='function')toast(result&&result.offline?'ลบแล้วในเครื่อง • จะซิงก์เมื่อออนไลน์':'ลบรายการแล้ว','success')}catch(e){}
      })
      .withFailureHandler(function(error){restoreDelete(id,snapshot,error)})
      .deleteTransaction(TOKEN,id);
  };

  function exactIdFromSource(source,ids){
    source=String(source||'');
    for(const id of ids){
      if(source.includes("'"+id+"'")||source.includes('"'+id+'"'))return id;
      const escaped=id.replace(/[.*+?^$()|[\]\\]/g,'\\$&');
      try{if(new RegExp('(?:\\(|,)\\s*'+escaped+'\\s*(?:\\)|,)').test(source))return id}catch(e){}
    }
    return '';
  }
  function nearestRow(node,page){
    let current=node;
    for(let i=0;i<6&&current&&current!==page;i++,current=current.parentElement){
      try{if(current.matches(rowSelector))return current}catch(e){}
    }
    current=node;
    for(let i=0;i<4&&current&&current.parentElement&&current.parentElement!==page;i++,current=current.parentElement){
      const rect=current.getBoundingClientRect?.();
      if(rect&&rect.width>180&&rect.height>34&&rect.height<220)return current;
    }
    return node.closest?.(rowSelector)||null;
  }
  function tagRow(node,id){if(!node||!id)return;node.dataset.mfSwipeTxId=String(id);node.setAttribute('data-mf-swipe-tx-id',String(id))}
  function decorateSwipeRows(rows){
    rows=Array.isArray(rows)?rows:rowsNow();
    if(!rows.length)return;
    const page=el('page-transactions')||document.body;
    if(!page)return;
    const ids=rows.map(row=>String(row&&row.id||'')).filter(Boolean).sort((a,b)=>b.length-a.length);
    const idSet=new Set(ids);
    page.querySelectorAll('[data-transaction-id],[data-tx-id],[data-id]').forEach(node=>{
      const id=String(node.getAttribute('data-transaction-id')||node.getAttribute('data-tx-id')||node.getAttribute('data-id')||'');
      if(idSet.has(id))tagRow(nearestRow(node,page)||node,id);
    });
    page.querySelectorAll('[onclick]').forEach(node=>{
      const src=node.getAttribute('onclick')||'';
      if(!/transaction|remove|edit|open/i.test(src))return;
      const id=exactIdFromSource(src,ids);
      if(id)tagRow(nearestRow(node,page)||node,id);
    });
    for(const selector of ['#transactionList','#transactionsList','#transaction-list','#transactions-list','.transaction-list','.transactions-list']){
      const list=page.querySelector(selector);if(!list)continue;
      const children=[...list.children].filter(node=>node.nodeType===1);
      if(children.length===rows.length)children.forEach((node,index)=>tagRow(node,String(rows[index]&&rows[index].id||'')));
    }
  }
  function scheduleDecorate(rows){clearTimeout(decorateTimer);decorateTimer=setTimeout(()=>decorateSwipeRows(rows),0)}

  const originalRender=window.renderTransactions;
  if(typeof originalRender==='function'&&!originalRender.__moneyflowSwipeDelete){
    const wrapped=function(rows,...rest){const out=originalRender.call(this,rows,...rest);scheduleDecorate(Array.isArray(rows)?rows:rowsNow());return out};
    wrapped.__moneyflowSwipeDelete=true;
    window.renderTransactions=wrapped;
  }

  function resetSwipe(animated){
    if(!swipe)return;
    const row=swipe.row;
    if(row){
      row.classList.remove('mf-swipe-active','mf-swipe-ready');
      if(animated){row.style.transition='transform .16s ease,opacity .16s ease';row.style.transform='translateX(0)';row.style.opacity='1';setTimeout(()=>{row.style.transition='';row.style.transform='';row.style.opacity=''},180)}
      else{row.style.transition='';row.style.transform='';row.style.opacity=''}
    }
    swipe=null;hideHint();
  }
  function onPointerDown(event){
    if(event.pointerType==='mouse'||event.button!=null&&event.button!==0)return;
    if(event.target.closest?.('button,a,input,select,textarea,label,[role="button"]'))return;
    const row=event.target.closest?.('[data-mf-swipe-tx-id]');if(!row)return;
    swipe={row,id:String(row.dataset.mfSwipeTxId||''),pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,dx:0,horizontal:false,ready:false,canceled:false};
    row.classList.add('mf-swipe-active');row.style.transition='none';
    try{row.setPointerCapture(event.pointerId)}catch(e){}
  }
  function onPointerMove(event){
    if(!swipe||event.pointerId!==swipe.pointerId||swipe.canceled)return;
    const dx=event.clientX-swipe.startX,dy=event.clientY-swipe.startY,ax=Math.abs(dx),ay=Math.abs(dy);
    if(!swipe.horizontal){
      if(ay>12&&ay>ax*1.15){swipe.canceled=true;resetSwipe(false);return}
      if(ax<10||ax<=ay*1.2)return;
      swipe.horizontal=true;
    }
    event.preventDefault();
    swipe.dx=dx;
    const limited=Math.max(-SWIPE_MAX,Math.min(SWIPE_MAX,dx));
    swipe.row.style.transform='translateX('+limited+'px)';
    const ready=ax>=SWIPE_THRESHOLD;
    if(ready!==swipe.ready){swipe.ready=ready;swipe.row.classList.toggle('mf-swipe-ready',ready);if(ready)vibrate(16)}
    showHint(ready);
  }
  function onPointerUp(event){
    if(!swipe||event.pointerId!==swipe.pointerId)return;
    const current=swipe;
    if(current.horizontal&&Math.abs(current.dx)>=SWIPE_THRESHOLD&&current.id){
      current.row.style.transition='transform .13s ease,opacity .13s ease';
      current.row.style.transform='translateX('+(current.dx<0?'-110vw':'110vw')+')';
      current.row.style.opacity='0';
      hideHint();vibrate(24);swipe=null;
      requestAnimationFrame(()=>window.removeTransaction(current.id));
      return;
    }
    resetSwipe(true);
  }
  function onPointerCancel(event){if(swipe&&event.pointerId===swipe.pointerId)resetSwipe(true)}

  document.addEventListener('pointerdown',onPointerDown,true);
  document.addEventListener('pointermove',onPointerMove,{capture:true,passive:false});
  document.addEventListener('pointerup',onPointerUp,true);
  document.addEventListener('pointercancel',onPointerCancel,true);

  function observeTransactions(){
    const page=el('page-transactions');if(!page)return;
    new MutationObserver(()=>scheduleDecorate(rowsNow())).observe(page,{childList:true,subtree:true});
    scheduleDecorate(rowsNow());
  }
  document.addEventListener('DOMContentLoaded',()=>{hideUndo();ensureHint();observeTransactions()},{once:true});
  if(document.readyState!=='loading'){hideUndo();ensureHint();observeTransactions()}
})();
</script>`;
  html = html.replace('</body>', runtime + '\n</body>');
  await writeFile(indexPath, html);
}

try {
  let sw = await readFile(swPath, 'utf8');
  sw = sw.replace(/moneyflow-shell-v\d+/g, 'moneyflow-shell-v4');
  await writeFile(swPath, sw);
} catch {}

console.log('Applied immediate swipe-to-delete transaction UX and bumped PWA shell cache');
