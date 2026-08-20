# MoneyFlow — Cloudflare migration

MoneyFlow เดิมเป็น Google Apps Script + Google Sheets รุ่น V6.2/V6.4 โครงการนี้ย้าย runtime ไป Cloudflare Workers แต่ตั้งใจรักษา UI, ชื่อฟังก์ชัน และ business logic เดิมให้ใกล้ 100% ที่สุด

## โครงสร้าง

- `legacy/Code.gs` — backend ต้นฉบับ เก็บไว้แบบไม่แก้
- `legacy/Index.html` — frontend ต้นฉบับ เก็บไว้แบบไม่แก้
- `public/index.html` — หน้าเดิม + compatibility shim ที่แปลง `google.script.run` เป็น `/api/rpc`
- `src/legacy-core.js` — Code.gs สำหรับ Worker โดยเก็บ **final override** ของฟังก์ชันเดิมและเปลี่ยนชื่อเฉพาะ declaration รุ่นเก่าที่ซ้ำกันเพื่อให้ ES module compile ได้
- `src/gas-runtime.js` — จำลอง Apps Script services ที่ MoneyFlow ใช้ (`SpreadsheetApp`, `Utilities`, `CacheService`, `PropertiesService`, `LockService`)
- `src/store.js` — adapter จากโครงสร้าง Sheet เดิมไป Cloudflare D1
- `src/index.js` — Worker API + static assets + receipt route
- `src/pdf.js` — สร้างรายงาน PDF พร้อมภาษาไทย
- `migrations/0001_init.sql` — D1 schema

## ทำไม D1 จึงเก็บเป็น Sheet-compatible JSON

แทนที่จะรีไรต์ logic การเงินหลายพันบรรทัดเป็น SQL ใหม่ทันที แต่ละแถวของ Sheet เดิมจะถูกเก็บเป็น JSON ใน D1 พร้อม metadata ของ headers ทำให้ `getRows_()`, `appendObject_()`, `updateObject_()` และ `deleteRow()` ยังมีพฤติกรรมแบบเดิม และ Backup JSON จากระบบเก่ายัง restore ได้

## สิ่งที่ต้องมีบน Cloudflare

1. Worker ชื่อ `moneyflow`
2. D1 database ชื่อ `moneyflow-db`
3. R2 bucket ชื่อ `moneyflow-receipts` สำหรับหลักฐาน/ใบเสร็จ

แก้ `REPLACE_WITH_D1_DATABASE_ID` ใน `wrangler.jsonc` หลังสร้าง D1

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
npx wrangler d1 create moneyflow-db
npx wrangler r2 bucket create moneyflow-receipts
# นำ database_id ที่ได้ไปใส่ใน wrangler.jsonc
npm run db:migrate
npm run deploy
```

## ย้ายข้อมูลจาก Google Sheets เดิม

วิธีที่ปลอดภัยที่สุดคือใช้เมนู **Export Backup** ใน MoneyFlow เดิม ซึ่งคืนข้อมูล JSON ของ Transactions/Categories/Budgets/Goals/Accounts/ledger/recurring/settings ฯลฯ จากนั้น:

1. เปิด MoneyFlow ตัวใหม่และสมัคร/เข้าสู่ระบบ
2. ไปหน้า Settings
3. เลือก Restore Backup JSON
4. เลือกไฟล์ Backup จากระบบเดิม

logic `restoreBackupJson` เดิมยังคงอยู่ จึง merge ข้อมูลโดยไม่ทับ ID ที่มีอยู่ตามพฤติกรรมเดิม

## หมายเหตุเรื่องความเข้ากันได้

- UI/CSS/HTML และ client logic หลักมาจากไฟล์เดิม
- รหัสผ่าน/PIN ใช้อัลกอริทึม SHA-256 loop เดิม 2,500 รอบ เพื่อรองรับ hash จากข้อมูลเก่า
- Google Drive receipt storage ถูกแทนด้วย Cloudflare R2
- Google Docs PDF ถูกแทนด้วย `pdf-lib` และฝัง Prompt font ตอนสร้าง PDF
- เวลา server ใช้ `Asia/Bangkok`

## ตรวจสอบ Cloudflare config

Workers Static Assets ใช้ `assets.binding = "ASSETS"` และ `run_worker_first` สำหรับ `/api/*`, `/receipts/*`, `/health` เพื่อไม่ให้ SPA fallback กลืน API route
