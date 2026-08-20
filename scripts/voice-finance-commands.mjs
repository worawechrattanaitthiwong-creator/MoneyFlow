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
  throw new Error('Voice finish hook was not found; refusing to build partial voice scope lock');
}

if (!html.includes('MONEYFLOW_VOICE_SCOPE_LOCK_V1')) {
  const runtime = `
<script>
/* MONEYFLOW_VOICE_SCOPE_LOCK_V1 */
(function(){
  const BLOCK_ACTION_RE=/(?:^|\\s)(?:โอน|ย้ายเงิน|โยกเงิน|ส่งเงิน|ลบ|ลบทิ้ง|เอาออก|ใช้หนี้|จ่ายหนี้|ชำระหนี้|โปะหนี้|คืนหนี้)(?:\\s|$)/i;
  const BLOCK_DOMAIN_RE=/(?:หุ้น|ลงทุน|กองทุน|เงินเก็บ|เงินออม|ออมทรัพย์|หนี้|บัตรเครดิต|สินเชื่อ|ผ่อนหนี้)/i;
  const BANK_RE=/(?:กสิกร|kbank|k plus|ไทยพาณิชย์|scb|กรุงไทย|krungthai|next|ธนาคารกรุงเทพ|bangkok bank|bualuang|กรุงศรี|krungsri|ttb|ทีทีบี|ทหารไทย|ออมสิน|gsb)/i;
  const ALLOWED_ACCOUNT_RE=/(?:เงินใช้ประจำวัน|ใช้จ่ายประจำวัน|กระเป๋าใช้|daily wallet|บัญชีเงินเดือน|กระเป๋าเงินเดือน|salary account)/i;
  const ACCOUNT_WORD_RE=/(?:บัญชี|กระเป๋า)/i;
  function toastSafe(message,type){try{if(typeof toast==='function')toast(message,type||'info')}catch(e){}}
  function showBlocked(text){
    try{
      const hud=document.getElementById('mfVoiceHud');
      if(hud){hud.classList.add('show');const title=document.getElementById('mfVoiceHudTitle'),body=document.getElementById('mfVoiceHudText'),hint=document.getElementById('mfVoiceHudHint');if(title)title.textContent='คำสั่งเสียงนี้ปิดไว้';if(body)body.textContent=String(text||'');if(hint)hint.textContent='เสียงรองรับเฉพาะรายรับ/รายจ่ายของเงินใช้ประจำวันและบัญชีเงินเดือน';setTimeout(()=>hud.classList.remove('show'),1800)}
    }catch(e){}
    toastSafe('เสียงรองรับเฉพาะรายรับ/รายจ่ายของเงินใช้ประจำวันและบัญชีเงินเดือน','warning');
  }
  function blocked(text){
    const raw=String(text||'').trim();
    if(!raw)return false;
    if(BLOCK_ACTION_RE.test(raw)||BLOCK_DOMAIN_RE.test(raw))return true;
    if(BANK_RE.test(raw))return true;
    if(ACCOUNT_WORD_RE.test(raw)&&!ALLOWED_ACCOUNT_RE.test(raw))return true;
    return false;
  }
  window.__moneyflowHandleVoiceCommand=async function(transcript,fallback){
    if(blocked(transcript)){showBlocked(transcript);return true}
    window.__moneyflowActiveVoiceText=String(transcript||'');
    try{return await fallback(transcript)}finally{window.__moneyflowActiveVoiceText=''}
  };
  window.__moneyflowVoiceScope='daily_wallet+salary_only';
})();
</script>`;
  html = html.replace('</body>', runtime + '\n</body>');
  await writeFile(indexPath, html);
}

try {
  let sw = await readFile(swPath, 'utf8');
  sw = sw.replace(/moneyflow-shell-v\\d+/g, 'moneyflow-shell-v7');
  await writeFile(swPath, sw);
} catch {}

console.log('Locked voice commands to income/expense on Daily Wallet and Salary account only');
