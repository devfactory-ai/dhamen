-- Table for sub-items (medications, analyses) within an acte
-- E.g., a pharmacy acte may contain 3 individual medications
CREATE TABLE IF NOT EXISTS acte_sub_items (
  id TEXT PRIMARY KEY,
  acte_id TEXT NOT NULL REFERENCES actes_bulletin(id),
  label TEXT NOT NULL,
  code TEXT,
  amount REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_acte_sub_items_acte_id ON acte_sub_items(acte_id);
