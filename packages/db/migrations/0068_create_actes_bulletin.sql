-- Table for medical acts linked to a bulletin
CREATE TABLE IF NOT EXISTS actes_bulletin (
  id TEXT PRIMARY KEY,
  bulletin_id TEXT NOT NULL REFERENCES bulletins_soins(id),
  code TEXT,
  label TEXT NOT NULL,
  amount REAL NOT NULL CHECK(amount > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_actes_bulletin_bulletin_id ON actes_bulletin(bulletin_id);
