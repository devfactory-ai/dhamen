-- Migration: Add dossier_complet flag to adherents

ALTER TABLE adherents ADD COLUMN dossier_complet INTEGER DEFAULT 1;

UPDATE adherents SET dossier_complet = 0
WHERE national_id_encrypted LIKE 'IMPORT_%'
   OR date_of_birth = '1900-01-01';

CREATE INDEX IF NOT EXISTS idx_adherents_dossier_complet ON adherents(dossier_complet);
