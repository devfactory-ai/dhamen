-- Ajout suivi consommation plafond annuel adherent
ALTER TABLE adherents ADD COLUMN plafond_consomme INTEGER DEFAULT 0;
