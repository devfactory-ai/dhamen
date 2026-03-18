-- Ajout colonnes de remboursement a actes_bulletin
ALTER TABLE actes_bulletin ADD COLUMN taux_remboursement REAL;
ALTER TABLE actes_bulletin ADD COLUMN montant_rembourse REAL;
ALTER TABLE actes_bulletin ADD COLUMN acte_ref_id TEXT REFERENCES actes_referentiel(id);
