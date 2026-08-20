PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS mf_sheet_meta (
  sheet_name TEXT PRIMARY KEY,
  headers TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mf_sheet_rows (
  row_id INTEGER PRIMARY KEY AUTOINCREMENT,
  sheet_name TEXT NOT NULL,
  sort_key INTEGER NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (sheet_name) REFERENCES mf_sheet_meta(sheet_name) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mf_sheet_rows_sheet_order
  ON mf_sheet_rows(sheet_name, sort_key, row_id);
