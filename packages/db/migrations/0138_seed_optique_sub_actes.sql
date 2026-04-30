-- Migration: Add optique sub-category actes (monture, verres, doubles foyers, lentilles)
-- These map to sub_limits_json keys in contract_guarantees for per-item plafonds
-- Source: Tableau de Prestations - Rubrique 4 (Optique)

INSERT OR IGNORE INTO actes_referentiel (id, code, label, famille_id, type_calcul, taux_remboursement, valeur_base, plafond_acte, is_active, created_at, updated_at)
VALUES
  ('acte-monture',       'MONTURE',        'Monture',                'fa-006', 'taux', 1.0, NULL, 300000, 1, datetime('now'), datetime('now')),
  ('acte-verres',        'VERRES',         'Verres normaux',         'fa-006', 'taux', 1.0, NULL, 200000, 1, datetime('now'), datetime('now')),
  ('acte-doubles-foyer', 'DOUBLES_FOYERS', 'Verres doubles foyers',  'fa-006', 'taux', 1.0, NULL, 400000, 1, datetime('now'), datetime('now')),
  ('acte-lentilles',     'LENTILLES',      'Lentilles',              'fa-006', 'taux', 1.0, NULL, 150000, 1, datetime('now'), datetime('now'));
