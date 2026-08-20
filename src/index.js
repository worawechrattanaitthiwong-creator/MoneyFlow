import { D1SheetContext } from './store.js';
import { setRuntimeContext, clearRuntimeContext, __runtimeInternals } from './gas-runtime.js';
import { legacyRpc, setupApp } from './legacy-core.js';
import { buildReportPdf } from './pdf.js';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function rpcError(error) {
  const message = error && error.message ? error.message : String(error || 'เกิดข้อผิดพลาด');
  return json({ ok: false, error: { message } }, 400);
}

async function ensureInitialized(ctx) {
  if (!ctx.spreadsheet.getSheetByName('Users') || !ctx.spreadsheet.getSheetByName('Transactions')) setupApp();
}

function bytesFromBase64(text) {
  return Uint8Array.from(__runtimeInternals.base64ToBytes(String(text || '')));
}

async function uploadReceipt(env, token, payload) {
  if (!env.RECEIPTS) throw new Error('ยังไม่ได้ผูก R2 bucket ชื่อ RECEIPTS');
  const user = legacyRpc.getCurrentUser(token);
  payload = payload || {};
  const bytes = bytesFromBase64(payload.base64);
  if (!bytes.length) throw new Error('ไฟล์ว่าง');
  if (bytes.length > 3 * 1024 * 1024) throw new Error('ใบเสร็จต้องมีขนาดไม่เกิน 3 MB');
  const safe = String(payload.name || 'receipt').replace(/[^a-zA-Z0-9ก-๙._-]/g, '_').slice(0, 180);
  const key = `${crypto.randomUUID()}-${safe}`;
  await env.RECEIPTS.put(key, bytes, {
    httpMetadata: { contentType: payload.mimeType || 'application/octet-stream' },
    customMetadata: { userId: String(user.id), originalName: safe }
  });
  return { success: true, url: `/receipts/${encodeURIComponent(key)}`, name: safe };
}

async function serveReceipt(env, key) {
  if (!env.RECEIPTS) return new Response('Receipt storage is not configured', { status: 503 });
  const object = await env.RECEIPTS.get(key);
  if (!object) return new Response('Not found', { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'private, max-age=3600');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(object.body, { headers });
}

async function handleRpc(request, env) {
  let body;
  try { body = await request.json(); } catch { return rpcError(new Error('รูปแบบ request ไม่ถูกต้อง')); }
  const method = String(body && body.method || '');
  const args = Array.isArray(body && body.args) ? body.args : [];

  let ctx;
  try {
    ctx = await D1SheetContext.load(env.DB);
  } catch (e) {
    return rpcError(new Error('ฐานข้อมูลยังไม่พร้อม กรุณารัน D1 migration ก่อน deploy: ' + (e.message || e)));
  }

  setRuntimeContext({ spreadsheet: ctx.spreadsheet });
  let result;
  let error = null;
  let special = null;

  try {
    await ensureInitialized(ctx);
    if (method === 'uploadReceipt') {
      const token = args[0], payload = args[1];
      // Authenticate synchronously while the legacy runtime context is active.
      const user = legacyRpc.getCurrentUser(token);
      special = { type: 'receipt', token, payload, userId: user.id };
    } else if (method === 'createReportPdf') {
      const token = args[0], month = args[1];
      const data = legacyRpc.getReportData(token, month);
      special = { type: 'pdf', data };
    } else {
      const fn = legacyRpc[method];
      if (typeof fn !== 'function') throw new Error('ไม่รองรับ API: ' + method);
      result = fn(...args);
    }
  } catch (e) {
    error = e;
  }

  clearRuntimeContext();
  try { await ctx.flush(); } catch (flushError) { if (!error) error = flushError; }
  if (error) return rpcError(error);

  try {
    if (special && special.type === 'receipt') {
      // Auth was already checked above; call storage directly without touching legacy state again.
      if (!env.RECEIPTS) throw new Error('ยังไม่ได้ผูก R2 bucket ชื่อ RECEIPTS');
      const payload = special.payload || {};
      const bytes = bytesFromBase64(payload.base64);
      if (!bytes.length) throw new Error('ไฟล์ว่าง');
      if (bytes.length > 3 * 1024 * 1024) throw new Error('ใบเสร็จต้องมีขนาดไม่เกิน 3 MB');
      const safe = String(payload.name || 'receipt').replace(/[^a-zA-Z0-9ก-๙._-]/g, '_').slice(0, 180);
      const key = `${crypto.randomUUID()}-${safe}`;
      await env.RECEIPTS.put(key, bytes, {
        httpMetadata: { contentType: payload.mimeType || 'application/octet-stream' },
        customMetadata: { userId: String(special.userId), originalName: safe }
      });
      result = { success: true, url: `/receipts/${encodeURIComponent(key)}`, name: safe };
    } else if (special && special.type === 'pdf') {
      const bytes = await buildReportPdf(special.data);
      result = {
        name: `MoneyFlow_Report_${special.data.month}.pdf`,
        base64: __runtimeInternals.bytesToBase64(bytes)
      };
    }
  } catch (e) {
    return rpcError(e);
  }

  return json({ ok: true, result });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ ok: true, app: 'MoneyFlow', version: '6.2-cloudflare' });
    if (url.pathname === '/api/rpc' && request.method === 'POST') return handleRpc(request, env);
    if (url.pathname.startsWith('/receipts/') && request.method === 'GET') {
      const key = decodeURIComponent(url.pathname.slice('/receipts/'.length));
      return serveReceipt(env, key);
    }
    return env.ASSETS.fetch(request);
  }
};
