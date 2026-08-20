import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = join(root, 'public', 'index.html');
let html = await readFile(indexPath, 'utf8');

function normalizeThaiDigits(input) {
  return String(input || '').replace(/[๐-๙]/g, ch => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(ch)));
}

function thaiNumberWordsToValue(raw) {
  const src = String(raw || '').replace(/\s+/g, '');
  if (!src) return null;
  const digitMap = {ศูนย์:0,หนึ่ง:1,เอ็ด:1,สอง:2,ยี่:2,สาม:3,สี่:4,ห้า:5,หก:6,เจ็ด:7,แปด:8,เก้า:9};
  const units = {สิบ:10,ร้อย:100,พัน:1000,หมื่น:10000,แสน:100000};
  if (/^[ศูนย์หนึ่งเอ็ดสองยี่สามสี่ห้าหกเจ็ดแปดเก้าสิบร้อยพันหมื่นแสนล้าน]+$/.test(src) === false) return null;
  const millionParts = src.split('ล้าน');
  let total = 0;
  for (let p = 0; p < millionParts.length; p++) {
    const part = millionParts[p];
    let subtotal = 0, current = 0, i = 0;
    while (i < part.length) {
      let matched = false;
      for (const word of ['หนึ่ง','เอ็ด','สอง','ยี่','สาม','สี่','ห้า','หก','เจ็ด','แปด','เก้า','ศูนย์']) {
        if (part.startsWith(word, i)) { current = digitMap[word]; i += word.length; matched = true; break; }
      }
      if (matched) continue;
      for (const word of ['แสน','หมื่น','พัน','ร้อย','สิบ']) {
        if (part.startsWith(word, i)) {
          const mul = units[word];
          if (!current) current = 1;
          subtotal += current * mul;
          current = 0;
          i += word.length;
          matched = true;
          break;
        }
      }
      if (!matched) return null;
    }
    subtotal += current;
    total = total * 1000000 + subtotal;
  }
  return Number.isFinite(total) && total > 0 ? total : null;
}

function parseVoiceText(input) {
  const text = normalizeThaiDigits(input).trim();
  const lower = text.toLowerCase();
  const result = {
    text,
    type: '',
    amount: null,
    categoryKey: '',
    description: '',
    accountHint: '',
    dateOffset: 0,
    confidence: 0,
    needsReview: false,
    reason: ''
  };
  if (!text) { result.needsReview = true; result.reason = 'ไม่ได้ยินข้อความ'; return result; }

  const transfer = /(โอน|ย้ายเงิน).*(ไป|เข้า|จาก)|โอนเงินระหว่าง/.test(lower);
  if (transfer) {
    result.type = 'transfer';
    result.needsReview = true;
    result.reason = 'รายการโอนต้องเลือกบัญชีต้นทางและปลายทาง';
  } else if (/(ได้เงิน|ได้รับ|รับเงิน|เงินเข้า|รายรับ|เงินเดือน|โบนัส|ค่าจ้าง|แม่ให้|พ่อให้|คืนเงิน|ขายได้)/.test(lower)) {
    result.type = 'income';
    result.confidence += 0.34;
  } else if (/(จ่าย|ซื้อ|เสียค่า|ค่าอาหาร|ค่าข้าว|ค่ากาแฟ|ค่าเดินทาง|เติมน้ำมัน|ชำระ|ตัดเงิน|หักเงิน|รายจ่าย)/.test(lower)) {
    result.type = 'expense';
    result.confidence += 0.34;
  } else if (/^(ค่า|ซื้อ|จ่าย)/.test(lower)) {
    result.type = 'expense';
    result.confidence += 0.24;
  }

  const normalized = text.replace(/,/g, '');
  const amountMatches = [...normalized.matchAll(/(\d+(?:\.\d{1,2})?)\s*(?:บาท|บ\.?|฿)/g)];
  if (amountMatches.length) {
    result.amount = Number(amountMatches[amountMatches.length - 1][1]);
    if (Number.isFinite(result.amount) && result.amount > 0) result.confidence += 0.38;
  } else {
    const bare = [...normalized.matchAll(/(?:^|\s)(\d+(?:\.\d{1,2})?)(?=\s|$)/g)];
    if (bare.length) {
      result.amount = Number(bare[bare.length - 1][1]);
      if (Number.isFinite(result.amount) && result.amount > 0) result.confidence += 0.26;
    } else {
      const wordMatch = normalized.match(/([ศูนย์หนึ่งเอ็ดสองยี่สามสี่ห้าหกเจ็ดแปดเก้าสิบร้อยพันหมื่นแสนล้าน]+)\s*บาท/);
      if (wordMatch) {
        result.amount = thaiNumberWordsToValue(wordMatch[1]);
        if (result.amount) result.confidence += 0.32;
      }
    }
  }

  if (/(เมื่อวาน|เมื่อวานนี้)/.test(lower)) result.dateOffset = -1;
  else if (/(วันนี้|วันนี้นะ)/.test(lower)) result.dateOffset = 0;

  const cats = [
    ['food',/(ก๋วยเตี๋ยว|ข้าว|อาหาร|กาแฟ|ชา|น้ำดื่ม|ขนม|ร้านอาหาร|บุฟเฟ่ต์|หมูกระทะ|เซเว่น|7-?eleven)/],
    ['transport',/(น้ำมัน|เติมน้ำมัน|แท็กซี่|แท็กซี่|รถเมล์|รถไฟ|bts|mrt|ทางด่วน|ที่จอดรถ|เดินทาง|grab|bolt)/i],
    ['shopping',/(ช้อป|ซื้อของ|เสื้อ|รองเท้า|ห้าง|ออนไลน์|shopee|lazada)/i],
    ['utility',/(ค่าไฟ|ค่าน้ำ|อินเทอร์เน็ต|เน็ตบ้าน|โทรศัพท์|มือถือ|ค่าโทร)/],
    ['housing',/(ค่าเช่า|เช่าบ้าน|เช่าห้อง|คอนโด|ส่วนกลาง)/],
    ['health',/(ยา|โรงพยาบาล|คลินิก|หมอ|ทันต|สุขภาพ)/],
    ['entertainment',/(netflix|spotify|youtube|เกม|หนัง|ภาพยนตร์|คาราโอเกะ|บันเทิง)/i],
    ['salary',/(เงินเดือน|ค่าจ้าง|salary)/i],
    ['gift',/(แม่ให้|พ่อให้|ครอบครัวให้|ของขวัญ|ได้เงินจากแม่|ได้เงินจากพ่อ)/]
  ];
  for (const [key, re] of cats) {
    if (re.test(lower)) { result.categoryKey = key; result.confidence += 0.12; break; }
  }

  const banks = [
    ['กสิกร',/(กสิกร|kbank|k plus)/i],
    ['ไทยพาณิชย์',/(ไทยพาณิชย์|scb)/i],
    ['กรุงไทย',/(กรุงไทย|krungthai|next)/i],
    ['กรุงเทพ',/(ธนาคารกรุงเทพ|bangkok bank|bualuang)/i],
    ['กรุงศรี',/(กรุงศรี|krungsri)/i],
    ['ttb',/(ttb|ทีทีบี|ทหารไทย)/i],
    ['ออมสิน',/(ออมสิน|gsb)/i]
  ];
  for (const [name, re] of banks) if (re.test(lower)) { result.accountHint = name; result.confidence += 0.08; break; }

  let desc = text;
  desc = desc.replace(/(\d+(?:\.\d{1,2})?)\s*(?:บาท|บ\.?|฿)/g, '');
  desc = desc.replace(/[ศูนย์หนึ่งเอ็ดสองยี่สามสี่ห้าหกเจ็ดแปดเก้าสิบร้อยพันหมื่นแสนล้าน]+\s*บาท/g, '');
  desc = desc.replace(/^(จ่าย|ซื้อ|เสียค่า|ชำระ|ได้รับ|รับเงิน|ได้เงิน|รายรับ|รายจ่าย)\s*/i, '');
  desc = desc.replace(/\s*(วันนี้|เมื่อวาน|เมื่อวานนี้)\s*/g, ' ');
  desc = desc.replace(/\s{2,}/g, ' ').trim();
  result.description = desc || text;

  if (!result.type) {
    result.needsReview = true;
    result.reason = 'ยังแยกไม่ออกว่าเป็นรายรับหรือรายจ่าย';
  }
  if (!result.amount || result.amount <= 0) {
    result.needsReview = true;
    result.reason = result.reason || 'ยังจับจำนวนเงินไม่ได้';
  }
  result.confidence = Math.min(1, result.confidence);
  if (result.type === 'transfer') result.confidence = Math.min(result.confidence, 0.45);
  return result;
}

const parserCases = [
  ['จ่ายค่าก๋วยเตี๋ยว 50 บาท', 'expense', 50, 'food'],
  ['ได้เงินจากแม่ 100 บาท', 'income', 100, 'gift'],
  ['เติมน้ำมัน 800 บาทเมื่อวาน', 'expense', 800, 'transport'],
  ['เงินเดือนเข้า 25,000 บาท', 'income', 25000, 'salary'],
  ['จ่ายกาแฟ ห้าสิบบาท', 'expense', 50, 'food']
];
for (const [text, type, amount, categoryKey] of parserCases) {
  const parsed = parseVoiceText(text);
  if (parsed.type !== type || Number(parsed.amount) !== amount || parsed.categoryKey !== categoryKey) {
    throw new Error(`Voice parser failed for "${text}": ${JSON.stringify(parsed)}`);
  }
}

if (!html.includes('MONEYFLOW_VOICE_ENTRY_V1')) {
  const css = `
<style id="moneyflow-voice-entry-css">
  #mfVoiceButton{position:fixed;right:18px;bottom:calc(92px + env(safe-area-inset-bottom));z-index:100050;width:62px;height:62px;border:0;border-radius:50%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#6366f1,#ec4899);color:#fff;font-size:28px;box-shadow:0 14px 34px rgba(79,70,229,.34);cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;transition:transform .15s ease,box-shadow .15s ease,filter .15s ease}
  #mfVoiceButton:active,#mfVoiceButton.listening{transform:scale(1.08);box-shadow:0 18px 42px rgba(79,70,229,.44);filter:saturate(1.12)}
  #mfVoiceButton.listening:before{content:'';position:absolute;inset:-9px;border:3px solid rgba(99,102,241,.30);border-radius:50%;animation:mfVoicePulse 1s ease-out infinite}
  #mfVoiceButton.canceling{background:linear-gradient(135deg,#ef4444,#f97316)}
  #mfVoiceButton.unsupported{filter:grayscale(.7);opacity:.72}
  #mfVoiceButton .mf-v-mic{pointer-events:none}
  #mfVoiceButton .mf-v-label{position:absolute;right:70px;white-space:nowrap;padding:7px 10px;border-radius:10px;background:rgba(15,23,42,.86);color:#fff;font-size:11px;font-weight:700;opacity:0;transform:translateX(6px);pointer-events:none;transition:.15s}
  #mfVoiceButton:hover .mf-v-label,#mfVoiceButton:focus-visible .mf-v-label{opacity:1;transform:none}
  #mfVoiceHud{position:fixed;left:50%;bottom:calc(168px + env(safe-area-inset-bottom));transform:translateX(-50%) translateY(10px);z-index:100060;width:min(92vw,440px);padding:14px 16px;border-radius:18px;background:rgba(15,23,42,.94);color:#fff;box-shadow:0 18px 44px rgba(15,23,42,.28);opacity:0;pointer-events:none;transition:.16s ease}
  #mfVoiceHud.show{opacity:1;transform:translateX(-50%) translateY(0)}
  #mfVoiceHud.cancel{background:rgba(127,29,29,.96)}
  .mf-v-title{font-size:13px;font-weight:850;display:flex;align-items:center;gap:8px}
  .mf-v-dot{width:9px;height:9px;border-radius:50%;background:#fb7185;box-shadow:0 0 0 0 rgba(251,113,133,.55);animation:mfDotPulse 1s infinite}
  .mf-v-text{margin-top:7px;font-size:15px;line-height:1.5;min-height:22px;word-break:break-word}
  .mf-v-hint{margin-top:5px;font-size:11px;color:#cbd5e1}
  #mfVoiceReview{position:fixed;inset:0;z-index:100080;display:flex;align-items:flex-end;justify-content:center;background:rgba(15,23,42,.42);padding:0}
  #mfVoiceReview.hidden{display:none!important}
  .mf-v-sheet{width:100%;max-width:520px;max-height:82vh;overflow:auto;border-radius:24px 24px 0 0;background:var(--card,#fff);color:var(--text,#172033);padding:20px 18px calc(20px + env(safe-area-inset-bottom));box-shadow:0 -18px 50px rgba(15,23,42,.24)}
  .mf-v-sheet h3{margin:0 0 5px;font-size:19px}.mf-v-sub{font-size:12px;color:var(--muted,#667085);line-height:1.55}
  .mf-v-preview{margin:14px 0;padding:14px;border-radius:16px;background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.13)}
  .mf-v-amount{font-size:26px;font-weight:900}.mf-v-meta{margin-top:5px;font-size:13px;line-height:1.6;color:var(--muted,#667085)}
  .mf-v-actions{display:grid;grid-template-columns:1fr 1.4fr;gap:9px;margin-top:14px}.mf-v-actions button{min-height:48px;border-radius:14px;font-weight:800}
  .mf-v-status{margin-top:10px;font-size:12px;color:var(--muted,#667085)}
  @keyframes mfVoicePulse{0%{transform:scale(.88);opacity:.9}100%{transform:scale(1.28);opacity:0}}
  @keyframes mfDotPulse{0%{box-shadow:0 0 0 0 rgba(251,113,133,.55)}100%{box-shadow:0 0 0 9px rgba(251,113,133,0)}}
  @media(min-width:700px){#mfVoiceButton{right:26px;bottom:28px;width:58px;height:58px}#mfVoiceHud{bottom:104px}#mfVoiceReview{align-items:center;padding:18px}.mf-v-sheet{border-radius:24px}}
  @media(max-width:420px){#mfVoiceButton{width:58px;height:58px;right:14px}.mf-v-actions{grid-template-columns:1fr}}
  @media(prefers-reduced-motion:reduce){#mfVoiceButton,#mfVoiceHud,.mf-v-dot,#mfVoiceButton.listening:before{animation:none!important;transition:none!important}}
</style>`;
  html = html.replace('</head>', css + '\n</head>');

  const runtime = `
<script>
/* MONEYFLOW_VOICE_ENTRY_V1 */
(function(){
  ${normalizeThaiDigits.toString()}
  ${thaiNumberWordsToValue.toString()}
  ${parseVoiceText.toString()}

  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  const state={recognition:null,listening:false,canceled:false,startedAt:0,startX:0,startY:0,finalText:'',interimText:'',processing:false,lastParsed:null,ignoreClickUntil:0};
  const byId=id=>document.getElementById(id);
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const money=value=>{try{return new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB',minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(value||0))}catch(e){return '฿'+Number(value||0).toLocaleString()}};
  const localDate=offset=>{const d=new Date();d.setDate(d.getDate()+Number(offset||0));const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return y+'-'+m+'-'+day};

  function toastSafe(message,type){try{if(typeof toast==='function')toast(message,type||'info')}catch(e){}}
  function ensureUi(){
    if(!byId('mfVoiceButton')){
      const btn=document.createElement('button');btn.id='mfVoiceButton';btn.type='button';btn.setAttribute('aria-label','กดค้างเพื่อบันทึกรายการด้วยเสียง');btn.innerHTML='<span class="mf-v-mic">🎤</span><span class="mf-v-label">กดค้างเพื่อพูด</span>';document.body.appendChild(btn);
      btn.addEventListener('contextmenu',e=>e.preventDefault());
      btn.addEventListener('pointerdown',voicePointerDown);
      btn.addEventListener('pointermove',voicePointerMove);
      btn.addEventListener('pointerup',voicePointerUp);
      btn.addEventListener('pointercancel',voicePointerCancel);
      btn.addEventListener('click',e=>{e.preventDefault();if(Date.now()<state.ignoreClickUntil)return;if(!state.startedAt)toastSafe(Recognition?'กดค้างที่ไมค์ แล้วปล่อยเมื่อพูดเสร็จ':'อุปกรณ์/เบราว์เซอร์นี้ยังไม่รองรับการอ่านข้อความเสียง','info')});
      if(!Recognition)btn.classList.add('unsupported');
    }
    if(!byId('mfVoiceHud')){
      const hud=document.createElement('div');hud.id='mfVoiceHud';hud.innerHTML='<div class="mf-v-title"><span class="mf-v-dot"></span><span id="mfVoiceHudTitle">กำลังฟัง…</span></div><div id="mfVoiceHudText" class="mf-v-text">พูดได้เลย</div><div id="mfVoiceHudHint" class="mf-v-hint">ปล่อยนิ้วเพื่อประมวลผล • ลากออกจากปุ่มเพื่อยกเลิก</div>';document.body.appendChild(hud);
    }
    if(!byId('mfVoiceReview')){
      const review=document.createElement('div');review.id='mfVoiceReview';review.className='hidden';review.innerHTML='<div class="mf-v-sheet" role="dialog" aria-modal="true" aria-labelledby="mfVoiceReviewTitle"><h3 id="mfVoiceReviewTitle">ตรวจรายการจากเสียง</h3><div id="mfVoiceReviewSub" class="mf-v-sub"></div><div class="mf-v-preview"><div id="mfVoiceReviewAmount" class="mf-v-amount"></div><div id="mfVoiceReviewMeta" class="mf-v-meta"></div></div><div id="mfVoiceReviewStatus" class="mf-v-status"></div><div class="mf-v-actions"><button type="button" class="btn btn-light" id="mfVoiceEditBtn">แก้ไขในฟอร์ม</button><button type="button" class="btn btn-primary" id="mfVoiceSaveBtn">บันทึกรายการ</button></div></div>';document.body.appendChild(review);
      review.addEventListener('click',e=>{if(e.target===review)closeReview()});
      byId('mfVoiceSaveBtn').onclick=()=>saveParsed(state.lastParsed,false);
      byId('mfVoiceEditBtn').onclick=()=>openParsedInForm(state.lastParsed);
    }
  }

  function showHud(title,text,hint,cancel){
    ensureUi();const hud=byId('mfVoiceHud');hud.classList.toggle('cancel',!!cancel);hud.classList.add('show');byId('mfVoiceHudTitle').textContent=title||'กำลังฟัง…';byId('mfVoiceHudText').textContent=text||'พูดได้เลย';byId('mfVoiceHudHint').textContent=hint||'ปล่อยนิ้วเพื่อประมวลผล';
  }
  function hideHud(delay){setTimeout(()=>byId('mfVoiceHud')?.classList.remove('show','cancel'),delay||0)}
  function closeReview(){byId('mfVoiceReview')?.classList.add('hidden')}
  function vibrate(pattern){try{if(navigator.vibrate)navigator.vibrate(pattern)}catch(e){}}

  function voicePointerDown(event){
    if(event.button!=null&&event.button!==0)return;
    event.preventDefault();ensureUi();
    if(state.processing||state.listening)return;
    if(!Recognition){toastSafe('Safari/Browser นี้ยังไม่รองรับ Speech Recognition ให้ใช้ฟอร์มบันทึกเดิมก่อน','warning');return}
    state.startedAt=Date.now();state.startX=event.clientX;state.startY=event.clientY;state.canceled=false;state.finalText='';state.interimText='';
    try{event.currentTarget.setPointerCapture(event.pointerId)}catch(e){}
    startRecognition();
  }
  function voicePointerMove(event){
    if(!state.listening||!state.startedAt)return;
    const dx=event.clientX-state.startX,dy=event.clientY-state.startY,dist=Math.hypot(dx,dy);
    const cancel=dist>82;
    state.canceled=cancel;
    const btn=byId('mfVoiceButton');btn?.classList.toggle('canceling',cancel);
    if(cancel)showHud('ปล่อยเพื่อยกเลิก',state.finalText||state.interimText||'ยกเลิกรายการเสียง','เลื่อนกลับมาที่ปุ่มเพื่อบันทึก',true);
    else showHud('กำลังฟัง…',state.finalText||state.interimText||'พูดได้เลย','ปล่อยนิ้วเพื่อประมวลผล • ลากออกจากปุ่มเพื่อยกเลิก',false);
  }
  function voicePointerUp(event){
    if(!state.startedAt)return;
    event.preventDefault();
    const duration=Date.now()-state.startedAt;
    state.startedAt=0;state.ignoreClickUntil=Date.now()+650;
    if(duration<220&&!state.finalText&&!state.interimText){state.canceled=true;toastSafe('กดค้างที่ไมค์ แล้วพูดก่อนปล่อยนิ้ว','info')}
    stopRecognition();
  }
  function voicePointerCancel(){if(!state.startedAt&&!state.listening)return;state.canceled=true;state.startedAt=0;abortRecognition();}

  function startRecognition(){
    try{
      const rec=new Recognition();state.recognition=rec;rec.lang='th-TH';rec.interimResults=true;rec.continuous=false;rec.maxAlternatives=1;
      rec.onstart=()=>{state.listening=true;byId('mfVoiceButton')?.classList.add('listening');showHud('กำลังฟัง…','พูดได้เลย','ปล่อยนิ้วเพื่อประมวลผล • ลากออกจากปุ่มเพื่อยกเลิก');vibrate(18)};
      rec.onresult=event=>{
        let finalText='',interim='';
        for(let i=event.resultIndex;i<event.results.length;i++){const t=event.results[i][0]?.transcript||'';if(event.results[i].isFinal)finalText+=t;else interim+=t}
        if(finalText)state.finalText=(state.finalText+' '+finalText).trim();
        state.interimText=interim.trim();
        if(!state.canceled)showHud('กำลังฟัง…',(state.finalText+' '+state.interimText).trim()||'พูดได้เลย','ปล่อยนิ้วเพื่อประมวลผล • ลากออกจากปุ่มเพื่อยกเลิก');
      };
      rec.onerror=event=>{
        const code=String(event.error||'');
        if(code==='not-allowed'||code==='service-not-allowed')toastSafe('กรุณาอนุญาตไมโครโฟนให้ MoneyFlow แล้วลองอีกครั้ง','warning');
        else if(code==='no-speech')toastSafe('ยังไม่ได้ยินเสียง ลองกดค้างแล้วพูดใกล้ไมค์ขึ้น','info');
        else if(code!=='aborted')toastSafe('อ่านข้อความเสียงไม่สำเร็จ: '+code,'warning');
      };
      rec.onend=()=>finishRecognition();
      rec.start();
    }catch(error){state.listening=false;state.recognition=null;byId('mfVoiceButton')?.classList.remove('listening','canceling');hideHud();toastSafe('ไม่สามารถเปิดไมโครโฟนได้ กรุณาลองใหม่','warning')}
  }
  function stopRecognition(){try{state.recognition?.stop()}catch(e){finishRecognition()}}
  function abortRecognition(){try{state.recognition?.abort()}catch(e){}finishRecognition()}
  function finishRecognition(){
    const transcript=(state.finalText||state.interimText||'').trim();
    const canceled=state.canceled;
    state.listening=false;state.recognition=null;state.interimText='';state.finalText='';
    byId('mfVoiceButton')?.classList.remove('listening','canceling');
    if(canceled){state.canceled=false;showHud('ยกเลิกแล้ว','ไม่ได้บันทึกรายการ','กดค้างเพื่อเริ่มใหม่',true);hideHud(650);return}
    if(!transcript){hideHud(180);return}
    showHud('กำลังประมวลผล…',transcript,'MoneyFlow กำลังแยกยอด หมวด และรายละเอียด');
    state.processing=true;
    setTimeout(()=>processTranscript(transcript).finally(()=>{state.processing=false;hideHud(220)}),30);
  }

  function categoriesPromise(){
    try{
      if(window.CACHE&&Array.isArray(CACHE.categories)&&CACHE.categories.length)return Promise.resolve(CACHE.categories);
    }catch(e){}
    return new Promise((resolve,reject)=>{
      try{google.script.run.withSuccessHandler(rows=>resolve(Array.isArray(rows)?rows:[])).withFailureHandler(reject).getCategories(TOKEN)}
      catch(e){resolve([])}
    });
  }
  function categoryName(row){return String(row?.name??row?.category??row?.label??'').trim()}
  function categoryType(row){return String(row?.type??'').toLowerCase()}
  function chooseCategory(rows,parsed){
    const type=parsed.type==='income'?'income':'expense';
    const names={
      food:['อาหาร','ของกิน','เครื่องดื่ม'],
      transport:['เดินทาง','ขนส่ง','รถ','น้ำมัน'],
      shopping:['ช้อป','ซื้อของ','ของใช้'],
      utility:['สาธารณูปโภค','บิล','ค่าใช้จ่ายประจำ'],
      housing:['ที่อยู่อาศัย','บ้าน','ค่าเช่า'],
      health:['สุขภาพ','รักษา','ยา'],
      entertainment:['บันเทิง','สมาชิก','subscription'],
      salary:['เงินเดือน','ค่าจ้าง'],
      gift:['รายรับอื่น','ของขวัญ','ครอบครัว']
    }[parsed.categoryKey]||[];
    const filtered=rows.filter(row=>!categoryType(row)||categoryType(row)===type);
    for(const wanted of names){const hit=filtered.find(row=>categoryName(row).includes(wanted));if(hit)return categoryName(hit)}
    const other=filtered.find(row=>/อื่น|ทั่วไป/.test(categoryName(row)));
    if(other)return categoryName(other);
    return filtered.length?categoryName(filtered[0]):(type==='income'?'รายรับอื่นๆ':'อื่นๆ');
  }

  function findAccountId(hint){
    if(!hint)return 'daily_wallet';
    const selects=['transactionAccount','transactionFromAccount','accountId'].map(byId).filter(Boolean);
    for(const select of selects){for(const option of Array.from(select.options||[])){if(String(option.textContent||'').toLowerCase().includes(String(hint).toLowerCase()))return String(option.value||'')}}
    try{
      const pools=[window.CURRENT_ACCOUNTS,window.SAVINGS_ACCOUNTS,window.CACHE&&CACHE.savings&&CACHE.savings.accounts].filter(Array.isArray);
      for(const pool of pools){const row=pool.find(a=>String(a?.name||'').toLowerCase().includes(String(hint).toLowerCase()));if(row)return String(row.id||row.accountId||'')}
    }catch(e){}
    return '';
  }

  async function processTranscript(transcript){
    const parsed=parseVoiceText(transcript);
    state.lastParsed=parsed;
    if(parsed.type==='transfer'){showReview(parsed,'รายการโอนต้องตรวจบัญชีต้นทางและปลายทางก่อน');return}
    let categories=[];
    try{categories=await categoriesPromise()}catch(e){}
    parsed.category=chooseCategory(categories,parsed);
    parsed.accountId=findAccountId(parsed.accountHint);
    parsed.date=localDate(parsed.dateOffset);
    if(parsed.accountHint&&!parsed.accountId){parsed.needsReview=true;parsed.reason='พบชื่อบัญชี “'+parsed.accountHint+'” แต่ยังจับคู่กับบัญชีใน MoneyFlow ไม่ได้'}
    if(!parsed.needsReview&&parsed.confidence>=0.78){
      await saveParsed(parsed,true);
    }else{
      showReview(parsed,parsed.reason||'กรุณาตรวจรายการก่อนบันทึก');
    }
  }

  function showReview(parsed,message){
    ensureUi();state.lastParsed=parsed;const review=byId('mfVoiceReview');review.classList.remove('hidden');
    byId('mfVoiceReviewSub').textContent='ได้ยิน: “'+String(parsed.text||'')+'”';
    byId('mfVoiceReviewAmount').textContent=(parsed.type==='income'?'+':parsed.type==='expense'?'-':'')+money(parsed.amount||0);
    const typeLabel=parsed.type==='income'?'รายรับ':parsed.type==='expense'?'รายจ่าย':parsed.type==='transfer'?'โอนเงิน':'ยังไม่ทราบประเภท';
    const bits=[typeLabel,parsed.category||'ยังไม่ทราบหมวด',parsed.accountHint?('บัญชี '+parsed.accountHint):(parsed.accountId==='daily_wallet'?'เงินใช้ประจำวัน':''),parsed.dateOffset===-1?'เมื่อวาน':'วันนี้',parsed.description].filter(Boolean);
    byId('mfVoiceReviewMeta').textContent=bits.join(' • ');
    byId('mfVoiceReviewStatus').textContent=message||'';
    byId('mfVoiceSaveBtn').disabled=!(parsed.amount>0)||!['income','expense'].includes(parsed.type);
  }

  async function saveParsed(parsed,auto){
    if(!parsed||!parsed.amount||!['income','expense'].includes(parsed.type)){showReview(parsed||{},'ข้อมูลยังไม่ครบ กรุณาแก้ไขในฟอร์ม');return}
    if(!parsed.category){let rows=[];try{rows=await categoriesPromise()}catch(e){}parsed.category=chooseCategory(rows,parsed)}
    if(!parsed.accountId)parsed.accountId='daily_wallet';
    const payload={type:parsed.type,amount:Number(parsed.amount),category:String(parsed.category||''),description:String(parsed.description||parsed.text||'บันทึกด้วยเสียง'),date:parsed.date||localDate(parsed.dateOffset),accountId:String(parsed.accountId)};
    closeReview();showHud('กำลังบันทึก…',(parsed.type==='income'?'+':'-')+money(parsed.amount)+' • '+payload.category,'กำลังบันทึกเข้า MoneyFlow');
    return new Promise(resolve=>{
      try{
        google.script.run
          .withSuccessHandler(result=>{
            if(result&&result.offline){showHud('เก็บไว้รอซิงก์แล้ว',(parsed.type==='income'?'+':'-')+money(parsed.amount)+' • '+payload.category,'จะส่งเข้า D1 อัตโนมัติเมื่อกลับมาออนไลน์');toastSafe('🎤 เก็บรายการเสียงไว้รอซิงก์แล้ว','warning')}
            else{showHud('✓ บันทึกแล้ว',(parsed.type==='income'?'+':'-')+money(parsed.amount)+' • '+payload.category,auto?'บันทึกอัตโนมัติจากเสียง':'บันทึกรายการจากเสียงแล้ว');toastSafe('🎤 บันทึกจากเสียงแล้ว','success')}
            try{if(window.CACHE&&CACHE.at){CACHE.at.dashboard=0;CACHE.at.transactions=0;CACHE.at.savings=0}}catch(e){}
            setTimeout(()=>{try{if(typeof loadDashboard==='function'&&document.getElementById('page-dashboard')?.classList.contains('active'))loadDashboard(true)}catch(e){}},140);
            hideHud(1200);resolve(result);
          })
          .withFailureHandler(error=>{showReview(parsed,'บันทึกไม่สำเร็จ: '+String(error&&error.message||error));toastSafe('บันทึกจากเสียงไม่สำเร็จ','error');resolve(null)})
          .addTransaction(TOKEN,payload);
      }catch(error){showReview(parsed,'บันทึกไม่สำเร็จ: '+String(error&&error.message||error));resolve(null)}
    });
  }

  function openParsedInForm(parsed){
    closeReview();
    if(!parsed)return;
    try{
      if(parsed.type==='transfer'){
        if(typeof openTransferModal==='function'){openTransferModal();setTimeout(()=>{const a=byId('transferAmount');if(a&&parsed.amount)a.value=String(parsed.amount)},100);return}
        toastSafe('กรุณาเปิดเมนูโอนเงินเพื่อเลือกบัญชีต้นทางและปลายทาง','info');return;
      }
      const pref={type:parsed.type==='income'?'income':'expense',accountId:parsed.accountId||'daily_wallet'};
      if(typeof openTransactionModal==='function')openTransactionModal(pref);
      setTimeout(()=>{
        const set=(id,value)=>{const el=byId(id);if(el&&value!=null){el.value=String(value);el.dispatchEvent(new Event('change',{bubbles:true}))}};
        set('transactionType',pref.type);set('transactionAmount',parsed.amount||'');set('transactionCategory',parsed.category||'');set('transactionAccount',pref.accountId);set('transactionDate',parsed.date||localDate(parsed.dateOffset));
        const desc=byId('transactionDescription')||byId('transactionNote')||byId('description');if(desc)desc.value=parsed.description||parsed.text||'';
      },100);
    }catch(error){toastSafe('เปิดฟอร์มแก้ไขไม่สำเร็จ','warning')}
  }

  window.__moneyflowParseVoiceText=parseVoiceText;
  window.__moneyflowVoiceStart=()=>{ensureUi();toastSafe('กดค้างที่ปุ่ม 🎤 เพื่อเริ่มพูด','info')};
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.listening){state.canceled=true;abortRecognition()}});
  addEventListener('blur',()=>{if(state.listening&&state.startedAt){state.canceled=true;abortRecognition()}});
  document.addEventListener('DOMContentLoaded',ensureUi,{once:true});
  if(document.readyState!=='loading')ensureUi();
})();
</script>`;
  html = html.replace('</body>', runtime + '\n</body>');
  await writeFile(indexPath, html);
}

console.log('Applied MoneyFlow push-to-talk voice entry with Thai parser and mobile safety UX');
