import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = join(root, 'public', 'index.html');
let html = await readFile(indexPath, 'utf8');

if (!html.includes('MONEYFLOW_SWIPE_DELETE_V1')) {
  throw new Error('Swipe delete runtime is missing; refusing syntax patch');
}

const startNeedle = '  function exactIdFromSource(source,ids){';
const endNeedle = '  function nearestRow(node,page){';
const start = html.indexOf(startNeedle);
const end = start >= 0 ? html.indexOf(endNeedle, start) : -1;

if (start < 0 || end < 0) {
  throw new Error('Swipe exactIdFromSource block not found');
}

const safeBlock = `  function exactIdFromSource(source,ids){
    source=String(source||'');
    for(const id of ids){
      const value=String(id||'');
      if(!value)continue;
      if(source.includes("'"+value+"'")||source.includes('"'+value+'"')||source.includes(value))return value;
    }
    return '';
  }
  /* MONEYFLOW_SWIPE_RUNTIME_SAFE_V1 */
`;

html = html.slice(0, start) + safeBlock + html.slice(end);
await writeFile(indexPath, html);
console.log('Replaced generated swipe ID matcher with parser-safe implementation');
