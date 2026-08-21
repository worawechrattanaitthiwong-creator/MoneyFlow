import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = join(root, 'public', 'index.html');
const swPath = join(root, 'public', 'sw.js');
const workerPath = join(root, 'src', 'index.js');
let html = await readFile(htmlPath, 'utf8');

/* MONEYFLOW_FREE_SMART_FINANCE_V1
   User-facing product is intentionally rule-based/local-data only.
   No external model API, billing SDK, or paid analysis service is required. */

const replacements = [
  ['THAI AI PERSONAL FINANCE · BETA FULL ACCESS', 'SMART PERSONAL FINANCE · ฟรี'],
  ['THAI AI PERSONAL FINANCE', 'SMART PERSONAL FINANCE'],
  ['MoneyFlow AI', 'MoneyFlow Smart Finance'],
  ['เปิด MoneyFlow AI', 'เปิดแผนการเงิน'],
  ['Rule + Learning AI', 'กฎ + เรียนรู้จากรายการเดิม'],
  ['Smart Engine ใช้ข้อมูล MoneyFlow/D1 ของคุณ โดยยังไม่ต้องใช้ AI API เสียเงิน', 'คำนวณจากข้อมูล MoneyFlow/D1 ของคุณโดยตรง ไม่มีค่าบริการ API เพิ่ม'],
  ['กำลังวิเคราะห์ข้อมูลการเงินของคุณ…', 'กำลังคำนวณข้อมูลการเงินของคุณ…'],
  ['กำลังเรียนรู้รูปแบบการเงิน', 'กำลังเรียนรู้จากรายการเดิม'],
  ['Auto Capture Inbox', 'Capture Inbox (วางข้อความเอง)'],
  ['Android Notification Auto Capture', 'Android Notification Capture (ยังไม่เปิด)'],
  ["function modeName(mode){return ({personal:'Free',pro:'Pro',family:'Family',freelancer:'Freelancer'})[mode]||'Free'}", "function modeName(mode){return ({personal:'ส่วนตัว',family:'ครอบครัว',freelancer:'ฟรีแลนซ์'})[mode]||'ส่วนตัว'}"],
  ["['personal','pro','family','freelancer']", "['personal','family','freelancer']"],
  ['>Pro<', '>ฟรี<'],
  ['.mf-ai-modes{display:grid;grid-template-columns:repeat(4,1fr);', '.mf-ai-modes{display:grid;grid-template-columns:repeat(3,1fr);'],
  ["b.textContent='✨';", "b.innerHTML='<span aria-hidden=\"true\">📊</span><span class=\"mf-smart-btn-label\">แผนการเงิน</span>';"],
  ['#mfAiHubButton{position:fixed;right:18px;bottom:calc(164px + env(safe-area-inset-bottom));z-index:100045;width:54px;height:54px;', '#mfAiHubButton{position:fixed;right:14px;bottom:calc(164px + env(safe-area-inset-bottom));z-index:100045;width:116px;height:54px;'],
  ['font-size:23px;display:flex;align-items:center;justify-content:center;cursor:pointer;', 'font-size:19px;display:flex;gap:7px;align-items:center;justify-content:center;cursor:pointer;']
];
for (const [from, to] of replacements) html = html.split(from).join(to);

// Final user-facing safety pass. Internal legacy identifiers may still use "ai" in variable/class names,
// but no Pro selector or paid/external AI endpoint is allowed to survive into the generated UI.
html = html.replace(/>\s*Pro\s*</g, '>ฟรี<');

if (!html.includes('MONEYFLOW_FREE_SMART_FINANCE_V1')) {
  const extra = `
<style id="moneyflow-free-smart-finance-css">
  .mf-smart-btn-label{font-size:11px;font-weight:900;white-space:nowrap}
  .mf-free-note{margin:8px 0 12px;padding:10px 12px;border-radius:13px;background:rgba(16,185,129,.09);font-size:11px;line-height:1.55}
  @media(max-width:420px){#mfAiHubButton{right:12px;width:108px}}
</style>
<script>
/* MONEYFLOW_FREE_SMART_FINANCE_V1 */
(function(){
  window.__moneyflowSmartFinanceCostMode='free_rule_based';
  function addFreeNote(){
    const content=document.getElementById('mfAiHubContent');
    if(!content||content.querySelector('.mf-free-note'))return;
    const head=content.querySelector('.mf-ai-head');
    if(!head)return;
    const note=document.createElement('div');
    note.className='mf-free-note';
    note.textContent='เครื่องมือชุดนี้คำนวณจากข้อมูลใน MoneyFlow และกฎภายในระบบเท่านั้น ไม่มีค่าบริการ API เพิ่ม';
    head.insertAdjacentElement('afterend',note);
  }
  const observer=new MutationObserver(addFreeNote);
  document.addEventListener('DOMContentLoaded',()=>{observer.observe(document.body,{childList:true,subtree:true});addFreeNote()},{once:true});
  if(document.readyState!=='loading'){observer.observe(document.body,{childList:true,subtree:true});addFreeNote()}
})();
</script>`;
  html = html.replace('</body>', extra + '\n</body>');
}

await writeFile(htmlPath, html);

try {
  let sw = await readFile(swPath, 'utf8');
  sw = sw.replace(/moneyflow-shell-v\d+/g, 'moneyflow-shell-v9');
  await writeFile(swPath, sw);
} catch {}

try {
  let worker = await readFile(workerPath, 'utf8');
  worker = worker.replace(/version: '6\.2-cloudflare\.\d+'/g, "version: '6.2-cloudflare.8'");
  await writeFile(workerPath, worker);
} catch {}

console.log('Applied free Smart Finance UX: rule-based, visible on mobile, no Pro mode');
