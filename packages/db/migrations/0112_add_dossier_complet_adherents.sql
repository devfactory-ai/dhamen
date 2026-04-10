-- Migration: Add dossier_complet flag to adherents
-- Column may already exist on some tenant DBs
SELECT 1; -- dossier_complet already exists on some DBs

UPDATE adherents SET dossier_complet = 0
WHERE dossier_complet IS NOT NULL
  AND (national_id_encrypted LIKE 'IMPORT_%' OR date_of_birth = '1900-01-01');

CREATE INDEX IF NOT EXISTS idx_adherents_dossier_complet ON adherents(dossier_complet);
