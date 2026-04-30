-- Merge all hospitalisation into single family fa-007
-- HP was in fa-008, now moved to fa-007 alongside CL, HOSP
UPDATE actes_referentiel SET famille_id = 'fa-007' WHERE code = 'HP' AND famille_id = 'fa-008';

-- Add sanatorium acte
INSERT OR IGNORE INTO actes_referentiel (id, code, label, taux_remboursement, plafond_acte, famille_id, type_calcul, valeur_base, code_assureur)
VALUES ('acte-sana', 'SANA', 'Sanatorium / Préventorium', 1.00, NULL, 'fa-007', 'taux', NULL, 'SANA');

-- Rename fa-007 to generic "Hospitalisation"
UPDATE familles_actes SET label = 'Hospitalisation' WHERE id = 'fa-007';

-- Deactivate fa-008 (merged into fa-007)
UPDATE familles_actes SET is_active = 0 WHERE id = 'fa-008';
