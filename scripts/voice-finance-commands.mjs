import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = join(root, 'public', 'index.html');
const swPath = join(root, 'public', 'sw.js');
let html = await readFile(indexPath, 'utf8');

const finishNeedle = "setTimeout(()=>processTranscript(transcript).finally(()=>{state.processing=false;hideHud(220)}),30);";
const finishReplacement = "setTimeout(()=>{const run=(typeof window.__moneyflowHandleVoiceCommand==='function'?window.__moneyflowHandleVoiceCommand(transcript,processTranscript):processTranscript(transcript));Promise.resolve(run).finally(()=>{state.processing=false;hideHud(220)});},30);";
if (html.includes(finishNeedle)) html = html.replace(finishNeedle, finishReplacement);
if (!html.includes(finishReplacement) && !html.includes('__moneyflowHandleVoiceCommand(transcript,processTranscript)')) {
  throw new Error('Voice finish hook was not found; refusing to build a partial command router');
}

if (!html.includes('MONEYFLOW_VOICE_FINANCE_COMMANDS_V2')) {
  const css = `
<style id="moneyflow-voice-finance-command-css">
  #mfVoiceCommandReview{position:fixed;inset:0;z-index:100120;display:flex;align-items:flex-end;justify-content:center;background:rgba(15,23,42,.46)}
  #mfVoiceCommandReview.hidden{display:none!important}
  .mf-vcmd-sheet{width:100%;max-width:540px;max-height:86vh;overflow:auto;background:var(--card,#fff);color:var(--text,#172033);border-radius:24px 24px 0 0;padding:20px 18px calc(20px + env(safe-area-inset-bottom));box-shadow:0 -18px 50px rgba(15,23,42,.28)}
  .mf-vcmd-sheet h3{margin:0 0 5px;font-size:19px}.mf-vcmd-sub{font-size:12px;line-height:1.55;color:var(--muted,#667085)}
  .mf-vcmd-grid{display:grid;grid-template-columns:1fr;gap:11px;margin-top:15px}.mf-vcmd-field label{display:block;font-size:11px;font-weight:800;color:var(--muted,#667085);margin-bottom:6px}
  .mf-vcmd-field select,.mf-vcmd-field input{width:100%;min-height:48px;border:1px solid var(--border,#d7dbe7);border-radius:14px;padding:10px 12px;background:var(--card,#fff);color:var(--text,#172033);font:inherit}
  .mf-vcmd-status{margin-top:11px;padding:10px 12px;border-radius:12px;background:rgba(99,102,241,.08);font-size:12px;line-height:1.55;color:var(--muted,#667085)}
  .mf-vcmd-actions{display:grid;grid-template-columns:1fr 1.35fr;gap:9px;margin-top:14px}.mf-vcmd-actions button{min-height:49px;border-radius:14px;font-weight:850}
  @media(min-width:700px){#mfVoiceCommandReview{align-items:center;padding:18px}.mf-vcmd-sheet{border-radius:24px}.mf-vcmd-grid{grid-template-columns:1fr 1fr}.mf-vcmd-field.amount{grid-column:1/-1}}
  @media(max-width:420px){.mf-vcmd-actions{grid-template-columns:1fr}}
</style>`;
  html = html.replace('</head>', css + '\n</head>');

  const runtime = `
<script>
/* MONEYFLOW_VOICE_FINANCE_COMMANDS_V2 */
(function(){
  const ALIAS_KEY='moneyflow_voice_account_aliases_v2';
  const SOURCE_KEY='moneyflow_voice_transfer_source_v2';
  const DAILY='daily_wallet';
  let reviewCommand=null;
  let lastTouchedTransactionId='';
  let accountCache={at:0,rows:[]};
  const byId=id=>document.getElementById(id);
  const norm=value=>String(value||'').toLowerCase().replace(/[()\\[\\]{}.,:;!?"'“”‘’]/g,' ').replace(/\\s+/g,' ').trim();
  const compact=value=>norm(value).replace(/(?:บัญชี|กระเป๋า|ของฉัน|ของเรา|เงิน)/g,'').replace(/\\s+/g,'').trim();
  const money=value=>{try{return new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB',maximumFractionDigits:2}).format(Number(value||0))}catch(e){return '฿'+Number(value||0)}};
  const localDate=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
  function toastSafe(message,type){try{if(typeof toast==='function')toast(message,type||'info')}catch(e){}}
  function readJson(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'')||fallback}catch(e){return fallback}}
  function writeJson(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch(e){}}
  function aliases(){return readJson(ALIAS_KEY,{})}
  function rememberAlias(phrase,id){const key=compact(phrase);id=String(id||'');if(!key||key.length<2||!id)return;const map=aliases();map[key]=id;writeJson(ALIAS_KEY,map)}
  function amountFrom(text){
    try{const parsed=window.__moneyflowParseVoiceText&&window.__moneyflowParseVoiceText(text);if(parsed&&Number(parsed.amount)>0)return Number(parsed.amount)}catch(e){}
    const m=String(text||'').replace(/,/g,'').match(/(\\d+(?:\\.\\d{1,2})?)\\s*(?:บาท|บ\\.?|฿)?/);return m?Number(m[1]):0;
  }
  function cleanPhrase(value){return String(value||'').replace(/\\d[\\d,]*(?:\\.\\d{1,2})?\\s*(?:บาท|บ\\.?|฿)?/g,' ').replace(/(?:วันนี้|เมื่อวาน|เมื่อวานนี้|จำนวน|ยอด)/g,' ').replace(/\\s+/g,' ').trim()}
  function parseCommand(text){
    const raw=String(text||'').trim(),lower=norm(raw),amount=amountFrom(raw);
    if(/^(?:ช่วย)?\\s*(?:ลบ|ลบทิ้ง|เอาออก)/.test(lower)){
      let scope='match';if(/ล่าสุด|อันล่าสุด|รายการสุดท้าย/.test(lower))scope='latest';else if(/รายการนี้|อันนี้|ตัวนี้/.test(lower))scope='this';
      let hint=cleanPhrase(raw).replace(/^(?:ช่วย)?\\s*(?:ลบ|ลบทิ้ง|เอาออก)\\s*/,'').replace(/(?:รายการ|รายรับ|รายจ่าย|ล่าสุด|อันล่าสุด|รายการนี้|อันนี้|ตัวนี้)/g,' ').replace(/\\s+/g,' ').trim();
      return {kind:'delete',raw,amount,scope,hint};
    }
    const debt=/(?:ใช้หนี้|จ่ายหนี้|ชำระหนี้|โปะหนี้|คืนหนี้|จ่ายบัตรเครดิต|ชำระบัตรเครดิต|จ่ายบัตร)/.test(lower);
    const movement=/(?:โอน|ย้ายเงิน|ย้ายจาก|โยกเงิน|โยกจาก|เอาเงิน.+ไป|ส่งเงิน)/.test(lower);
    if(debt||movement){
      let sourcePhrase='',targetPhrase='';
      const sourceMatch=raw.match(/(?:จาก|ออกจาก)\\s*(.+?)(?=\\s*(?:ไป|ไปที่|เข้า|เข้าบัญชี|เข้ากระเป๋า|สู่|เพื่อ|เอาไป|ใช้หนี้|จ่ายหนี้|ชำระหนี้)|\\s+\\d[\\d,]*(?:\\.\\d+)?|$)/i);
      if(sourceMatch)sourcePhrase=cleanPhrase(sourceMatch[1]);
      const targetMatch=raw.match(/(?:ไปที่|ไป|เข้าบัญชี|เข้ากระเป๋า|เข้า|สู่)\\s*(.+)$/i);
      if(targetMatch)targetPhrase=cleanPhrase(targetMatch[1]);
      if(debt)targetPhrase=targetPhrase&& !/ใช้หนี้|จ่ายหนี้|ชำระหนี้/.test(norm(targetPhrase))?targetPhrase:'หนี้';
      return {kind:debt?'debt':'transfer',raw,amount,sourcePhrase,targetPhrase,date:localDate()};
    }
    return null;
  }
  window.__moneyflowParseFinanceCommand=parseCommand;

  function semanticKind(phrase){const p=norm(phrase);if(/ใช้ประจำวัน|ใช้จ่ายประจำวัน|กระเป๋าใช้|daily wallet/.test(p))return'daily';if(/เงินเดือน|salary|payroll/.test(p))return'salary';if(/เงินเก็บ|เงินออม|ออมทรัพย์|saving|savings/.test(p))return'savings';if(/หุ้น|ลงทุน|กองทุน|investment|stock/.test(p))return'investment';if(/หนี้|บัตรเครดิต|สินเชื่อ|ผ่อน|liabilit|credit/.test(p))return'debt';return''}
  function candidateKind(c){const p=norm((c.label||'')+' '+(c.type||'')+' '+(c.text||''));if(c.id===DAILY||/ใช้ประจำวัน|daily wallet/.test(p))return'daily';if(/เงินเดือน|salary|payroll/.test(p))return'salary';if(/saving|savings|เงินเก็บ|เงินออม|ออมทรัพย์/.test(p))return'savings';if(/investment|หุ้น|ลงทุน|กองทุน|stock/.test(p))return'investment';if(/liabil|debt|หนี้|บัตรเครดิต|สินเชื่อ|credit/.test(p))return'debt';return''}
  function addCandidate(map,row,labelOverride){
    if(!row)return;const id=String(row.id??row.accountId??row.account_id??row.value??'');if(!id)return;
    const label=String(labelOverride??row.name??row.accountName??row.account_name??row.label??row.title??'').trim();if(!label&&id!==DAILY)return;
    const type=String(row.type??row.accountType??row.account_type??row.kind??'');
    const old=map.get(id)||{id,label:label||id,type,text:'',isDefault:false,raw:null};if(label&&(!old.label||old.label===id))old.label=label;if(type)old.type=type;
    old.text=(old.text+' '+[label,row.bankName,row.bank,row.nickname,row.purpose,row.type,row.accountType].filter(Boolean).join(' ')).trim();
    old.isDefault=old.isDefault||row.isDefault===true||row.default===true||String(row.isDefault||'').toLowerCase()==='true';old.raw=old.raw||row;map.set(id,old);
  }
  function harvestAccounts(value,map,path,depth,seen){
    if(depth>5||value==null)return;if(typeof value!=='object')return;if(seen.has(value))return;seen.add(value);
    if(Array.isArray(value)){for(const row of value)harvestAccounts(row,map,path,depth+1,seen);return}
    const id=value.id??value.accountId??value.account_id;const label=value.name??value.accountName??value.account_name??value.label??value.title;const pathLooks=/account|saving|wallet|liabil|invest/i.test(path||'');const rowLooks=value.balance!=null||value.accountType!=null||value.bankName!=null||value.includeNetWorth!=null||value.type!=null;
    if(id!=null&&label!=null&&(pathLooks||rowLooks))addCandidate(map,value);
    for(const [key,next] of Object.entries(value))harvestAccounts(next,map,(path?path+'.':'')+key,depth+1,seen);
  }
  function localCandidates(){
    const map=new Map();addCandidate(map,{id:DAILY,name:'เงินใช้ประจำวัน',type:'daily'});
    try{for(const pool of [window.CURRENT_ACCOUNTS,window.SAVINGS_ACCOUNTS,window.CACHE&&CACHE.accounts,window.CACHE&&CACHE.savings&&CACHE.savings.accounts].filter(Array.isArray))for(const row of pool)addCandidate(map,row)}catch(e){}
    try{for(const select of document.querySelectorAll('select')){const key=String(select.id||select.name||'').toLowerCase();if(!/account|transfer|wallet/.test(key))continue;for(const option of Array.from(select.options||[])){const id=String(option.value||'');const label=String(option.textContent||'').trim();if(id&&label)addCandidate(map,{id,name:label,type:''},label)}}}catch(e){}
    return map;
  }
  function rpc(method,...args){return new Promise((resolve,reject)=>{try{const runner=google.script.run.withSuccessHandler(resolve).withFailureHandler(reject);runner[method](TOKEN,...args)}catch(e){reject(e)}})}
  async function getAccounts(force){
    if(!force&&accountCache.rows.length&&Date.now()-accountCache.at<30000)return accountCache.rows.slice();
    const map=localCandidates();
    if(map.size<3||force){try{const data=await rpc('getSavingsOverview');harvestAccounts(data,map,'getSavingsOverview',0,new WeakSet())}catch(e){}}
    const rows=[...map.values()];accountCache={at:Date.now(),rows};return rows;
  }
  function scoreCandidate(c,phrase){
    const p=norm(phrase),pc=compact(phrase),label=norm(c.label),lc=compact(c.label),text=norm(c.text),semantic=semanticKind(phrase),kind=candidateKind(c);let score=0;
    const saved=aliases()[pc];if(saved&&saved===c.id)score+=1000;
    if(pc&&lc===pc)score+=180;else if(pc&&lc.includes(pc))score+=110;else if(pc&&pc.includes(lc)&&lc.length>=3)score+=90;
    if(p&&text.includes(p))score+=70;
    if(semantic&&kind===semantic)score+=80;
    const banks=[['กสิกร',/กสิกร|kbank|k plus/i],['ไทยพาณิชย์',/ไทยพาณิชย์|scb/i],['กรุงไทย',/กรุงไทย|krungthai|next/i],['กรุงเทพ',/ธนาคารกรุงเทพ|bangkok bank|bualuang/i],['กรุงศรี',/กรุงศรี|krungsri/i],['ttb',/ttb|ทีทีบี|ทหารไทย/i],['ออมสิน',/ออมสิน|gsb/i]];
    for(const [,re] of banks)if(re.test(p)&&re.test(label+' '+text))score+=120;
    return score;
  }
  function resolvePhrase(phrase,candidates){
    phrase=String(phrase||'').trim();if(!phrase)return{id:'',ambiguous:false,score:0};
    const scored=candidates.map(c=>({c,score:scoreCandidate(c,phrase)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
    if(!scored.length)return{id:'',ambiguous:false,score:0};
    const top=scored[0],second=scored[1];const ambiguous=!!(second&&top.score<900&&top.score-second.score<18);
    return{id:ambiguous?'':top.c.id,ambiguous,score:top.score,candidate:top.c,matches:scored.slice(0,5)};
  }
  function inferredSource(candidates,targetId){
    const saved=String(readJson(SOURCE_KEY,'')||'');if(saved&&saved!==targetId&&candidates.some(c=>c.id===saved))return saved;
    try{const select=byId('transactionAccount');if(select&&select.value&&select.value!==targetId)return String(select.value)}catch(e){}
    const def=candidates.find(c=>c.isDefault&&c.id!==targetId&&candidateKind(c)!=='debt');if(def)return def.id;
    if(targetId!==DAILY&&candidates.some(c=>c.id===DAILY))return DAILY;
    return'';
  }
  function accountLabel(id,candidates){const c=candidates.find(x=>x.id===String(id));return c?c.label:(String(id)===DAILY?'เงินใช้ประจำวัน':String(id||''))}

  function ensureReview(){
    let box=byId('mfVoiceCommandReview');if(box)return box;box=document.createElement('div');box.id='mfVoiceCommandReview';box.className='hidden';box.innerHTML='<div class="mf-vcmd-sheet" role="dialog" aria-modal="true"><h3 id="mfVcmdTitle">ตรวจคำสั่งการเงิน</h3><div id="mfVcmdSub" class="mf-vcmd-sub"></div><div class="mf-vcmd-grid"><div class="mf-vcmd-field"><label>จากบัญชี</label><select id="mfVcmdFrom"></select></div><div class="mf-vcmd-field"><label>ไปบัญชี</label><select id="mfVcmdTo"></select></div><div class="mf-vcmd-field amount"><label>จำนวนเงิน</label><input id="mfVcmdAmount" type="number" min="0.01" step="0.01" inputmode="decimal"></div></div><div id="mfVcmdStatus" class="mf-vcmd-status"></div><div class="mf-vcmd-actions"><button type="button" class="btn btn-light" id="mfVcmdCancel">ยกเลิก</button><button type="button" class="btn btn-primary" id="mfVcmdExecute">ทำรายการ</button></div></div>';document.body.appendChild(box);
    byId('mfVcmdCancel').onclick=()=>{reviewCommand=null;box.classList.add('hidden')};byId('mfVcmdExecute').onclick=executeReview;box.addEventListener('click',e=>{if(e.target===box){reviewCommand=null;box.classList.add('hidden')}});return box;
  }
  function fillSelect(select,candidates,value){select.innerHTML='';const empty=document.createElement('option');empty.value='';empty.textContent='— เลือกบัญชี —';select.appendChild(empty);for(const c of candidates){const o=document.createElement('option');o.value=c.id;o.textContent=c.label+(c.type?' · '+c.type:'');select.appendChild(o)}if(value&&[...select.options].some(o=>o.value===String(value)))select.value=String(value)}
  function showTransferReview(command,candidates,sourceId,targetId,reason){
    const box=ensureReview();reviewCommand={command,candidates};byId('mfVcmdTitle').textContent=command.kind==='debt'?'ชำระหนี้ด้วยเสียง':'โอนเงินด้วยเสียง';byId('mfVcmdSub').textContent='ได้ยิน: “'+command.raw+'”';fillSelect(byId('mfVcmdFrom'),candidates,sourceId);fillSelect(byId('mfVcmdTo'),candidates,targetId);byId('mfVcmdAmount').value=command.amount||'';byId('mfVcmdStatus').textContent=reason||'เลือกบัญชีให้ครบ ครั้งต่อไป MoneyFlow จะจำคำเรียกที่คุณใช้';box.classList.remove('hidden');
  }
  async function executeReview(){if(!reviewCommand)return;const command=reviewCommand.command,candidates=reviewCommand.candidates,sourceId=String(byId('mfVcmdFrom').value||''),targetId=String(byId('mfVcmdTo').value||''),amount=Number(byId('mfVcmdAmount').value||0);if(!sourceId||!targetId||!amount){toastSafe('กรุณาเลือกบัญชีต้นทาง ปลายทาง และจำนวนเงินให้ครบ','warning');return}byId('mfVoiceCommandReview').classList.add('hidden');reviewCommand=null;await executeTransfer(command,candidates,sourceId,targetId,amount)}

  function setHud(title,text,hint){const hud=byId('mfVoiceHud');if(!hud)return;hud.classList.add('show');const a=byId('mfVoiceHudTitle'),b=byId('mfVoiceHudText'),c=byId('mfVoiceHudHint');if(a)a.textContent=title;if(b)b.textContent=text;if(c)c.textContent=hint||''}
  async function executeTransfer(command,candidates,sourceId,targetId,amount){
    sourceId=String(sourceId||'');targetId=String(targetId||'');amount=Number(amount||0);if(!sourceId||!targetId||!amount)return showTransferReview(command,candidates,sourceId,targetId,'ข้อมูลยังไม่ครบ');if(sourceId===targetId){toastSafe('บัญชีต้นทางและปลายทางต้องไม่ใช่บัญชีเดียวกัน','warning');return showTransferReview(command,candidates,sourceId,targetId,'เลือกบัญชีคนละบัญชีกัน')}
    setHud(command.kind==='debt'?'กำลังชำระหนี้…':'กำลังโอน…',money(amount)+' • '+accountLabel(sourceId,candidates)+' → '+accountLabel(targetId,candidates),'กำลังบันทึกผ่านระบบบัญชีของ MoneyFlow');
    try{
      const result=await rpc('executeVoiceTransfer',{sourceAccountId:sourceId,targetAccountId:targetId,amount,date:command.date||localDate(),note:command.raw,kind:command.kind});
      writeJson(SOURCE_KEY,sourceId);if(command.sourcePhrase)rememberAlias(command.sourcePhrase,sourceId);if(command.targetPhrase)rememberAlias(command.targetPhrase,targetId);accountCache.at=0;
      try{if(typeof window.__moneyflowRpcCompleted==='function')window.__moneyflowRpcCompleted('saveTransfer',result)}catch(e){}
      try{if(window.CACHE){if(CACHE.at){CACHE.at.dashboard=0;CACHE.at.transactions=0;CACHE.at.savings=0}CACHE.reports={}}}catch(e){}
      toastSafe((command.kind==='debt'?'ชำระหนี้':'โอนเงิน')+' '+money(amount)+' แล้ว','success');setHud('✓ สำเร็จ',accountLabel(sourceId,candidates)+' → '+accountLabel(targetId,candidates),command.kind==='debt'?'ยอดหนี้และบัญชีต้นทางถูกอัปเดตแล้ว':'บันทึกเป็นการโอน ไม่ถูกนับเป็นรายรับ/รายจ่ายใหม่');
      setTimeout(()=>{try{if(typeof manualRefreshAll==='function')manualRefreshAll();else{if(typeof loadDashboard==='function')loadDashboard(true);if(typeof loadSavings==='function')loadSavings(true);if(typeof loadTransactions==='function'&&byId('page-transactions')?.classList.contains('active'))loadTransactions(true)}}catch(e){}},120);
      return result;
    }catch(error){const message=String(error&&error.message||error);toastSafe('ทำรายการด้วยเสียงไม่สำเร็จ: '+message,'error');showTransferReview(command,candidates,sourceId,targetId,message);return null}
  }
  async function handleTransfer(command){
    const candidates=await getAccounts(true);let target=resolvePhrase(command.targetPhrase,candidates),source=resolvePhrase(command.sourcePhrase,candidates);let targetId=target.id,sourceId=source.id;
    if(command.kind==='debt'&&!targetId){const debtRows=candidates.filter(c=>candidateKind(c)==='debt');if(debtRows.length===1)targetId=debtRows[0].id}
    if(!sourceId)sourceId=inferredSource(candidates,targetId);
    if(!command.amount||!targetId||!sourceId||target.ambiguous||source.ambiguous){let reason='';if(!command.amount)reason='ยังไม่ได้ยินจำนวนเงิน';else if(target.ambiguous||source.ambiguous)reason='มีหลายบัญชีที่ตรงกับคำเรียก กรุณาเลือกหนึ่งครั้ง';else if(!targetId)reason='ยังจับบัญชีปลายทางไม่ได้';else if(!sourceId)reason='ยังจับบัญชีต้นทางไม่ได้';showTransferReview(command,candidates,sourceId,targetId,reason);return true}
    await executeTransfer(command,candidates,sourceId,targetId,command.amount);return true;
  }

  function transactions(){let rows=[];try{rows=Array.isArray(CURRENT_TRANSACTIONS)?CURRENT_TRANSACTIONS.slice():(window.CACHE&&Array.isArray(CACHE.transactions)?CACHE.transactions.slice():[])}catch(e){}try{if(typeof window.__moneyflowSortTransactionsLatest==='function')rows=window.__moneyflowSortTransactionsLatest(rows)}catch(e){}return rows}
  function txText(row){return norm([row?.description,row?.category,row?.note,row?.merchant].filter(Boolean).join(' '))}
  function txAmount(row){return Number(row?.amount??row?.value??0)}
  function currentModalTransactionId(){try{const modal=byId('transactionModal');if(!modal||modal.classList.contains('hidden')||getComputedStyle(modal).display==='none')return'';for(const node of modal.querySelectorAll('input[type="hidden"],input,select')){const key=String(node.id||node.name||'').toLowerCase();if(/transaction.*id|^txid$|^transactionid$/.test(key)&&node.value)return String(node.value)}}catch(e){}return''}
  function matchDelete(command){const rows=transactions();if(!rows.length)return null;if(command.scope==='latest')return rows[0];if(command.scope==='this'){const id=currentModalTransactionId()||lastTouchedTransactionId;if(!id)return null;return rows.find(r=>String(r&&r.id)===id)||null}let filtered=rows;if(command.amount>0)filtered=filtered.filter(r=>Math.abs(txAmount(r)-command.amount)<0.005);const hint=norm(command.hint);if(hint){const tokens=hint.split(' ').filter(t=>t.length>1);filtered=filtered.filter(r=>tokens.every(t=>txText(r).includes(t)))}return filtered[0]||null}
  async function handleDelete(command){const row=matchDelete(command);if(!row){toastSafe(command.scope==='this'?'ยังไม่รู้ว่า “รายการนี้” คือรายการไหน ให้แตะรายการก่อนแล้วพูดอีกครั้ง หรือพูด “ลบรายการล่าสุด”':'ไม่พบรายการที่ตรงกับคำสั่งลบ','warning');return true}const id=String(row.id||'');if(!id)return true;setHud('กำลังลบ…',String(row.description||row.category||'รายการ')+' • '+money(txAmount(row)),'ลบทันทีตามคำสั่งเสียง');if(typeof window.removeTransaction==='function'){window.removeTransaction(id);toastSafe('ลบรายการแล้ว','success');return true}try{await rpc('deleteTransaction',id);toastSafe('ลบรายการแล้ว','success');if(typeof loadTransactions==='function')loadTransactions(true)}catch(error){toastSafe('ลบรายการไม่สำเร็จ','error')}return true}

  function accountPhraseFromVoice(text,type){const raw=String(text||'');if(type==='income'){const m=raw.match(/(?:เข้าบัญชี|เข้ากระเป๋า|เข้า)\\s*([^,]+?)(?=\\s+\\d[\\d,]*|\\s*(?:บาท|วันนี้|เมื่อวาน)|$)/i);return m?cleanPhrase(m[1]):''}const m=raw.match(/(?:จากบัญชี|จากกระเป๋า|จาก)\\s*([^,]+?)(?=\\s+\\d[\\d,]*|\\s*(?:บาท|วันนี้|เมื่อวาน)|$)/i);return m?cleanPhrase(m[1]):''}
  const previousTransport=window.__moneyflowRpcTransport;
  if(typeof previousTransport==='function'&&!previousTransport.__moneyflowVoiceFinanceV2){
    const wrapped=async function(method,args){let nextArgs=Array.from(args||[]);const m=String(method||'');const active=String(window.__moneyflowActiveVoiceText||'');if(m==='addTransaction'&&active&&nextArgs[1]&&typeof nextArgs[1]==='object'){
      const payload=Object.assign({},nextArgs[1]),phrase=accountPhraseFromVoice(active,String(payload.type||''));if(phrase){const candidates=await getAccounts(false),resolved=resolvePhrase(phrase,candidates);if(resolved.id&&!resolved.ambiguous){payload.accountId=resolved.id;rememberAlias(phrase,resolved.id);nextArgs[1]=payload}else if(resolved.ambiguous){throw new Error('มีหลายบัญชีที่ตรงกับ “'+phrase+'” กรุณาเลือกบัญชีในฟอร์มหนึ่งครั้ง')}}}
      return previousTransport(m,nextArgs)};wrapped.__moneyflowVoiceFinanceV2=true;window.__moneyflowRpcTransport=wrapped;
  }

  window.__moneyflowHandleVoiceCommand=async function(transcript,fallback){const command=parseCommand(transcript);if(command){if(command.kind==='delete')return handleDelete(command);return handleTransfer(command)}window.__moneyflowActiveVoiceText=String(transcript||'');try{return await fallback(transcript)}finally{window.__moneyflowActiveVoiceText=''}};
  document.addEventListener('pointerdown',event=>{const row=event.target.closest&&event.target.closest('[data-mf-swipe-tx-id]');if(row&&row.dataset.mfSwipeTxId)lastTouchedTransactionId=String(row.dataset.mfSwipeTxId)},true);
  document.addEventListener('click',event=>{const row=event.target.closest&&event.target.closest('[data-mf-swipe-tx-id]');if(row&&row.dataset.mfSwipeTxId)lastTouchedTransactionId=String(row.dataset.mfSwipeTxId)},true);
  document.addEventListener('DOMContentLoaded',ensureReview,{once:true});if(document.readyState!=='loading')ensureReview();
})();
</script>`;
  html = html.replace('</body>', runtime + '\n</body>');
  await writeFile(indexPath, html);
}

try {
  let sw = await readFile(swPath, 'utf8');
  sw = sw.replace(/moneyflow-shell-v\d+/g, 'moneyflow-shell-v6');
  await writeFile(swPath, sw);
} catch {}

console.log('Applied unified voice finance commands: transfers, debt routing, account aliases, and voice delete');
