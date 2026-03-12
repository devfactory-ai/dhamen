-- Migration: Add adherent fields matching Acorad legacy system
-- Onglet Societe: etat_civil, date_mariage, is_active, dates adhesion, rang, lieu_naissance
-- Onglet Renseignement: adresse detail, mobile, banque/RIB, regime social, handicap, fonction, maladie chronique

ALTER TABLE adherents ADD COLUMN lieu_naissance TEXT;
ALTER TABLE adherents ADD COLUMN etat_civil TEXT CHECK (etat_civil IN ('celibataire', 'marie', 'divorce', 'veuf'));
ALTER TABLE adherents ADD COLUMN date_mariage TEXT;
ALTER TABLE adherents ADD COLUMN is_active INTEGER DEFAULT 1;
ALTER TABLE adherents ADD COLUMN date_debut_adhesion TEXT;
ALTER TABLE adherents ADD COLUMN date_fin_adhesion TEXT;
ALTER TABLE adherents ADD COLUMN rang INTEGER DEFAULT 0;
ALTER TABLE adherents ADD COLUMN postal_code TEXT;
ALTER TABLE adherents ADD COLUMN rue TEXT;
ALTER TABLE adherents ADD COLUMN mobile_encrypted TEXT;
ALTER TABLE adherents ADD COLUMN banque TEXT;
ALTER TABLE adherents ADD COLUMN rib_encrypted TEXT;
ALTER TABLE adherents ADD COLUMN regime_social TEXT CHECK (regime_social IN ('CNSS', 'CNRPS'));
ALTER TABLE adherents ADD COLUMN handicap INTEGER DEFAULT 0;
ALTER TABLE adherents ADD COLUMN fonction TEXT;
ALTER TABLE adherents ADD COLUMN maladie_chronique INTEGER DEFAULT 0;
ALTER TABLE adherents ADD COLUMN matricule_conjoint TEXT;
