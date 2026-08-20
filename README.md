# MoneyFlow — Cloudflare + Thai AI Personal Finance

MoneyFlow เดิมเป็น Google Apps Script + Google Sheets รุ่น V6.2/V6.4 โครงการนี้ย้าย runtime ไป Cloudflare Workers + D1 โดยตั้งใจรักษา UI, ชื่อฟังก์ชัน และ business logic เดิมให้ใกล้ 100% ที่สุด แล้วค่อยเพิ่มชั้นผลิตภัณฑ์ใหม่แบบไม่รื้อระบบบัญชีเดิม

## โครงสร้าง

- `source-bundles/` — source เดิมแบบ gzip/base64
- `scripts/build-generated.mjs` — สร้าง legacy source, Worker-compatible core และ `public/index.html`
- `public/index.html` — หน้าเดิม + compatibility shim ที่แปลง `google.script.run` เป็น `/api/rpc`
- `src/legacy-core.js` — generated Code.gs สำหรับ Worker
- `src/gas-runtime.js` — จำลอง Apps Script services ที่ MoneyFlow ใช้
- `src/store.js` — adapter จากโครงสร้าง Sheet เดิมไป Cloudflare D1
- `src/index.js` — Worker API + static assets + receipt route
- `src/pdf.js` — สร้างรายงาน PDF ภาษาไทย
- `migrations/0001_init.sql` — D1 schema

> `legacy/`, `public/` และ `src/legacy-core.js` เป็น generated output ในขั้น build และอาจไม่ถูก commit โดยตรง

## ทำไม D1 จึงเก็บเป็น Sheet-compatible JSON

แทนที่จะรีไรต์ logic การเงินหลายพันบรรทัดเป็น SQL ใหม่ทันที แต่ละแถวของ Sheet เดิมจะถูกเก็บเป็น JSON ใน D1 พร้อม metadata ของ headers ทำให้ `getRows_()`, `appendObject_()`, `updateObject_()` และ `deleteRow()` ยังมีพฤติกรรมแบบเดิม และ Backup JSON จากระบบเก่ายัง restore ได้

D1 ใช้ physical tables หลักเพียง `mf_sheet_meta` และ `mf_sheet_rows` แต่สามารถมี logical sheets เพิ่มได้โดยไม่ต้อง migration schema ทุกครั้ง

## Thai AI Personal Finance — รุ่น Beta Full Access

ชั้นใหม่ถูกประกอบหลัง Production Test เดิมผ่านแล้ว เพื่อให้แยกความเสี่ยงระหว่างระบบบัญชีเดิมกับฟีเจอร์ AI/Product ใหม่

ฟีเจอร์ที่ใช้งานใน build ปัจจุบัน:

- **Smart Insights ภาษาไทย** — วิเคราะห์รายรับ/รายจ่าย, หมวดที่ใช้มาก, ความผิดปกติ และแนวโน้ม
- **Forecast สิ้นเดือน** — คาดการณ์รายรับ, รายจ่าย, เงินสุทธิ และเงินใช้ประจำวันเฉลี่ยต่อวัน
- **Smart Category Learning** — เรียนรู้จากรายการที่ผู้ใช้บันทึก/แก้ไข และนำไปช่วย Voice Entry
- **Free / Pro / Family / Freelancer Experience Modes** — ใช้เป็น product mode ในช่วง beta
- **Family Workspace** — สมาชิกภายในบัญชี MoneyFlow เดียว + ติดป้ายรายการใหม่ตามสมาชิกที่เลือก
- **Debt & Credit Planner** — รองรับ Avalanche / Snowball และเป้าหมายหนี้ถัดไป
- **Freelancer Mode** — แยก Personal/Business context, สรุปกำไร และประมาณเงินสำรองภาษี
- **Capture Inbox** — รับ candidate จาก Share/Paste/Slip text และเตรียม bridge สำหรับแหล่งอัตโนมัติ พร้อม fingerprint กันรายการซ้ำ

logical sheets ใหม่ที่เก็บใน D1 compatibility layer:

- `ProductProfiles`
- `FamilyMembers`
- `DebtPlans`
- `FreelancerProfiles`
- `CategoryRules`
- `CaptureInbox`

### ขอบเขต Voice ที่ตั้งใจล็อกไว้

Voice Entry รองรับเฉพาะ **รายรับ/รายจ่ายของ Daily Wallet และบัญชีเงินเดือน** เท่านั้น

คำสั่งเสียงสำหรับโอนเงิน, หุ้น, เงินเก็บ, ใช้หนี้, ลบรายการ หรือบัญชีอื่นถูกปิดไว้โดยตั้งใจ เพื่อไม่ให้ speech recognition เปลี่ยนยอดหลายบัญชีโดยอัตโนมัติ

## สิ่งที่ยังไม่ควรเรียกว่า Production-ready

- **Billing / subscription จริง** ยังไม่ได้เชื่อม App Store หรือ Google Play; โหมด Pro/Family/Freelancer ตอนนี้เป็น Beta Full Access / Experience Mode
- **Family multi-login / invitation** ยังไม่ได้เปิด; Family ปัจจุบันเป็น workspace ภายในบัญชีเดียว
- **Android bank notification capture** ต้องมี Native Android/Capacitor client และ Notification Access; PWA อ่าน notification ของแอปอื่นไม่ได้
- **Email auto-capture** ต้องเชื่อม OAuth/provider ก่อน
- **Open Data / bank direct data** ต้องเชื่อม provider/partner ที่เหมาะสมก่อน
- **Slip image OCR / receipt upload** ยังไม่ถือว่า active production จนกว่าจะมี storage/ingestion ที่ทดสอบแล้ว
- R2 receipt storage เป็น optional capability และไม่ควรถูกถือว่าพร้อมใช้งานเพียงเพราะมีโค้ดรองรับ

## Build gates

`npm run build:generated` ทำงานตามลำดับสำคัญ:

1. สร้าง generated legacy runtime
2. ลง compatibility/mobile/production patches
3. ลง Voice Entry และล็อก Voice scope
4. รัน Smoke Test + Production Test เดิม
5. ประกอบ Thai AI Worker platform
6. ประกอบ MoneyFlow AI Hub
7. รัน `ai-platform-test.mjs` เป็นด่านสุดท้าย รวม syntax check ของ Worker และ inline scripts

GitHub Actions ที่ `.github/workflows/moneyflow-ci.yml` จะรัน build gate นี้ทุก push/PR ที่ `main`

## สิ่งที่ต้องมีบน Cloudflare

1. Worker ชื่อ `moneyflow`
2. D1 database ชื่อ `moneyflow-db`
3. Static Assets binding `ASSETS`
4. R2 binding `RECEIPTS` เฉพาะกรณีเปิดใช้งาน receipt storage จริง

## รันในเครื่อง

```bash
npm install
npm run test:legacy
npx wrangler d1 migrations apply moneyflow-db --local
npm run dev
```

## Deploy

```bash
npx wrangler login
npm run db:migrate
npm run deploy
```

ถ้าจะเปิด receipt storage ค่อยสร้าง R2 bucket และเพิ่ม binding `RECEIPTS` ใน `wrangler.jsonc` ก่อน deploy

## ย้ายข้อมูลจาก Google Sheets เดิม

วิธีที่ปลอดภัยที่สุดคือใช้เมนู **Export Backup** ใน MoneyFlow เดิม แล้ว restore ในระบบใหม่ผ่านหน้า Settings ตาม flow เดิม

ข้อมูล Thai AI/Product layer ถูกเก็บแยกเป็น logical sheets ใหม่ ดังนั้นการแก้ backup/restore ในอนาคตต้องระวังไม่ให้ logic legacy ลบหรือเขียนทับข้อมูล ProductProfiles/Family/Debt/Freelancer โดยไม่ตั้งใจ

## หมายเหตุเรื่องความเข้ากันได้

- UI/CSS/HTML และ client logic หลักมาจากไฟล์เดิม
- รหัสผ่าน/PIN ยังรักษา algorithm เดิมเพื่อรองรับข้อมูลที่ migrate มา
- เวลา server ใช้ `Asia/Bangkok`
- Static Assets ใช้ `assets.binding = "ASSETS"` และ `run_worker_first` สำหรับ `/api/*`, `/receipts/*`, `/health`
- ระบบบัญชีเดิมยังเป็น source of truth; AI layer มีหน้าที่วิเคราะห์, เรียนรู้, จัดกลุ่ม และเตรียมคำแนะนำ ไม่ควรแก้ยอดเงินจริงโดยไม่มี transaction flow เดิมรองรับ
