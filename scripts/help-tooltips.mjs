import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = join(root, 'public', 'index.html');
let html = await readFile(indexPath, 'utf8');

if (!html.includes('MONEYFLOW_HELP_V1')) {
  const css = `
<style id="moneyflow-help-css">
  .mf-info-label{display:inline-flex!important;align-items:center;gap:5px;max-width:100%}
  .mf-info-btn{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:22px;height:22px;padding:0;border:1px solid rgba(99,102,241,.22);border-radius:50%;background:rgba(99,102,241,.10);color:#4f46e5;font-size:13px;font-weight:800;line-height:1;cursor:pointer;vertical-align:middle;transition:transform .15s ease,background .15s ease,border-color .15s ease;touch-action:manipulation}
  .mf-info-btn:hover{background:rgba(99,102,241,.18);border-color:rgba(99,102,241,.34);transform:translateY(-1px)}
  .mf-info-btn:focus-visible{outline:3px solid rgba(99,102,241,.25);outline-offset:2px}
  .mf-info-overlay{position:fixed;inset:0;z-index:100200;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(15,23,42,.42);backdrop-filter:blur(4px)}
  .mf-info-overlay.hidden{display:none!important}
  .mf-info-sheet{width:min(92vw,480px);max-height:min(82vh,680px);overflow:auto;background:var(--card,#fff);color:var(--text,#172033);border:1px solid var(--border,#e5e7eb);border-radius:24px;padding:20px;box-shadow:0 24px 70px rgba(15,23,42,.28);animation:mfInfoIn .16s ease-out}
  .mf-info-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:12px}
  .mf-info-kicker{font-size:11px;font-weight:800;letter-spacing:.04em;color:var(--primary,#6366f1);text-transform:uppercase;margin-bottom:3px}
  .mf-info-title{margin:0;font-size:20px;line-height:1.35}
  .mf-info-close{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border:1px solid var(--border,#e5e7eb);border-radius:12px;background:var(--card,#fff);color:var(--text,#172033);font-size:22px;line-height:1;cursor:pointer;flex:0 0 auto}
  .mf-info-desc{margin:0;color:var(--muted,#667085);font-size:14px;line-height:1.7}
  .mf-info-formula,.mf-info-note{margin-top:14px;padding:12px 13px;border-radius:15px;background:rgba(99,102,241,.07);border:1px solid rgba(99,102,241,.12)}
  .mf-info-formula span,.mf-info-note span{display:block;font-size:11px;font-weight:800;color:var(--muted,#667085);margin-bottom:4px}
  .mf-info-formula strong,.mf-info-note strong{display:block;font-size:13px;line-height:1.6;color:var(--text,#172033)}
  .mf-info-example{margin-top:12px;font-size:12px;line-height:1.6;color:var(--muted,#667085)}
  body.dark .mf-info-btn{background:rgba(129,140,248,.14);border-color:rgba(129,140,248,.28);color:#c7d2fe}
  body.dark .mf-info-sheet,.dark .mf-info-sheet{background:#171d2a;border-color:#354055;color:#f8fafc}
  body.dark .mf-info-close{background:#202738;border-color:#3a455f;color:#f8fafc}
  body.dark .mf-info-formula,body.dark .mf-info-note{background:rgba(129,140,248,.10);border-color:rgba(129,140,248,.16)}
  @keyframes mfInfoIn{from{opacity:.65;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}
  @media(max-width:699px){
    .mf-info-overlay{align-items:flex-end;padding:0;background:rgba(15,23,42,.46)}
    .mf-info-sheet{width:100%;max-width:none;max-height:78vh;border-radius:24px 24px 0 0;padding:20px 18px calc(22px + env(safe-area-inset-bottom));animation:mfInfoSheetUp .18s ease-out}
    .mf-info-btn{width:24px;height:24px;font-size:14px}
    @keyframes mfInfoSheetUp{from{transform:translateY(28px);opacity:.7}to{transform:none;opacity:1}}
  }
  @media(prefers-reduced-motion:reduce){.mf-info-sheet,.mf-info-btn{animation:none!important;transition:none!important}}
</style>`;
  html = html.replace('</head>', css + '\n</head>');

  const runtime = `
<script>
/* MONEYFLOW_HELP_V1 */
(function(){
  const HELP={
    'dashboard.daily':{title:'เงินใช้ประจำวัน',desc:'ยอดเงินในกระเป๋าใช้ประจำวัน ซึ่งแยกจากบัญชีธนาคาร ใช้ติดตามเงินที่พร้อมใช้ในชีวิตประจำวันโดยเฉพาะ',formula:'ยอดเดิม + รายรับที่เข้ากระเป๋า − รายจ่ายที่ออกจากกระเป๋า ± การปรับยอด',note:'การปรับยอดใช้แก้ยอดจริงโดยไม่สร้างรายรับหรือรายจ่ายปลอม'},
    'dashboard.income':{title:'รายรับเดือนนี้',desc:'ผลรวมรายการประเภทรายรับในรอบเดือนการเงินปัจจุบัน',formula:'รวมยอดรายการ “รายรับ” ทั้งหมดในรอบเดือน',note:'การโอนเงินระหว่างบัญชีของตัวเองไม่ถือเป็นรายรับใหม่'},
    'dashboard.expense':{title:'รายจ่ายเดือนนี้',desc:'ผลรวมรายการประเภทรายจ่ายในรอบเดือนการเงินปัจจุบัน',formula:'รวมยอดรายการ “รายจ่าย” ทั้งหมดในรอบเดือน',note:'การโอนเงินภายในไม่ถูกนับเป็นรายจ่ายใหม่'},
    'dashboard.networth':{title:'มูลค่าสุทธิ (Net Worth)',desc:'มูลค่าทรัพย์สินที่กำหนดให้นับในมูลค่าสุทธิ หลังหักหนี้สิน',formula:'ทรัพย์สินที่รวมใน Net Worth − หนี้สิน',note:'บัญชีที่ปิดตัวเลือก “รวมในมูลค่าสุทธิ” จะไม่ถูกนำมาคำนวณ'},
    'dashboard.savings':{title:'เงินเก็บ',desc:'ยอดรวมบัญชีที่จัดประเภทเป็นเงินเก็บ',formula:'ผลรวมยอดบัญชีประเภทเงินเก็บ',note:'ยอดนี้อาจต่างจากมูลค่าสุทธิ เพราะ Net Worth ใช้เงื่อนไขการรวมบัญชีเพิ่มเติม'},
    'dashboard.investments':{title:'การลงทุน',desc:'ยอดรวมบัญชีที่จัดประเภทเป็นการลงทุน',formula:'ผลรวมมูลค่าบัญชีประเภทการลงทุน'},
    'dashboard.liabilities':{title:'หนี้สิน',desc:'ยอดหนี้รวมจากบัญชีเครดิตและบัญชีหนี้ที่ระบบติดตาม',formula:'ผลรวมยอดคงค้างของบัญชีหนี้สิน'},
    'dashboard.net':{title:'คงเหลือเดือนนี้',desc:'เงินสุทธิจากกระแสเงินเข้าและออกในรอบเดือน ไม่ใช่ยอดคงเหลือในทุกบัญชี',formula:'รายรับเดือนนี้ − รายจ่ายเดือนนี้',example:'ตัวอย่าง: รายรับ ฿10,000 − รายจ่าย ฿7,500 = คงเหลือ ฿2,500'},
    'dashboard.savingRate':{title:'อัตราออม',desc:'สัดส่วนเงินสุทธิที่เหลือเมื่อเทียบกับรายรับของรอบเดือน',formula:'max(0, (รายรับ − รายจ่าย) ÷ รายรับ × 100)',note:'ถ้ารายจ่ายมากกว่ารายรับ ระบบจะแสดงอัตราออมต่ำสุดที่ 0%'},
    'dashboard.txCount':{title:'จำนวนรายการ',desc:'จำนวนรายการรายรับและรายจ่ายในรอบเดือนการเงิน',formula:'นับรายการที่ไม่ใช่การโอนเงินภายใน'},
    'dashboard.goalCount':{title:'เป้าหมาย',desc:'จำนวนเป้าหมายการออมที่คุณสร้างไว้ใน MoneyFlow'},
    'accounts.total':{title:'มูลค่าบัญชีทั้งหมด',desc:'ยอดรวมบัญชีและกระเป๋าเงินที่อยู่ในหน้าบัญชี โดยไม่รวมกระเป๋าเงินใช้ประจำวัน',note:'ตัวเลขนี้เป็นภาพรวมของหน้าบัญชี และอาจไม่เท่ากับ Net Worth'},
    'accounts.liquid':{title:'บัญชีสภาพคล่อง',desc:'ยอดรวมบัญชีที่จัดเป็นเงินสภาพคล่องหรือเงินที่เข้าถึงได้ง่าย'},
    'accounts.savings':{title:'เงินเก็บ',desc:'ยอดรวมบัญชีประเภทเงินเก็บในหน้าบัญชี'},
    'accounts.investments':{title:'การลงทุน',desc:'ยอดรวมบัญชีประเภทการลงทุนในหน้าบัญชี'},
    'accounts.liabilities':{title:'หนี้สิน',desc:'ยอดรวมภาระหนี้จากบัตรเครดิตและบัญชีหนี้'},
    'accounts.account':{title:'ยอดบัญชีนี้',desc:'ยอดปัจจุบันของบัญชีนี้ตามรายการรับเข้า จ่ายออก โอนเงิน และการปรับยอดที่บันทึกไว้',note:'ถ้าซ่อนยอดอยู่ การแตะการ์ดบัญชีจะขอ PIN ก่อนเปิดรายละเอียด'},
    'accounts.detailIn':{title:'เงินเข้าในรอบนี้',desc:'ยอดเงินที่เคลื่อนไหวเข้าบัญชีนี้ในรอบเวลาที่ระบบกำลังสรุป'},
    'accounts.detailOut':{title:'เงินออกในรอบนี้',desc:'ยอดเงินที่เคลื่อนไหวออกจากบัญชีนี้ในรอบเวลาที่ระบบกำลังสรุป'},
    'accounts.health':{title:'ความถูกต้องของยอดบัญชี',desc:'ตรวจความสอดคล้องระหว่างยอดบัญชี Ledger และกระเป๋าเงินใช้ประจำวัน เพื่อช่วยจับข้อมูลที่อาจไม่ตรงกัน',note:'ถ้าพบจุดผิดปกติ ระบบจะแจ้งจำนวนจุดให้ตรวจสอบก่อนแก้ข้อมูลจริง'},
    'budget.item':{title:'สถานะงบประมาณ',desc:'เปรียบเทียบยอดที่ใช้จริงของหมวดนี้กับงบที่ตั้งไว้ในเดือนที่เลือก',formula:'เปอร์เซ็นต์ที่ใช้ = ใช้จริง ÷ งบที่ตั้ง × 100',note:'เกิน 100% หมายถึงใช้เกินงบของหมวดนั้น'},
    'goals.item':{title:'ความคืบหน้าเป้าหมาย',desc:'เปรียบเทียบยอดปัจจุบันของเป้าหมายกับยอดเป้าหมายที่ตั้งไว้',formula:'ความคืบหน้า = ยอดปัจจุบัน ÷ ยอดเป้าหมาย × 100'},
    'report.income':{title:'รายรับในรายงาน',desc:'รายรับทั้งหมดในรอบเดือนการเงินที่เลือก',formula:'รวมรายการรายรับในรอบเดือน'},
    'report.expense':{title:'รายจ่ายในรายงาน',desc:'รายจ่ายทั้งหมดในรอบเดือนการเงินที่เลือก',formula:'รวมรายการรายจ่ายในรอบเดือน'},
    'report.net':{title:'เงินสุทธิ',desc:'กระแสเงินที่เหลือหลังหักรายจ่ายจากรายรับ',formula:'รายรับ − รายจ่าย'},
    'report.count':{title:'จำนวนรายการ',desc:'จำนวนรายการรายรับและรายจ่ายของเดือนที่เลือก',formula:'นับรายการที่ไม่ใช่การโอนเงินภายใน'},
    'report.networth':{title:'มูลค่าสุทธิ (Net Worth)',desc:'ภาพรวมทรัพย์สินสุทธิ ณ ตอนที่รายงานถูกคำนวณ',formula:'ทรัพย์สินที่รวมใน Net Worth − หนี้สิน'},
    'report.transfer':{title:'โอนเงินภายใน',desc:'มูลค่ารวมของการย้ายเงินระหว่างบัญชีของคุณในเดือนนี้',note:'ยอดโอนไม่ถูกนับเป็นรายรับหรือรายจ่ายใหม่'},
    'report.avgDaily':{title:'รายจ่ายเฉลี่ยต่อวัน',desc:'รายจ่ายของรอบเดือนเฉลี่ยตามจำนวนวันในรอบการเงิน',formula:'รายจ่ายรวม ÷ จำนวนวันในรอบเดือน'},
    'report.liquid':{title:'เงินพร้อมใช้',desc:'ยอดที่ระบบจัดเป็นเงินพร้อมใช้หรือสภาพคล่องตามประเภทและการตั้งค่าบัญชี',note:'ไม่ใช่ตัวเลขเดียวกับ Net Worth เพราะ Net Worth รวมทรัพย์สินประเภทอื่นและหักหนี้'},
    'report.liabilities':{title:'หนี้สิน',desc:'ยอดหนี้รวมที่นำมาใช้คำนวณภาพรวมการเงิน'},
    'report.savingsIn':{title:'ฝากเข้าเงินเก็บ',desc:'ยอดโอนที่เข้าบัญชีประเภทเงินเก็บในรอบเดือนที่เลือก'},
    'report.savingsOut':{title:'ถอนออกจากเงินเก็บ',desc:'ยอดโอนที่ออกจากบัญชีประเภทเงินเก็บในรอบเดือนที่เลือก'},
    'report.savingsTotal':{title:'ยอดเงินเก็บทั้งหมด',desc:'ยอดรวมปัจจุบันของบัญชีประเภทเงินเก็บ'},
    'report.trend':{title:'แนวโน้ม 12 เดือน',desc:'เปรียบเทียบรายรับและรายจ่ายย้อนหลัง เพื่อดูทิศทางกระแสเงินในระยะยาว'},
    'report.nwHistory':{title:'ประวัติมูลค่าสุทธิ',desc:'กราฟ Snapshot ของ Net Worth ที่ MoneyFlow เก็บไว้ในแต่ละวัน',note:'ข้อมูลเริ่มมีตั้งแต่วันที่ระบบเริ่มบันทึก Snapshot'},
    'report.budgetActual':{title:'งบประมาณ vs ใช้จริง',desc:'เปรียบเทียบงบที่ตั้งไว้กับยอดใช้จริงของแต่ละหมวดในเดือนที่เลือก',formula:'ใช้จริง ÷ งบ × 100'},
    'report.daily':{title:'กระแสเงินรายวัน',desc:'กราฟรายรับและรายจ่ายแยกตามวันในรอบเดือน เพื่อดูวันที่มีเงินเข้าออกมากผิดปกติ'},
    'report.categories':{title:'หมวดรายจ่ายสูงสุด',desc:'จัดอันดับหมวดหมู่ตามยอดรายจ่ายจากมากไปน้อยในเดือนที่เลือก'}
  };

  function h(id){return document.getElementById(id)}
  function ensureModal(){
    if(h('mfInfoOverlay'))return;
    const overlay=document.createElement('div');
    overlay.id='mfInfoOverlay';overlay.className='mf-info-overlay hidden';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','mfInfoTitle');
    overlay.innerHTML='<div class="mf-info-sheet"><div class="mf-info-head"><div><div class="mf-info-kicker">คำอธิบายยอด</div><h3 id="mfInfoTitle" class="mf-info-title"></h3></div><button id="mfInfoClose" class="mf-info-close" type="button" aria-label="ปิด">×</button></div><p id="mfInfoDesc" class="mf-info-desc"></p><div id="mfInfoFormula" class="mf-info-formula hidden"><span>สูตรคำนวณ</span><strong id="mfInfoFormulaText"></strong></div><div id="mfInfoNote" class="mf-info-note hidden"><span>หมายเหตุ</span><strong id="mfInfoNoteText"></strong></div><div id="mfInfoExample" class="mf-info-example hidden"></div></div>';
    document.body.appendChild(overlay);
    h('mfInfoClose').addEventListener('click',closeInfo);
    overlay.addEventListener('click',function(e){if(e.target===overlay)closeInfo()});
  }
  function setText(id,text){const node=h(id);if(node)node.textContent=text||''}
  function toggle(id,show){const node=h(id);if(node)node.classList.toggle('hidden',!show)}
  function openInfo(key){
    const item=HELP[key];if(!item)return;
    ensureModal();setText('mfInfoTitle',item.title);setText('mfInfoDesc',item.desc);
    setText('mfInfoFormulaText',item.formula);toggle('mfInfoFormula',!!item.formula);
    setText('mfInfoNoteText',item.note);toggle('mfInfoNote',!!item.note);
    setText('mfInfoExample',item.example);toggle('mfInfoExample',!!item.example);
    const overlay=h('mfInfoOverlay');overlay.classList.remove('hidden');document.body.style.overflow='hidden';
    setTimeout(function(){const btn=h('mfInfoClose');if(btn)btn.focus()},0);
  }
  function closeInfo(){const overlay=h('mfInfoOverlay');if(overlay)overlay.classList.add('hidden');document.body.style.overflow=''}
  window.openMoneyFlowInfo=openInfo;
  window.closeMoneyFlowInfo=closeInfo;

  function makeButton(key,title){
    const btn=document.createElement('button');btn.type='button';btn.className='mf-info-btn';btn.textContent='ⓘ';btn.setAttribute('aria-label','ดูคำอธิบาย '+(title||''));btn.setAttribute('title','ดูคำอธิบาย');btn.dataset.mfInfoKey=key;
    btn.addEventListener('pointerdown',function(e){e.stopPropagation()});
    btn.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();openInfo(key)});
    return btn;
  }
  function attachInline(target,key){
    if(!target||!HELP[key])return;
    if(target.querySelector&&target.querySelector('.mf-info-btn[data-mf-info-key="'+key+'"]'))return;
    target.classList.add('mf-info-label');target.appendChild(makeButton(key,HELP[key].title));
  }
  function attachByValue(valueId,key,hostSelector,labelSelector){
    const value=h(valueId);if(!value)return;
    const host=hostSelector?value.closest(hostSelector):value.parentElement;if(!host)return;
    let label=labelSelector?host.querySelector(labelSelector):host.querySelector('small,h3,.balance-label,.mf-health-title');
    if(label)attachInline(label,key);
  }
  function decorateStatic(){
    const rows=[
      ['totalBalance','dashboard.daily','.balance-card','.balance-label'],['monthIncome','dashboard.income','.balance-mini','small'],['monthExpense','dashboard.expense','.balance-mini','small'],['dailyUseBalance','dashboard.daily','.daily-use-copy','small'],
      ['dashNetWorth','dashboard.networth','.professional-mini','small'],['dashSavingsBalance','dashboard.savings','.professional-mini','small'],['dashInvestmentBalance','dashboard.investments','.professional-mini','small'],['dashLiabilities','dashboard.liabilities','.professional-mini','small'],
      ['monthBalance','dashboard.net','.stat-card','small'],['savingRate','dashboard.savingRate','.stat-card','small'],['transactionCount','dashboard.txCount','.stat-card','small'],['goalCount','dashboard.goalCount','.stat-card','small'],
      ['savingsTotal','accounts.total','.savings-hero','small'],['accountsLiquid','accounts.liquid','.professional-mini','small'],['accountsSavings','accounts.savings','.professional-mini','small'],['accountsInvestments','accounts.investments','.professional-mini','small'],['accountsLiabilities','accounts.liabilities','.professional-mini','small'],
      ['reportIncome','report.income','.report-stat','small'],['reportExpense','report.expense','.report-stat','small'],['reportNet','report.net','.report-stat','small'],['reportCount','report.count','.report-stat','small'],
      ['reportNetWorth','report.networth','.networth-hero','small'],['reportTransferVolume','report.transfer','.report-secondary-grid > div','small'],['reportAvgDaily','report.avgDaily','.report-secondary-grid > div','small'],['reportLiquid','report.liquid','.report-secondary-grid > div','small'],['reportLiabilities','report.liabilities','.report-secondary-grid > div','small'],
      ['reportSavingsDeposit','report.savingsIn','.report-savings-row > div','small'],['reportSavingsWithdraw','report.savingsOut','.report-savings-row > div','small'],['reportSavingsTotal','report.savingsTotal','.report-savings-row > div','small']
    ];
    rows.forEach(function(row){attachByValue(row[0],row[1],row[2],row[3])});
    [['reportTrendChart','report.trend'],['reportNetWorthChart','report.nwHistory'],['reportBudgetActual','report.budgetActual'],['reportDailyChart','report.daily'],['reportCategoryList','report.categories']].forEach(function(row){const node=h(row[0]);const card=node&&node.closest('.card');const title=card&&card.querySelector('.card-title h3');if(title)attachInline(title,row[1])});
    const health=h('mfAccountingHealth');if(health)attachInline(health.querySelector('.mf-health-title'),'accounts.health');
  }
  function decorateDynamic(){
    document.querySelectorAll('#budgetList .budget-item').forEach(function(card){const label=card.querySelector('.budget-top strong');if(label)attachInline(label,'budget.item')});
    document.querySelectorAll('#goalList > .card').forEach(function(card){const label=card.querySelector('h3');if(label)attachInline(label,'goals.item')});
    document.querySelectorAll('#savingsAccountList .savings-account-card').forEach(function(card){const label=card.querySelector('.savings-account-main strong');if(label)attachInline(label,'accounts.account')});
    document.querySelectorAll('#savingsDetailContent .savings-summary-card').forEach(function(card,index){const label=card.querySelector('small');if(label)attachInline(label,index===0?'accounts.detailIn':'accounts.detailOut')});
    const detailHero=document.querySelector('#savingsDetailContent .savings-detail-hero');if(detailHero){const label=detailHero.querySelector('small');if(label)attachInline(label,'accounts.account')}
  }
  function decorate(){ensureModal();decorateStatic();decorateDynamic()}
  let scheduled=false;
  function scheduleDecorate(){if(scheduled)return;scheduled=true;requestAnimationFrame(function(){scheduled=false;decorate()})}
  const observer=new MutationObserver(scheduleDecorate);
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&h('mfInfoOverlay')&&!h('mfInfoOverlay').classList.contains('hidden'))closeInfo()});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){decorate();observer.observe(document.body,{childList:true,subtree:true})},{once:true});
  else {decorate();observer.observe(document.body,{childList:true,subtree:true})}
})();
</script>`;
  html = html.replace('</body>', runtime + '\n</body>');
  await writeFile(indexPath, html);
}

console.log('Applied MoneyFlow info icons and mobile help sheets across Dashboard, Accounts, Budget, Goals, and Reports');
