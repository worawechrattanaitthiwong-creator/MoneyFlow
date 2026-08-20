import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = join(root, 'public', 'index.html');
const swPath = join(root, 'public', 'sw.js');
let html = await readFile(indexPath, 'utf8');

if (!html.includes('MONEYFLOW_LATEST_FIRST_V1')) {
  const runtime = `
<script>
/* MONEYFLOW_LATEST_FIRST_V1 */
(function(){
  function parseDateLike(value){
    if(value==null||value==='')return 0;
    if(typeof value==='number'&&Number.isFinite(value))return value>1e12?value:value>1e9?value*1000:value;
    const s=String(value).trim();
    if(!s)return 0;
    const iso=Date.parse(s);if(Number.isFinite(iso))return iso;
    const dmy=s.match(/^(\\d{1,2})[\\/\\-](\\d{1,2})[\\/\\-](\\d{4})(?:\\s+(\\d{1,2}):(\\d{2})(?::(\\d{2}))?)?/);
    if(dmy){const [,d,m,y,h='0',mi='0',sec='0']=dmy;return new Date(Number(y),Number(m)-1,Number(d),Number(h),Number(mi),Number(sec)).getTime();}
    return 0;
  }
  function txPrimaryTime(row){
    if(!row||typeof row!=='object')return 0;
    return parseDateLike(row.date||row.transactionDate||row.transaction_date||row.txDate||row.createdAt||row.created_at||row.timestamp||row.datetime||row.time);
  }
  function txSecondaryTime(row){
    if(!row||typeof row!=='object')return 0;
    return parseDateLike(row.createdAt||row.created_at||row.updatedAt||row.updated_at||row.timestamp||row.datetime||row.time);
  }
  function sortTransactionsLatest(rows){
    if(!Array.isArray(rows))return rows;
    return rows.map((row,index)=>({row,index,primary:txPrimaryTime(row),secondary:txSecondaryTime(row)}))
      .sort((a,b)=>{
        if(a.primary!==b.primary)return b.primary-a.primary;
        if(a.secondary!==b.secondary)return b.secondary-a.secondary;
        return b.index-a.index;
      }).map(x=>x.row);
  }
  function sortKnownContainers(result){
    if(Array.isArray(result))return sortTransactionsLatest(result);
    if(!result||typeof result!=='object')return result;
    for(const key of ['transactions','recentTransactions','recent_transactions']){
      if(Array.isArray(result[key]))result[key]=sortTransactionsLatest(result[key]);
    }
    return result;
  }
  window.__moneyflowSortTransactionsLatest=sortTransactionsLatest;

  const previousTransport=window.__moneyflowRpcTransport;
  if(typeof previousTransport==='function'&&!previousTransport.__moneyflowLatestFirst){
    const wrapped=async function(method,args){
      const result=await previousTransport(method,args);
      const m=String(method||'');
      if(m==='getTransactions'||m==='getDashboard'||m==='getFastBootData'||m==='getReportData')return sortKnownContainers(result);
      return result;
    };
    wrapped.__moneyflowLatestFirst=true;
    window.__moneyflowRpcTransport=wrapped;
  }

  const originalRenderTransactions=window.renderTransactions;
  if(typeof originalRenderTransactions==='function'&&!originalRenderTransactions.__moneyflowLatestFirst){
    const wrappedRender=function(rows,...rest){return originalRenderTransactions.call(this,sortTransactionsLatest(rows),...rest)};
    wrappedRender.__moneyflowLatestFirst=true;
    window.renderTransactions=wrappedRender;
  }

  const originalRenderDashboard=window.renderDashboard;
  if(typeof originalRenderDashboard==='function'&&!originalRenderDashboard.__moneyflowLatestFirst){
    const wrappedDashboard=function(data,...rest){return originalRenderDashboard.call(this,sortKnownContainers(data),...rest)};
    wrappedDashboard.__moneyflowLatestFirst=true;
    window.renderDashboard=wrappedDashboard;
  }
})();
</script>`;
  html = html.replace('</body>', runtime + '\n</body>');
  await writeFile(indexPath, html);
}

try {
  let sw = await readFile(swPath, 'utf8');
  sw = sw.replace(/moneyflow-shell-v\\d+/g, 'moneyflow-shell-v3');
  await writeFile(swPath, sw);
} catch {}

console.log('Applied latest-first transaction ordering and bumped PWA shell cache');
