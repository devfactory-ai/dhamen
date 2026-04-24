-- Merge FA0002 (Actes médicaux courants) into FA0009 (Actes de spécialistes)
-- FA0002 has 0 actes, FA0009 has all the actual actes (AM, AMM, PC, E, Z, K, etc.)
-- They represent the same thing in the TP.

-- 1. Move any actes that might reference fa-002 to fa-009
UPDATE actes_referentiel SET famille_id = 'fa-009', updated_at = datetime('now') WHERE famille_id = 'fa-002';

-- 2. Move any contract_guarantees referencing FA0002
UPDATE contract_guarantees SET care_type = 'actes_courants' WHERE care_type = 'actes_medicaux_courants';

-- 3. Move any plafonds_beneficiaire referencing fa-002
UPDATE plafonds_beneficiaire SET famille_acte_id = 'fa-009' WHERE famille_acte_id = 'fa-002';

-- 4. Rename FA0009 to a clearer label
UPDATE familles_actes SET label = 'Actes médicaux courants et spécialistes' WHERE id = 'fa-009';

-- 5. Delete FA0002 (now empty)
DELETE FROM familles_actes WHERE id = 'fa-002';
