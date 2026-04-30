-- Migration: 0161_split_dentaire_dc_dp
-- Split "SD" (soins et prothèses dentaires) into two distinct actes:
--   DC = Soins Dentaires (lettre_cle D, valeur contrat 3.000 DT, plafond 600 DT)
--   DP = Prothèses Dentaires (lettre_cle D, valeur contrat 4.000 DT, plafond 700 DT)
-- ODF remains separate under orthodontie (fa-011, already handled by guarantee #13).

-- 1. Insert DC (Soins Dentaires)
INSERT OR IGNORE INTO actes_referentiel (id, code, label, lettre_cle, taux_remboursement, famille_id, is_active, created_at, updated_at)
VALUES ('acte-dc-soins-dentaires', 'DC', 'Soins Dentaires', 'D', 1.0, 'fa-011', 1, datetime('now'), datetime('now'));

-- 2. Insert DP (Prothèses Dentaires)
INSERT OR IGNORE INTO actes_referentiel (id, code, label, lettre_cle, taux_remboursement, famille_id, is_active, created_at, updated_at)
VALUES ('acte-dp-protheses-dentaires', 'DP', 'Prothèses Dentaires', 'D', 1.0, 'fa-011', 1, datetime('now'), datetime('now'));

-- 3. Keep SD for backward compat (existing bulletins reference it) but mark inactive
UPDATE actes_referentiel SET is_active = 0 WHERE code = 'SD' AND famille_id = 'fa-011';

-- 4. Keep DENT-CONS and DENT-SOIN inactive (legacy codes)
UPDATE actes_referentiel SET is_active = 0 WHERE code IN ('DENT-CONS', 'DENT-SOIN') AND famille_id = 'fa-011';
