-- Ajout suivi consommation plafond annuel adhérent
ALTER TABLE adherents ADD COLUMN plafond_consomme INTEGER DEFAULT 0;
