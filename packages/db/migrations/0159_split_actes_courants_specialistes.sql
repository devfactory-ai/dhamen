-- Split actes courants into two families matching the TP prestation structure:
-- fa-009: Actes médicaux courants (PC, AM, AMM, AMO, AMY, KIN)
-- fa-017: Actes spécialistes et pratique médicale courante (Z, E, ELR, K, R, TS, PHY)
-- fa-017 gets its own care_type 'actes_specialistes' for independent contract guarantee.
-- Backward compat: adapter fallback maps fa-017 → ['actes_specialistes', 'actes_courants'].

UPDATE familles_actes SET label = 'Actes médicaux courants' WHERE id = 'fa-009';
UPDATE familles_actes SET label = 'Actes spécialistes et pratique médicale courante', care_type = 'actes_specialistes', ordre = 10 WHERE id = 'fa-017';

-- Move specialist actes to fa-017
UPDATE actes_referentiel SET famille_id = 'fa-017' WHERE code IN ('Z', 'E', 'ELR', 'K', 'R', 'TS', 'PHY');
