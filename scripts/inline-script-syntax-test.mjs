import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(join(root, 'public', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]).filter(Boolean);

function labelFor(source, index) {
  const marker = String(source || '').match(/MONEYFLOW_[A-Z0-9_]+/);
  if (marker) return marker[0];
  const first = String(source || '').split(/\r?\n/).map(x => x.trim()).find(Boolean) || '';
  return first.slice(0, 90) || `inline-${index}`;
}

for (let i = 0; i < scripts.length; i++) {
  try {
    new vm.Script(scripts[i], { filename: `generated-inline-${i}.js` });
  } catch (error) {
    const label = labelFor(scripts[i], i);
    const lines = scripts[i].split(/\r?\n/);
    console.error(`INLINE_SCRIPT_FAILURE index=${i} label=${label}`);
    console.error(lines.slice(0, 18).join('\n'));
    throw new Error(`Generated inline script ${i} (${label}) syntax error: ${error.message}`);
  }
}

console.log(`Generated inline script syntax: PASS (${scripts.length} scripts)`);
