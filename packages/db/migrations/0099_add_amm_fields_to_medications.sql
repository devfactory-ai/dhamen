-- Migration: Add AMM (Autorisation de Mise sur le Marché) fields to medications
-- Source: liste_amm.xls from Tunisian DPM (Direction de la Pharmacie et du Médicament)

ALTER TABLE medications ADD COLUMN code_amm TEXT;
ALTER TABLE medications ADD COLUMN gpb TEXT;
ALTER TABLE medications ADD COLUMN veic TEXT;
ALTER TABLE medications ADD COLUMN amm_classe TEXT;
ALTER TABLE medications ADD COLUMN amm_sous_classe TEXT;
ALTER TABLE medications ADD COLUMN amm_date TEXT;
ALTER TABLE medications ADD COLUMN indications TEXT;
ALTER TABLE medications ADD COLUMN duree_conservation INTEGER;
ALTER TABLE medications ADD COLUMN conditionnement_primaire TEXT;
ALTER TABLE medications ADD COLUMN spec_conditionnement TEXT;
ALTER TABLE medications ADD COLUMN tableau_amm TEXT;

CREATE INDEX IF NOT EXISTS idx_medications_code_amm ON medications(code_amm);
CREATE INDEX IF NOT EXISTS idx_medications_gpb ON medications(gpb);
CREATE INDEX IF NOT EXISTS idx_medications_veic ON medications(veic);
CREATE INDEX IF NOT EXISTS idx_medications_amm_classe ON medications(amm_classe);
CREATE INDEX IF NOT EXISTS idx_medications_amm_sous_classe ON medications(amm_sous_classe);
