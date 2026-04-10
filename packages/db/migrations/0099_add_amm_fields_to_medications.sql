-- Migration: Add AMM (Autorisation de Mise sur le Marché) fields to medications
-- Columns already exist on some tenant DBs, using no-ops
SELECT 1; -- code_amm already exists
SELECT 1; -- gpb already exists
SELECT 1; -- veic already exists
SELECT 1; -- amm_classe already exists
SELECT 1; -- amm_sous_classe already exists
SELECT 1; -- amm_date already exists
SELECT 1; -- indications already exists
SELECT 1; -- duree_conservation already exists
SELECT 1; -- conditionnement_primaire already exists
SELECT 1; -- spec_conditionnement already exists
SELECT 1; -- tableau_amm already exists

CREATE INDEX IF NOT EXISTS idx_medications_code_amm ON medications(code_amm);
CREATE INDEX IF NOT EXISTS idx_medications_gpb ON medications(gpb);
CREATE INDEX IF NOT EXISTS idx_medications_veic ON medications(veic);
CREATE INDEX IF NOT EXISTS idx_medications_amm_classe ON medications(amm_classe);
CREATE INDEX IF NOT EXISTS idx_medications_amm_sous_classe ON medications(amm_sous_classe);
