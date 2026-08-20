import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = join(root, 'public', 'index.html');
let html = await readFile(indexPath, 'utf8');

if (!html.includes('MONEYFLOW_VOICE_ACCOUNT_ROUTING_V2')) {
  const runtime = `
<script>
/* MONEYFLOW_VOICE_ACCOUNT_ROUTING_V2 */
(function(){
  const SALARY_KEY='moneyflow_voice_salary_account_v1';
  const SALARY_RE=/(เงินเดือน|salary|payroll|ค่าจ้าง)/i;
  const SALARY_ACCOUNT_RE=/(บัญชีเงินเดือน|กระเป๋าเงินเดือน|salary account)/i;
  const DAILY='daily_wallet';

  function remember(id){id=String(id||'');if(!id||id===DAILY)return;try{localStorage.setItem(SALARY_KEY,id)}catch(e){}}
  function remembered(){try{return String(localStorage.getItem(SALARY_KEY)||'')}catch(e){return ''}}
  function accountText(row){return [row?.name,row?.accountName,row?.label,row?.nickname,row?.bankName,row?.purpose,row?.type].filter(Boolean).join(' ').toLowerCase()}
  function addCandidate(map,id,text,row){id=String(id||'');if(!id||id===DAILY)return;const prev=map.get(id)||{id,text:'',row:null};prev.text=(prev.text+' '+String(text||'')).trim();if(row)prev.row=row;map.set(id,prev)}
  function accountCandidates(){
    const map=new Map();
    for(const sid of ['transactionAccount','transactionFromAccount','accountId']){
      const select=document.getElementById(sid);if(!select)continue;
      for(const option of Array.from(select.options||[]))addCandidate(map,option.value,option.textContent||'',null);
    }
    try{
      const pools=[window.CURRENT_ACCOUNTS,window.SAVINGS_ACCOUNTS,window.CACHE&&CACHE.accounts,window.CACHE&&CACHE.savings&&CACHE.savings.accounts].filter(Array.isArray);
      for(const pool of pools)for(const row of pool)addCandidate(map,row?.id||row?.accountId,accountText(row),row);
    }catch(e){}
    return [...map.values()];
  }
  function historicalSalaryAccount(){
    try{
      const rows=[window.CURRENT_TRANSACTIONS,window.CACHE&&CACHE.transactions].find(Array.isArray)||[];
      for(let i=rows.length-1;i>=0;i--){
        const row=rows[i]||{};
        const type=String(row.type||'').toLowerCase();
        const text=[row.category,row.description,row.note].filter(Boolean).join(' ');
        const id=String(row.accountId||row.account_id||'');
        if(type==='income'&&SALARY_RE.test(text)&&id&&id!==DAILY)return id;
      }
    }catch(e){}
    return '';
  }
  function salaryNamedAccount(candidates){
    const scored=candidates.map(c=>{
      const t=String(c.text||'').toLowerCase();let score=0;
      if(/บัญชีเงินเดือน/.test(t))score+=10;
      if(/เงินเดือน/.test(t))score+=8;
      if(/salary|payroll/i.test(t))score+=8;
      if(/รับเงินเดือน/.test(t))score+=6;
      return {id:c.id,score};
    }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
    if(!scored.length)return '';
    if(scored.length===1||scored[0].score>scored[1].score)return scored[0].id;
    return '';
  }
  function resolveSalaryAccount(){
    const candidates=accountCandidates();
    const ids=new Set(candidates.map(c=>c.id));
    const saved=remembered();
    if(saved&&(!candidates.length||ids.has(saved)))return saved;
    const historical=historicalSalaryAccount();
    if(historical&&(!candidates.length||ids.has(historical))){remember(historical);return historical}
    const named=salaryNamedAccount(candidates);if(named){remember(named);return named}
    return '';
  }
  function voiceWantsSalary(text,payload){
    const raw=String(text||'');
    if(SALARY_ACCOUNT_RE.test(raw))return true;
    const type=String(payload?.type||'').toLowerCase();
    if(type!=='income')return false;
    return SALARY_RE.test([raw,payload?.category,payload?.description,payload?.note].filter(Boolean).join(' '));
  }

  window.__moneyflowResolveSalaryAccount=resolveSalaryAccount;
  const previous=window.__moneyflowRpcTransport;
  if(typeof previous==='function'&&!previous.__moneyflowVoiceAccountRoutingV2){
    const wrapped=async function(method,args){
      const m=String(method||'');
      let nextArgs=Array.from(args||[]);
      const voiceText=String(window.__moneyflowActiveVoiceText||'');
      if(m==='addTransaction'&&voiceText&&nextArgs[1]&&typeof nextArgs[1]==='object'){
        const payload=Object.assign({},nextArgs[1]);
        if(voiceWantsSalary(voiceText,payload)){
          const target=resolveSalaryAccount();
          if(!target)throw new Error('ยังไม่พบบัญชีเงินเดือนที่กำหนด กรุณาเลือกบัญชีเงินเดือนในฟอร์ม 1 ครั้ง แล้ว MoneyFlow จะจำให้');
          payload.accountId=target;remember(target);
        }else{
          payload.accountId=DAILY;
        }
        nextArgs[1]=payload;
      }
      return previous(m,nextArgs);
    };
    wrapped.__moneyflowVoiceAccountRoutingV2=true;
    window.__moneyflowRpcTransport=wrapped;
  }
})();
</script>`;
  html = html.replace('</body>', runtime + '\n</body>');
  await writeFile(indexPath, html);
}

console.log('Constrained voice transaction routing to Daily Wallet and Salary account only');
