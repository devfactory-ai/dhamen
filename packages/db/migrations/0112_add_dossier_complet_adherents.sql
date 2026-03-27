-- Migration: Add dossier_complet flag to adherents
-- Tracks whether the adherent's profile has been fully completed
-- Adherents auto-created from bulletin import will have dossier_complet = 0

ALTER TABLE adherents ADD COLUMN dossier_complet INTEGER DEFAULT 1;

-- Mark existing auto-created adherents (from bulletin import) as incomplete
-- They have placeholder national_id starting with 'IMPORT_' and date_of_birth = '1900-01-01'
UPDATE adherents SET dossier_complet = 0
WHERE national_id_encrypted LIKE 'IMPORT_%'
   OR date_of_birth = '1900-01-01';

CREATE INDEX IF NOT EXISTS idx_adherents_dossier_complet ON adherents(dossier_complet);
