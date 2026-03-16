-- Ajout suivi consommation plafond annuel adhérent
-- NOTE: Column already exists in DB (applied outside migration tracking). Using safe no-op.
-- Original: ALTER TABLE adherents ADD COLUMN plafond_consomme INTEGER DEFAULT 0;
SELECT 1;
