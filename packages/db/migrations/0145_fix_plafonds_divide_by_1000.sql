-- Fix: plafond values were stored 1000x too large due to double millimes conversion
-- annual_global_limit is already in millimes, but apply-to-adherents was multiplying by 1000 again

-- Fix adherents.plafond_global: values > 100_000_000 (>100k DT) are clearly inflated
UPDATE adherents
SET plafond_global = plafond_global / 1000,
    updated_at = datetime('now')
WHERE plafond_global > 100000000
  AND deleted_at IS NULL;

-- Fix adherents.plafond_consomme similarly
UPDATE adherents
SET plafond_consomme = plafond_consomme / 1000,
    updated_at = datetime('now')
WHERE plafond_consomme > 100000000
  AND deleted_at IS NULL;

-- Fix plafonds_beneficiaire.montant_plafond
UPDATE plafonds_beneficiaire
SET montant_plafond = montant_plafond / 1000,
    updated_at = datetime('now')
WHERE montant_plafond > 100000000;

-- Fix plafonds_beneficiaire.montant_consomme
UPDATE plafonds_beneficiaire
SET montant_consomme = montant_consomme / 1000,
    updated_at = datetime('now')
WHERE montant_consomme > 100000000;
