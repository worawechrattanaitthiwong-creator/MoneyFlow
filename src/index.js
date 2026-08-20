import { D1SheetContext } from './store.js';
import { setRuntimeContext, clearRuntimeContext, __runtimeInternals } from './gas-runtime.js';
import { legacyRpc, setupApp } from './legacy-core.js';
import { buildReportPdf } from './pdf.js';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const MAX_RPC_BODY_BYTES = 5 * 1024 * 1024;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function rpcError(error, status = 400) {
  const message = error && error.message ? error.message : String(error || 'เกิดข้อผิดพลาด');
  return json({ ok: false, error: { message } }, status);
}

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');
  headers.set('referrer-policy', 'same-origin');
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  headers.set('cross-origin-opener-policy', 'same-origin');
  headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  headers.set('content-security-policy', "frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function isSameOriginRequest(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
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

const AUTH_SHEETS = ['Users', 'Sessions', 'DailyWallet'];
const FINANCE_SHEETS = [...AUTH_SHEETS, 'FinanceSettings', 'CurrencyRates'];
const RPC_SHEET_PLANS = Object.freeze({
  login: ['Users', 'Sessions', 'DailyWallet'],
  getInstantSessionData: AUTH_SHEETS,
  getCurrentUser: ['Users', 'Sessions'],
  getDailyWallet: AUTH_SHEETS,
  getCategories: [...AUTH_SHEETS, 'Categories'],
  getDashboard: [...FINANCE_SHEETS, 'Transactions', 'Accounts'],
  getSavingsOverview: [...FINANCE_SHEETS, 'Accounts'],
  getTransactions: [...FINANCE_SHEETS, 'Transactions'],
  getBudgets: [...FINANCE_SHEETS, 'Transactions', 'Budgets'],
  getGoals: [...AUTH_SHEETS, 'Accounts', 'Goals'],
  getCurrencyRates: FINANCE_SHEETS,
  getFinanceSettings: FINANCE_SHEETS,
  getCalendarData: [...FINANCE_SHEETS, 'Transactions', 'Recurring'],
  getReportData: [...FINANCE_SHEETS, 'Transactions', 'Accounts', 'Budgets', 'NetWorthSnapshots'],
  createReportPdf: [...FINANCE_SHEETS, 'Transactions', 'Accounts', 'Budgets', 'NetWorthSnapshots'],
  getFastBootData: [...FINANCE_SHEETS, 'Transactions', 'Accounts', 'Categories', 'SavingsSecurity'],
  getSavingsAccountDetail: [...FINANCE_SHEETS, 'Accounts', 'AccountLedger'],
  getSavingsSecurityStatus: [...AUTH_SHEETS, 'SavingsSecurity'],
  getSecurityCenterData: [...FINANCE_SHEETS, 'SavingsSecurity'],
  exportTransactionsCsv: [...FINANCE_SHEETS, 'Transactions']
});

function sheetsForRpc(method) {
  const plan = RPC_SHEET_PLANS[String(method || '')];
  return Array.isArray(plan) ? plan : null;
}

async function handleRpc(request, env) {
  const contentType = String(request.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    return rpcError(new Error('Content-Type ต้องเป็น application/json'), 415);
  }

  let text;
  try {
    text = await request.text();
  } catch {
    return rpcError(new Error('ไม่สามารถอ่าน request ได้'));
  }
  if (new TextEncoder().encode(text).byteLength > MAX_RPC_BODY_BYTES) {
    return rpcError(new Error('request มีขนาดใหญ่เกินกำหนด'), 413);
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return rpcError(new Error('รูปแบบ request ไม่ถูกต้อง'));
  }
  const method = String(body && body.method || '');
  const args = Array.isArray(body && body.args) ? body.args : [];

  let ctx;
  try {
    ctx = await D1SheetContext.load(env.DB, sheetsForRpc(method));
  } catch (e) {
    return rpcError(new Error('ฐานข้อมูลยังไม่พร้อม กรุณารัน D1 migration ก่อน deploy: ' + (e.message || e)), 503);
  }

  setRuntimeContext({ spreadsheet: ctx.spreadsheet });
  let result;
  let error = null;
  let special = null;

  try {
    await ensureInitialized(ctx);
    if (method === 'uploadReceipt') {
      const token = args[0], payload = args[1];
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
    let response;

    if (url.pathname === '/health') {
      response = request.method === 'GET'
        ? json({ ok: true, app: 'MoneyFlow', version: '6.2-cloudflare.3' })
        : json({ ok: false, error: { message: 'Method not allowed' } }, 405);
    } else if (url.pathname === '/api/rpc') {
      if (request.method !== 'POST') {
        response = json({ ok: false, error: { message: 'Method not allowed' } }, 405);
      } else if (!isSameOriginRequest(request)) {
        response = json({ ok: false, error: { message: 'Cross-origin request denied' } }, 403);
      } else {
        response = await handleRpc(request, env);
      }
    } else if (url.pathname.startsWith('/receipts/') && request.method === 'GET') {
      const key = decodeURIComponent(url.pathname.slice('/receipts/'.length));
      response = await serveReceipt(env, key);
    } else {
      response = await env.ASSETS.fetch(request);
    }

    return withSecurityHeaders(response);
  }
};
