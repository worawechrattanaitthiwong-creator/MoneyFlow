import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

const PROMPT_FONT_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/prompt/Prompt-Regular.ttf';
let cachedFontBytes;

async function getPromptFontBytes() {
  if (cachedFontBytes) return cachedFontBytes;
  const res = await fetch(PROMPT_FONT_URL, { cf: { cacheTtl: 86400, cacheEverything: true } });
  if (!res.ok) throw new Error('โหลดฟอนต์สำหรับ PDF ไม่สำเร็จ');
  cachedFontBytes = new Uint8Array(await res.arrayBuffer());
  return cachedFontBytes;
}

function fmtMoney(value) {
  return Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
}

export async function buildReportPdf(data) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await getPromptFontBytes(), { subset: true });

  const A4 = [595.28, 841.89];
  let page = pdf.addPage(A4);
  const margin = 48;
  let y = A4[1] - 56;
  const text = (str, size = 11, opts = {}) => {
    const value = String(str ?? '');
    if (y < 70) { page = pdf.addPage(A4); y = A4[1] - 56; }
    page.drawText(value, { x: margin, y, size, font, color: opts.color || rgb(0.1,0.12,0.18), maxWidth: A4[0] - margin * 2, lineHeight: size * 1.45 });
    y -= opts.gap || size * 1.65;
  };

  text(`MoneyFlow • รายงานการเงิน ${data.month}`, 20, { gap: 34 });
  text(`รายรับ: ${fmtMoney(data.income)} ${data.baseCurrency}`, 12);
  text(`รายจ่าย: ${fmtMoney(data.expense)} ${data.baseCurrency}`, 12);
  text(`เงินสุทธิ: ${fmtMoney(data.net)} ${data.baseCurrency}`, 12);
  text(`มูลค่าสุทธิ: ${fmtMoney(data.netWorth)} ${data.baseCurrency}`, 12);
  text(`อัตราการออม: ${Number(data.savingsRate || 0).toFixed(1)}%`, 12, { gap: 28 });

  text('หมวดรายจ่ายสูงสุด', 15, { gap: 24 });
  const cats = (data.categories || []).slice(0, 10);
  if (!cats.length) text('ยังไม่มีข้อมูลรายจ่ายในช่วงนี้', 11);
  cats.forEach((c, i) => text(`${i + 1}. ${c.name} — ${fmtMoney(c.value)} ${data.baseCurrency}`, 11));

  const bytes = await pdf.save();
  return bytes;
}
