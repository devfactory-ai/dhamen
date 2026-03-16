-- Ajouter les champs famille sur adherents
ALTER TABLE adherents ADD COLUMN code_type TEXT CHECK (code_type IN ('A', 'C', 'E'));
ALTER TABLE adherents ADD COLUMN parent_adherent_id TEXT REFERENCES adherents(id);
ALTER TABLE adherents ADD COLUMN rang_pres INTEGER DEFAULT 0 CHECK (rang_pres >= 0 AND rang_pres <= 99);
ALTER TABLE adherents ADD COLUMN code_situation_fam TEXT CHECK (code_situation_fam IN ('C', 'M', 'D', 'V'));

CREATE INDEX IF NOT EXISTS idx_adherents_parent ON adherents(parent_adherent_id);
CREATE INDEX IF NOT EXISTS idx_adherents_code_type ON adherents(code_type);

-- Initialiser les adhérents existants comme principaux
UPDATE adherents SET code_type = 'A', rang_pres = 0 WHERE parent_adherent_id IS NULL AND code_type IS NULL;
