-- Ajout remboursement brut et flag plafond dépassé par acte
ALTER TABLE actes_bulletin ADD COLUMN remboursement_brut REAL;
ALTER TABLE actes_bulletin ADD COLUMN plafond_depasse INTEGER DEFAULT 0;
