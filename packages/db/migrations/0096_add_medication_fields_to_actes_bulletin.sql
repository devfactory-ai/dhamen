-- Migration 0096: Ajouter medication_id et medication_family_id à actes_bulletin
-- Permet de tracer quel médicament et quelle famille ont été utilisés pour le calcul

ALTER TABLE actes_bulletin ADD COLUMN medication_id TEXT REFERENCES medications(id);
ALTER TABLE actes_bulletin ADD COLUMN medication_family_id TEXT REFERENCES medication_families(id);
ALTER TABLE actes_bulletin ADD COLUMN taux_applique REAL;

CREATE INDEX IF NOT EXISTS idx_actes_bulletin_medication ON actes_bulletin(medication_id);
CREATE INDEX IF NOT EXISTS idx_actes_bulletin_med_family ON actes_bulletin(medication_family_id);
