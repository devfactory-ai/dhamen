-- Add missing standard Tunisian letter-key actes to actes_referentiel.
-- These are used in contract letter_keys_json but were missing from the referentiel,
-- causing them to not appear in the bulletin acte selector.

-- AMO / AMY — auxiliaires médicaux spécialisés
INSERT OR IGNORE INTO actes_referentiel (id, code, label, taux_remboursement, plafond_acte, is_active, famille_id, type_calcul, valeur_base, lettre_cle)
VALUES
  ('acte-amo', 'AMO', 'Acte Orthoptie',     0.80, NULL, 1, 'fa-009', 'taux', NULL, 'AMO'),
  ('acte-amy', 'AMY', 'Acte Orthophonie',    0.80, NULL, 1, 'fa-009', 'taux', NULL, 'AMY');

-- Actes courants manquants
INSERT OR IGNORE INTO actes_referentiel (id, code, label, taux_remboursement, plafond_acte, is_active, famille_id, type_calcul, valeur_base, lettre_cle)
VALUES
  ('acte-elr', 'ELR', 'Électro-radiographie', 0.80, NULL, 1, 'fa-009', 'taux', NULL, 'Z'),
  ('acte-phy', 'PHY', 'Physiothérapie',       0.80, NULL, 1, 'fa-009', 'taux', NULL, 'AM'),
  ('acte-kin', 'KIN', 'Kinésithérapie',       0.80, NULL, 1, 'fa-009', 'taux', NULL, 'AM');

-- Fix lettre_cle NULL on existing actes
UPDATE actes_referentiel SET lettre_cle = code WHERE code IN ('AMO', 'AMY', 'K') AND lettre_cle IS NULL;
