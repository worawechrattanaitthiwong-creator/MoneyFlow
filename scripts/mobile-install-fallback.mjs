import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'public', 'index.html');
let html = await readFile(file, 'utf8');

if (!html.includes('MONEYFLOW_MOBILE_INSTALL_FALLBACK')) {
  const script = `
<script>
/* MONEYFLOW_MOBILE_INSTALL_FALLBACK */
(function(){
  function showMobileInstallButton(){
    var btn=document.getElementById('installAppBtn');
    if(!btn)return;
    var standalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
    var mobile=/android|iphone|ipad|ipod/i.test(navigator.userAgent||'')||window.matchMedia('(max-width: 900px)').matches;
    if(mobile&&!standalone){btn.classList.remove('hidden');btn.classList.add('ready');}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',showMobileInstallButton,{once:true});
  else showMobileInstallButton();
})();
</script>`;
  if (!html.includes('</body>')) throw new Error('Generated index has no </body>');
  html = html.replace('</body>', script + '\n</body>');
  await writeFile(file, html, 'utf8');
}

console.log('Enabled mobile install button fallback');
