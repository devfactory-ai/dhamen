-- Migration: Add columns for compagnies partenaires module (REQ-014)
-- Additive only — no existing columns modified or deleted

ALTER TABLE insurers ADD COLUMN type_assureur TEXT DEFAULT 'autre';
ALTER TABLE insurers ADD COLUMN matricule_fiscal TEXT;
ALTER TABLE insurers ADD COLUMN matricule_valide INTEGER DEFAULT 0;
ALTER TABLE insurers ADD COLUMN date_debut_convention TEXT;
ALTER TABLE insurers ADD COLUMN date_fin_convention TEXT;
ALTER TABLE insurers ADD COLUMN taux_couverture REAL;
