let runtimeContext = null;

export function setRuntimeContext(ctx) {
  runtimeContext = ctx;
  scriptProperties.set('SPREADSHEET_ID', 'D1');
}

export function clearRuntimeContext() {
  runtimeContext = null;
}

function requireContext() {
  if (!runtimeContext) throw new Error('MoneyFlow runtime context is not initialized');
  return runtimeContext;
}

function toBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return Uint8Array.from(value, n => ((Number(n) % 256) + 256) % 256);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new TextEncoder().encode(String(value ?? ''));
}

function bytesToBase64(value) {
  const bytes = toBytes(value);
  let out = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(out);
}

function base64ToBytes(text) {
  const bin = atob(String(text || '').replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Small synchronous SHA-256 implementation so the original Apps Script password
// hashing algorithm can stay byte-for-byte compatible with imported backups.
function sha256Bytes(input) {
  const bytes = toBytes(input);
  const K = new Uint32Array([
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ]);
  const H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const bitLen = bytes.length * 8;
  const paddedLen = (((bytes.length + 9 + 63) >> 6) << 6);
  const msg = new Uint8Array(paddedLen);
  msg.set(bytes);
  msg[bytes.length] = 0x80;
  const view = new DataView(msg.buffer);
  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  view.setUint32(paddedLen - 8, hi, false);
  view.setUint32(paddedLen - 4, lo, false);
  const w = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < paddedLen; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i-15],7) ^ rotr(w[i-15],18) ^ (w[i-15] >>> 3);
      const s1 = rotr(w[i-2],17) ^ rotr(w[i-2],19) ^ (w[i-2] >>> 10);
      w[i] = (w[i-16] + s0 + w[i-7] + s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e,6) ^ rotr(e,11) ^ rotr(e,25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a,2) ^ rotr(a,13) ^ rotr(a,22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
    }
    H[0]=(H[0]+a)>>>0; H[1]=(H[1]+b)>>>0; H[2]=(H[2]+c)>>>0; H[3]=(H[3]+d)>>>0;
    H[4]=(H[4]+e)>>>0; H[5]=(H[5]+f)>>>0; H[6]=(H[6]+g)>>>0; H[7]=(H[7]+h)>>>0;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, H[i], false);
  return out;
}

function zonedParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || 'Asia/Bangkok',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  const parts = Object.fromEntries(fmt.formatToParts(date instanceof Date ? date : new Date(date)).map(p => [p.type, p.value]));
  return parts;
}

function formatDate(date, timeZone, pattern) {
  const p = zonedParts(date, timeZone);
  const vals = {
    yyyy: p.year,
    yy: String(p.year).slice(-2),
    MM: p.month,
    dd: p.day,
    HH: p.hour,
    mm: p.minute,
    ss: p.second
  };
  const literals = [];
  let fmt = String(pattern || 'yyyy-MM-dd').replace(/'([^']*)'/g, (_, x) => {
    const key = `\u0000${literals.length}\u0000`; literals.push(x); return key;
  });
  fmt = fmt.replace(/yyyy|yy|MM|dd|HH|mm|ss/g, t => vals[t]);
  fmt = fmt.replace(/\u0000(\d+)\u0000/g, (_, i) => literals[Number(i)] || '');
  return fmt;
}

function parseCsv(text) {
  const s = String(text || '');
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
    } else {
      if (ch === '"') quoted = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (ch !== '\r') field += ch;
    }
  }
  row.push(field);
  if (row.length > 1 || row[0] !== '' || rows.length === 0) rows.push(row);
  return rows;
}

export const Utilities = {
  DigestAlgorithm: { SHA_256: 'SHA_256' },
  Charset: { UTF_8: 'UTF_8' },
  getUuid() { return crypto.randomUUID(); },
  computeDigest(algorithm, value) {
    if (algorithm !== 'SHA_256') throw new Error(`Unsupported digest algorithm: ${algorithm}`);
    return Array.from(sha256Bytes(value), b => b > 127 ? b - 256 : b);
  },
  base64Encode(value) { return bytesToBase64(value); },
  base64EncodeWebSafe(value) { return bytesToBase64(value).replace(/\+/g, '-').replace(/\//g, '_'); },
  base64Decode(value) { return Array.from(base64ToBytes(value)); },
  formatDate,
  parseCsv,
  newBlob(bytes, mimeType, name) {
    return { bytes: toBytes(bytes), mimeType: mimeType || 'application/octet-stream', name: name || 'blob' };
  }
};

export const Session = { getScriptTimeZone() { return 'Asia/Bangkok'; } };

const cacheMap = new Map();
export const CacheService = {
  getScriptCache() {
    return {
      get(key) {
        const item = cacheMap.get(String(key));
        if (!item) return null;
        if (item.expiresAt && item.expiresAt <= Date.now()) { cacheMap.delete(String(key)); return null; }
        return item.value;
      },
      put(key, value, seconds) {
        cacheMap.set(String(key), { value: String(value), expiresAt: seconds ? Date.now() + Number(seconds) * 1000 : 0 });
      },
      remove(key) { cacheMap.delete(String(key)); }
    };
  }
};

const scriptProperties = new Map([['SPREADSHEET_ID', 'D1']]);
export const PropertiesService = {
  getScriptProperties() {
    return {
      getProperty(key) { return scriptProperties.has(String(key)) ? scriptProperties.get(String(key)) : null; },
      setProperty(key, value) { scriptProperties.set(String(key), String(value)); return this; }
    };
  }
};

export const LockService = {
  getScriptLock() { return { waitLock() {}, releaseLock() {} }; }
};

export const SpreadsheetApp = {
  openById() { return requireContext().spreadsheet; },
  flush() {}
};

export const Logger = { log(...args) { console.log(...args); } };

export const HtmlService = {
  XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
  createTemplateFromFile() {
    const chain = {
      evaluate() { return chain; }, setTitle() { return chain; }, addMetaTag() { return chain; }, setXFrameOptionsMode() { return chain; }
    };
    return chain;
  }
};

export const DriveApp = new Proxy({}, { get() { return () => { throw new Error('Google Drive API is replaced by Cloudflare storage in this build'); }; } });
export const DocumentApp = { ParagraphHeading: { TITLE: 'TITLE', HEADING2: 'HEADING2' }, create() { throw new Error('Google Docs PDF generation is replaced in this build'); } };
export const MimeType = { PDF: 'application/pdf' };

export const __runtimeInternals = { sha256Bytes, bytesToBase64, base64ToBytes, formatDate, parseCsv };
