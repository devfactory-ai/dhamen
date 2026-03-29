-- Migration: 0109_extend_sante_praticiens
-- Description: Extend sante_praticiens with fields required for Tunisian praticien management
-- Adds: raison_sociale, gouvernorat, MF fields, BH/CNAM conventionnement distinction

-- Raison sociale (for pharmacies, labs, clinics)
ALTER TABLE sante_praticiens ADD COLUMN raison_sociale TEXT;

-- Gouvernorat (Tunisian governorate)
ALTER TABLE sante_praticiens ADD COLUMN gouvernorat TEXT;

-- Matricule fiscal fields (synced from providers table)
ALTER TABLE sante_praticiens ADD COLUMN matricule_fiscal TEXT;
ALTER TABLE sante_praticiens ADD COLUMN matricule_valide INTEGER NOT NULL DEFAULT 0;

-- Distinction BH Assurance vs CNAM conventionnement
-- (est_conventionne already exists → now means BH specifically)
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

-- Index on MF for fast lookups
CREATE INDEX IF NOT EXISTS idx_sante_praticiens_mf ON sante_praticiens(matricule_fiscal);
CREATE INDEX IF NOT EXISTS idx_sante_praticiens_gouvernorat ON sante_praticiens(gouvernorat);
