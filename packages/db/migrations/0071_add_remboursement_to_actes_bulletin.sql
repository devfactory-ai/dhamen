-- Ajout colonnes de remboursement à actes_bulletin
-- NOTE: Columns already exist in DB (applied outside migration tracking). Using safe no-op.
-- Original:
--   ALTER TABLE actes_bulletin ADD COLUMN taux_remboursement REAL;
--   ALTER TABLE actes_bulletin ADD COLUMN montant_rembourse REAL;
--   ALTER TABLE actes_bulletin ADD COLUMN acte_ref_id TEXT REFERENCES actes_referentiel(id);
SELECT 1;
