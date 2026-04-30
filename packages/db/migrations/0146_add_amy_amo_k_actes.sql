-- Add missing actes: AMY (Orthophonie), AMO (Orthoptie), K (Traitement spécial)
-- These are CNAM letter keys used in paramedical and specialist acts

INSERT INTO actes_referentiel (id, code, label, type_calcul, valeur_base, taux_remboursement, plafond_acte, famille_id, code_assureur, is_active, created_at, updated_at)
VALUES
  ('acte-amy', 'AMY', 'Acte Orthophonie', 'forfait', 1500, 0.80, NULL, 'fa-009', 'AMY', 1, datetime('now'), datetime('now')),
  ('acte-amo', 'AMO', 'Acte Orthoptie', 'forfait', 1500, 0.80, NULL, 'fa-009', 'AMO', 1, datetime('now'), datetime('now')),
  ('acte-k',   'K',   'Traitement spécial', 'forfait', 1500, 0.80, NULL, 'fa-009', 'K', 1, datetime('now'), datetime('now'));
