import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'public');
const indexPath = join(publicDir, 'index.html');
const iconDir = join(publicDir, 'icons');

const MUTATING_METHODS = [
  'addCategory','addTransaction','adjustAccountBalance','adjustDailyUseBalance','adjustDailyWalletBalance',
  'changePassword','deleteBudget','deleteGoal','deleteRecurring','deleteSavingsAccount','deleteTransaction',
  'importTransactionsCsv','logout','logoutOtherSessions','markAllNotificationsRead','markNotificationRead',
  'register','restoreBackupJson','saveBudget','saveCurrencyRate','saveFinanceSettings','saveGoal','saveRecurring',
  'saveSavingsAccount','saveSavingsTransaction','saveTransfer','setDefaultAccount','setSavingsPin',
  'toggleSavingsAccountHidden','updateGoalAmount','updateProfile','updateTransaction'
];

function injectBefore(html, marker, content) {
  if (!html.includes(marker)) throw new Error(`Missing HTML marker: ${marker}`);
  return html.replace(marker, `${content}\n${marker}`);
}

function enhanceHtml(html) {
  if (!html.includes('name="moneyflow-pwa"')) {
    const head = `
  <meta name="moneyflow-pwa" content="1">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="application-name" content="MoneyFlow">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="MoneyFlow">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="format-detection" content="telephone=no">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png">
  <link rel="apple-touch-icon" href="/icons/icon-192.png">
  <style>
    img,svg,canvas{max-width:100%;height:auto}
    .icon-btn.install-btn{display:none}
    .icon-btn.install-btn.ready{display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#22c55e,#06b6d4);color:#fff;border:0;box-shadow:0 10px 18px rgba(6,182,212,.22)}
    @media(max-width:699px){
      .content{padding:12px}.topbar{padding-left:14px;padding-right:14px;gap:10px}.greeting strong{font-size:17px}.top-actions{gap:6px}
      .balance-card{padding:20px;border-radius:22px}.balance{font-size:30px}.balance-row{grid-template-columns:1fr}
      .card,.stat-card,.professional-mini,.settings-card,.report-secondary-grid>div{padding:14px}.report-secondary-grid{grid-template-columns:1fr}
      .advanced-filters{grid-template-columns:1fr 1fr}.calendar-day{min-height:60px}
      .modal-wrap{padding-top:max(8px,env(safe-area-inset-top));padding-bottom:max(8px,env(safe-area-inset-bottom))}
    }
    @media(max-width:520px){
      .icon-btn{width:40px;height:40px;border-radius:14px;font-size:18px}.avatar{width:40px;height:40px;border-radius:14px}.balance{font-size:28px}
      .grid{gap:10px}.professional-strip{grid-template-columns:1fr 1fr}.advanced-filters{grid-template-columns:1fr}
    }
    @media(display-mode:standalone){body{overscroll-behavior-y:contain}#appScreen{padding-bottom:calc(95px + env(safe-area-inset-bottom))}}
  </style>`;
    html = injectBefore(html, '</head>', head);
  }

  if (!html.includes('id="installAppBtn"')) {
    const refreshButton = /(<button[^>]*id="refreshDataBtn"[^>]*>.*?<\/button>)/s;
    if (refreshButton.test(html)) {
      html = html.replace(refreshButton, `$1\n      <button id="installAppBtn" class="icon-btn install-btn hidden" onclick="installMoneyFlowApp()" aria-label="ติดตั้ง MoneyFlow" title="ติดตั้ง MoneyFlow">📲</button>`);
    }
  }

  if (!html.includes('__moneyflowRpcCompleted')) {
    html = html.replace(
      'return payload.result;',
      `const result=payload.result;\n        try{if(typeof window.__moneyflowRpcCompleted==='function')window.__moneyflowRpcCompleted(String(method),result);}catch(e){}\n        return result;`
    );
  }

  if (!html.includes('MONEYFLOW_PWA_RUNTIME_V1')) {
    const runtime = `
<script>
/* MONEYFLOW_PWA_RUNTIME_V1 */
(function(){
  const MUTATING=new Set(${JSON.stringify(MUTATING_METHODS)});
  const TAB_ID=(self.crypto&&crypto.randomUUID)?crypto.randomUUID():String(Date.now())+'_'+Math.random().toString(16).slice(2);
  const STORAGE_KEY='moneyflow_mutation_v1';
  let installPrompt=null,channel=null,refreshTimer=null,lastMutationAt=0;
  const byId=id=>document.getElementById(id);
  const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const tokenSuffix=()=>{try{return String(window.TOKEN||'').slice(-12)}catch(e){return ''}};

  function updateInstallButton(){const btn=byId('installAppBtn');if(!btn)return;const ready=!!installPrompt&&!standalone();btn.classList.toggle('hidden',!ready);btn.classList.toggle('ready',ready)}
  window.installMoneyFlowApp=async function(){
    if(standalone()){if(typeof toast==='function')toast('เครื่องนี้ติดตั้ง MoneyFlow แล้ว','info');return}
    if(!installPrompt){const isiOS=/iphone|ipad|ipod/i.test(navigator.userAgent||'');if(typeof toast==='function')toast(isiOS?'บน iPhone ให้กด Share แล้วเลือก “Add to Home Screen”':'เปิดผ่าน Chrome แล้วเลือก “ติดตั้งแอป / Add to Home Screen”','info');return}
    try{await installPrompt.prompt();await installPrompt.userChoice}catch(e){}finally{installPrompt=null;updateInstallButton()}
  };
  addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;updateInstallButton()});
  addEventListener('appinstalled',()=>{installPrompt=null;updateInstallButton();if(typeof toast==='function')toast('ติดตั้ง MoneyFlow ลงเครื่องแล้ว','success')});

  function markCachesStale(){try{if(window.CACHE&&CACHE.at){CACHE.at.dashboard=0;CACHE.at.transactions=0;CACHE.at.savings=0;CACHE.at.goals=0;CACHE.reports={}}}catch(e){}}
  function refreshVisibleData(){
    if(!tokenSuffix()||document.hidden)return;markCachesStale();
    try{
      if(typeof loadDashboard==='function')loadDashboard(true);
      if(typeof loadSavings==='function')loadSavings(true);
      const page=typeof activePageName==='function'?activePageName():'dashboard';
      if(page==='transactions'&&typeof loadTransactions==='function')loadTransactions(true);
      else if(page==='budget'&&typeof loadBudgets==='function')loadBudgets(true);
      else if(page==='goals'&&typeof loadGoals==='function')loadGoals(true);
      else if(page==='report'&&typeof loadReport==='function')loadReport(true)
    }catch(e){console.warn('MoneyFlow automatic refresh failed',e)}
  }
  function scheduleRefresh(delay){clearTimeout(refreshTimer);refreshTimer=setTimeout(refreshVisibleData,typeof delay==='number'?delay:220)}
  function receive(payload){if(!payload||payload.origin===TAB_ID||payload.tokenSuffix!==tokenSuffix())return;const ts=Number(payload.ts||0);if(ts&&ts<=lastMutationAt)return;lastMutationAt=ts||Date.now();scheduleRefresh(180)}
  function broadcast(method){const payload={method:String(method||''),ts:Date.now(),origin:TAB_ID,tokenSuffix:tokenSuffix()};lastMutationAt=payload.ts;try{if(channel)channel.postMessage(payload)}catch(e){}try{localStorage.setItem(STORAGE_KEY,JSON.stringify(payload))}catch(e){}}

  window.__moneyflowRpcCompleted=function(method){if(!MUTATING.has(String(method)))return;broadcast(method);scheduleRefresh(140)};
  try{if('BroadcastChannel'in window){channel=new BroadcastChannel('moneyflow-sync-v1');channel.onmessage=event=>receive(event.data)}}catch(e){}
  addEventListener('storage',event=>{if(event.key!==STORAGE_KEY||!event.newValue)return;try{receive(JSON.parse(event.newValue))}catch(e){}});
  if('serviceWorker'in navigator)addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(error=>console.warn('MoneyFlow service worker:',error)),{once:true});
  updateInstallButton();
})();
</script>`;
    html = injectBefore(html, '</body>', runtime);
  }
  return html;
}

function crc32(buffer){
  let crc=0xffffffff;
  for(const byte of buffer){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}
  return (crc^0xffffffff)>>>0;
}
function chunk(type,data){
  const name=Buffer.from(type,'ascii'),body=Buffer.isBuffer(data)?data:Buffer.from(data||[]),out=Buffer.alloc(12+body.length);
  out.writeUInt32BE(body.length,0);name.copy(out,4);body.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([name,body])),8+body.length);return out;
}
function makeIcon(size){
  const rgba=Buffer.alloc(size*size*4,0);const set=(x,y,r,g,b,a=255)=>{x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=size||y>=size)return;const i=(y*size+x)*4;rgba[i]=r;rgba[i+1]=g;rgba[i+2]=b;rgba[i+3]=a};
  const rounded=(x0,y0,x1,y1,r,fill)=>{for(let y=Math.floor(y0);y<=Math.ceil(y1);y++)for(let x=Math.floor(x0);x<=Math.ceil(x1);x++){const cx=Math.max(x0+r,Math.min(x,x1-r)),cy=Math.max(y0+r,Math.min(y,y1-r));if((x-cx)**2+(y-cy)**2<=r*r)fill(x,y)}};
  const circle=(cx,cy,r,fill)=>{for(let y=Math.floor(cy-r);y<=Math.ceil(cy+r);y++)for(let x=Math.floor(cx-r);x<=Math.ceil(cx+r);x++)if((x-cx)**2+(y-cy)**2<=r*r)fill(x,y)};
  rounded(0,0,size-1,size-1,size*.22,(x,y)=>{const t=(x+y)/(2*(size-1)),a=[99,102,241],b=[236,72,153];set(x,y,...a.map((v,i)=>Math.round(v*(1-t)+b[i]*t))) });
  rounded(size*.24,size*.35,size*.76,size*.71,size*.08,(x,y)=>set(x,y,255,255,255,245));
  rounded(size*.46,size*.36,size*.79,size*.56,size*.055,(x,y)=>set(x,y,226,232,240,255));
  circle(size*.64,size*.46,size*.025,(x,y)=>set(x,y,99,102,241,255));
  rounded(size*.31,size*.23,size*.62,size*.49,size*.045,(x,y)=>set(x,y,34,197,94,255));
  rounded(size*.36,size*.28,size*.57,size*.44,size*.018,(x,y)=>{if(x<size*.37||x>size*.56||y<size*.29||y>size*.43)set(x,y,255,255,255,220)});
  circle(size*.47,size*.355,size*.026,(x,y)=>set(x,y,255,255,255,235));
  circle(size*.59,size*.60,size*.095,(x,y)=>set(x,y,250,204,21,255));
  circle(size*.59,size*.60,size*.073,(x,y)=>set(x,y,253,224,71,255));
  for(let y=Math.floor(size*.545);y<size*.665;y++)for(let x=Math.floor(size*.565);x<size*.615;x++){const vertical=Math.abs(x-size*.585)<size*.008;const bar1=Math.abs(y-size*.575)<size*.008&&x>size*.575;const bar2=Math.abs(y-size*.625)<size*.008&&x>size*.575;if(vertical||bar1||bar2)set(x,y,120,53,15,255)}
  const raw=Buffer.alloc((size*4+1)*size);for(let y=0;y<size;y++){const o=y*(size*4+1);raw[o]=0;rgba.copy(raw,o+1,y*size*4,(y+1)*size*4)}
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;ihdr[10]=0;ihdr[11]=0;ihdr[12]=0;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}

const manifest={name:'MoneyFlow',short_name:'MoneyFlow',description:'จัดการเงินส่วนตัวอย่างเป็นระบบ ใช้งานง่ายบนมือถือและเดสก์ท็อป',start_url:'/',scope:'/',display:'standalone',background_color:'#f5f7ff',theme_color:'#6366f1',lang:'th',orientation:'any',icons:[{src:'/icons/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any maskable'},{src:'/icons/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}]};
const serviceWorker=`const CACHE_NAME='moneyflow-shell-v2';const SHELL=['/','/index.html','/offline.html','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png'];self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(SHELL)));self.skipWaiting()});self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(key=>key===CACHE_NAME?Promise.resolve():caches.delete(key)))).then(()=>self.clients.claim())});self.addEventListener('fetch',event=>{const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||url.pathname.startsWith('/receipts/'))return;if(request.mode==='navigate'){event.respondWith(fetch(request).then(response=>{const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put('/index.html',copy)).catch(()=>{});return response}).catch(()=>caches.match('/index.html').then(r=>r||caches.match('/offline.html'))));return}event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{if(response&&response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(request,copy)).catch(()=>{})}return response})))})`;
const offline=`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#6366f1"><title>MoneyFlow • Offline</title><style>body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#f5f7ff;color:#172033;display:grid;place-items:center;min-height:100vh;padding:24px}.card{max-width:420px;background:#fff;border-radius:24px;padding:28px;text-align:center;box-shadow:0 18px 40px rgba(67,56,202,.12)}.icon{width:82px;height:82px;border-radius:24px;margin:0 auto 16px;display:grid;place-items:center;background:linear-gradient(135deg,#6366f1,#ec4899);font-size:40px}h1{margin:0 0 8px;font-size:28px}p{margin:0;color:#667085;line-height:1.6}</style></head><body><div class="card"><div class="icon">💸</div><h1>MoneyFlow</h1><p>ตอนนี้ออฟไลน์อยู่ เมื่อเชื่อมต่ออินเทอร์เน็ตอีกครั้งให้เปิดแอป ระบบจะซิงก์ข้อมูลล่าสุดให้อัตโนมัติ</p></div></body></html>`;

await mkdir(publicDir,{recursive:true});await mkdir(iconDir,{recursive:true});
const html=await readFile(indexPath,'utf8');await writeFile(indexPath,enhanceHtml(html),'utf8');
await writeFile(join(publicDir,'manifest.webmanifest'),JSON.stringify(manifest,null,2),'utf8');await writeFile(join(publicDir,'sw.js'),serviceWorker,'utf8');await writeFile(join(publicDir,'offline.html'),offline,'utf8');
await writeFile(join(iconDir,'icon-192.png'),makeIcon(192));await writeFile(join(iconDir,'icon-512.png'),makeIcon(512));
console.log('Enhanced generated MoneyFlow assets: PWA, mobile layout and automatic refresh');
