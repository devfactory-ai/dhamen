-- Ajout remboursement brut et flag plafond dépassé par acte
-- NOTE: Columns already exist in DB (applied outside migration tracking). Using safe no-op.
-- Original:
--   ALTER TABLE actes_bulletin ADD COLUMN remboursement_brut REAL;
--   ALTER TABLE actes_bulletin ADD COLUMN plafond_depasse INTEGER DEFAULT 0;
SELECT 1;
