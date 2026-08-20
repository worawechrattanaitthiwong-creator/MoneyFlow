class MemoryRange {
  constructor(sheet, row, col, numRows, numCols) {
    this.sheet = sheet; this.row = row; this.col = col; this.numRows = numRows; this.numCols = numCols;
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const rr = this.row + r;
      const vals = [];
      for (let c = 0; c < this.numCols; c++) {
        const cc = this.col + c;
        if (rr === 1) vals.push(this.sheet.headers[cc - 1] ?? '');
        else {
          const rec = this.sheet.rows[rr - 2];
          const h = this.sheet.headers[cc - 1];
          vals.push(rec && h ? (rec.data[h] ?? '') : '');
        }
      }
      out.push(vals);
    }
    return out;
  }
  setValues(matrix) {
    for (let r = 0; r < this.numRows; r++) {
      const rr = this.row + r;
      const rowVals = matrix[r] || [];
      if (rr === 1) {
        const need = Math.max(this.sheet.headers.length, this.col - 1 + this.numCols);
        while (this.sheet.headers.length < need) this.sheet.headers.push('');
        for (let c = 0; c < this.numCols; c++) this.sheet.headers[this.col - 1 + c] = String(rowVals[c] ?? '');
        this.sheet.metaDirty = true;
      } else {
        const rec = this.sheet.rows[rr - 2];
        if (!rec) continue;
        for (let c = 0; c < this.numCols; c++) {
          const h = this.sheet.headers[this.col - 1 + c];
          if (h) rec.data[h] = rowVals[c] ?? '';
        }
        rec.dirty = true;
      }
    }
    return this;
  }
  setFontWeight() { return this; }
  setBackground() { return this; }
  setFontColor() { return this; }
  setNumberFormat() { return this; }
}

class MemoryDataRange {
  constructor(sheet) { this.sheet = sheet; }
  getValues() {
    if (!this.sheet.headers.length) return [];
    const out = [this.sheet.headers.slice()];
    for (const rec of this.sheet.rows) out.push(this.sheet.headers.map(h => rec.data[h] ?? ''));
    return out;
  }
}

export class MemorySheet {
  constructor(name, headers = [], rows = []) {
    this.name = name;
    this.headers = headers.slice();
    this.rows = rows;
    this.metaDirty = false;
    this.deletedIds = new Set();
    this.nextSortKey = rows.reduce((m, r) => Math.max(m, Number(r.sortKey || 0)), 0) + 1;
  }
  getDataRange() { return new MemoryDataRange(this); }
  getRange(row, col, numRows = 1, numCols = 1) { return new MemoryRange(this, Number(row), Number(col), Number(numRows), Number(numCols)); }
  getLastRow() { return this.headers.length ? this.rows.length + 1 : 0; }
  getLastColumn() { return this.headers.length; }
  appendRow(values) {
    const vals = Array.isArray(values) ? values : [];
    if (!this.headers.length) {
      this.headers = vals.map(v => String(v ?? ''));
      this.metaDirty = true;
      return;
    }
    const data = {};
    this.headers.forEach((h, i) => { if (h) data[h] = vals[i] ?? ''; });
    this.rows.push({ rowId: null, sortKey: this.nextSortKey++, data, dirty: true, isNew: true });
  }
  deleteRow(rowNumber) {
    const idx = Number(rowNumber) - 2;
    if (idx < 0 || idx >= this.rows.length) return;
    const [rec] = this.rows.splice(idx, 1);
    if (rec.rowId != null) this.deletedIds.add(rec.rowId);
  }
  setFrozenRows() { return this; }
  autoResizeColumns() { return this; }
}

export class MemorySpreadsheet {
  constructor(sheets = new Map()) { this.sheets = sheets; }
  getSheetByName(name) { return this.sheets.get(String(name)) || null; }
  insertSheet(name) {
    const n = String(name);
    if (this.sheets.has(n)) return this.sheets.get(n);
    const sheet = new MemorySheet(n, [], []);
    sheet.metaDirty = true;
    this.sheets.set(n, sheet);
    return sheet;
  }
}

let OPTIMIZATION_SCHEMA_READY = false;

async function ensureOptimizationSchema(db) {
  if (OPTIMIZATION_SCHEMA_READY) return;
  try {
    await db.batch([
      db.prepare("CREATE INDEX IF NOT EXISTS idx_mf_rows_sheet_user ON mf_sheet_rows(sheet_name, json_extract(data,'$.userId'))"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_mf_rows_sheet_user_date ON mf_sheet_rows(sheet_name, json_extract(data,'$.userId'), json_extract(data,'$.date'))"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_mf_rows_sheet_user_id ON mf_sheet_rows(sheet_name, json_extract(data,'$.userId'), json_extract(data,'$.id'))"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_mf_rows_sheet_account ON mf_sheet_rows(sheet_name, json_extract(data,'$.userId'), json_extract(data,'$.accountId'))"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_mf_rows_sheet_token ON mf_sheet_rows(sheet_name, json_extract(data,'$.token'))"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_mf_rows_sheet_id ON mf_sheet_rows(sheet_name, json_extract(data,'$.id'))"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_mf_rows_sheet_email ON mf_sheet_rows(sheet_name, json_extract(data,'$.email'))"),
      db.prepare("CREATE VIEW IF NOT EXISTS mf_transactions_native AS SELECT row_id, sort_key, json_extract(data,'$.id') AS id, json_extract(data,'$.userId') AS user_id, json_extract(data,'$.date') AS date, json_extract(data,'$.type') AS type, CAST(json_extract(data,'$.amount') AS REAL) AS amount, json_extract(data,'$.accountId') AS account_id, json_extract(data,'$.toAccountId') AS to_account_id, data FROM mf_sheet_rows WHERE sheet_name='Transactions'"),
      db.prepare("CREATE VIEW IF NOT EXISTS mf_accounts_native AS SELECT row_id, sort_key, json_extract(data,'$.id') AS id, json_extract(data,'$.userId') AS user_id, json_extract(data,'$.name') AS name, json_extract(data,'$.type') AS type, CAST(json_extract(data,'$.balance') AS REAL) AS balance, json_extract(data,'$.currency') AS currency, data FROM mf_sheet_rows WHERE sheet_name='Accounts'")
    ]);
  } catch (error) {
    console.warn('MoneyFlow D1 optimization schema was not applied; continuing with compatibility storage', error);
  } finally {
    OPTIMIZATION_SCHEMA_READY = true;
  }
}

export class D1SheetContext {
  constructor(db, spreadsheet) { this.db = db; this.spreadsheet = spreadsheet; }

  static async load(db, sheetNames = null, userId = null) {
    await ensureOptimizationSchema(db);
    const metaResult = await db.prepare('SELECT sheet_name, headers FROM mf_sheet_meta ORDER BY sheet_name').all();
    let rowResult;
    const scopedUserId = userId == null || userId === '' ? null : String(userId);

    if (Array.isArray(sheetNames) && sheetNames.length) {
      const names = [...new Set(sheetNames.map(String).filter(Boolean))];
      const placeholders = names.map(() => '?').join(',');
      if (scopedUserId) {
        rowResult = await db
          .prepare(`SELECT row_id, sheet_name, sort_key, data FROM mf_sheet_rows
            WHERE sheet_name IN (${placeholders})
              AND (
                (sheet_name='Users' AND json_extract(data,'$.id')=?) OR
                (sheet_name='Sessions' AND json_extract(data,'$.userId')=?) OR
                (sheet_name NOT IN ('Users','Sessions') AND json_extract(data,'$.userId')=?)
              )
            ORDER BY sheet_name, sort_key, row_id`)
          .bind(...names, scopedUserId, scopedUserId, scopedUserId)
          .all();
      } else {
        rowResult = await db
          .prepare(`SELECT row_id, sheet_name, sort_key, data FROM mf_sheet_rows WHERE sheet_name IN (${placeholders}) ORDER BY sheet_name, sort_key, row_id`)
          .bind(...names)
          .all();
      }
    } else if (scopedUserId) {
      rowResult = await db
        .prepare(`SELECT row_id, sheet_name, sort_key, data FROM mf_sheet_rows
          WHERE (sheet_name='Users' AND json_extract(data,'$.id')=?)
             OR (sheet_name='Sessions' AND json_extract(data,'$.userId')=?)
             OR (sheet_name NOT IN ('Users','Sessions') AND json_extract(data,'$.userId')=?)
          ORDER BY sheet_name, sort_key, row_id`)
        .bind(scopedUserId, scopedUserId, scopedUserId)
        .all();
    } else {
      rowResult = await db.prepare('SELECT row_id, sheet_name, sort_key, data FROM mf_sheet_rows ORDER BY sheet_name, sort_key, row_id').all();
    }

    const map = new Map();
    for (const m of (metaResult.results || [])) {
      let headers = [];
      try { headers = JSON.parse(m.headers || '[]'); } catch {}
      map.set(String(m.sheet_name), new MemorySheet(String(m.sheet_name), Array.isArray(headers) ? headers : [], []));
    }
    for (const r of (rowResult.results || [])) {
      let data = {};
      try { data = JSON.parse(r.data || '{}'); } catch {}
      let sheet = map.get(String(r.sheet_name));
      if (!sheet) { sheet = new MemorySheet(String(r.sheet_name), [], []); map.set(String(r.sheet_name), sheet); }
      sheet.rows.push({ rowId: Number(r.row_id), sortKey: Number(r.sort_key || 0), data, dirty: false, isNew: false });
      sheet.nextSortKey = Math.max(sheet.nextSortKey, Number(r.sort_key || 0) + 1);
    }
    return new D1SheetContext(db, new MemorySpreadsheet(map));
  }

  async flush() {
    const stmts = [];
    for (const [name, sheet] of this.spreadsheet.sheets) {
      if (sheet.metaDirty) {
        stmts.push(this.db.prepare(`INSERT INTO mf_sheet_meta(sheet_name,headers,updated_at) VALUES(?,?,datetime('now')) ON CONFLICT(sheet_name) DO UPDATE SET headers=excluded.headers,updated_at=excluded.updated_at`).bind(name, JSON.stringify(sheet.headers)));
      }
      for (const id of sheet.deletedIds) stmts.push(this.db.prepare('DELETE FROM mf_sheet_rows WHERE row_id=?').bind(id));
      for (const rec of sheet.rows) {
        if (rec.isNew) {
          stmts.push(this.db.prepare('INSERT INTO mf_sheet_rows(sheet_name,sort_key,data) VALUES(?,?,?)').bind(name, rec.sortKey, JSON.stringify(rec.data)));
        } else if (rec.dirty) {
          stmts.push(this.db.prepare('UPDATE mf_sheet_rows SET data=? WHERE row_id=?').bind(JSON.stringify(rec.data), rec.rowId));
        }
      }
    }
    const BATCH = 80;
    for (let i = 0; i < stmts.length; i += BATCH) await this.db.batch(stmts.slice(i, i + BATCH));
  }
}
