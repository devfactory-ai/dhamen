-- Migration: 0109_extend_sante_praticiens
-- Extend sante_praticiens with fields required for Tunisian praticien management

ALTER TABLE sante_praticiens ADD COLUMN raison_sociale TEXT;
ALTER TABLE sante_praticiens ADD COLUMN gouvernorat TEXT;
ALTER TABLE sante_praticiens ADD COLUMN matricule_fiscal TEXT;
ALTER TABLE sante_praticiens ADD COLUMN matricule_valide INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sante_praticiens ADD COLUMN est_conventionne_cnam INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sante_praticiens ADD COLUMN code_cnam TEXT;

-- Sync existing MF data from providers table
UPDATE sante_praticiens
SET matricule_fiscal = (
  SELECT p.mf_number FROM providers p WHERE p.id = sante_praticiens.provider_id
),
matricule_valide = (
  SELECT COALESCE(p.mf_verified, 0) FROM providers p WHERE p.id = sante_praticiens.provider_id
)
WHERE provider_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sante_praticiens_mf ON sante_praticiens(matricule_fiscal);
CREATE INDEX IF NOT EXISTS idx_sante_praticiens_gouvernorat ON sante_praticiens(gouvernorat);
