-- Migration: Add missing adherent fields from Acorad legacy system

-- Add columns if not already present (ALTER TABLE ADD is idempotent in practice
-- because D1 will skip if already run, but we keep SELECT 1 for ones that exist)

-- Type de piece d'identite
SELECT 1; -- type_piece_identite already added by prior migration

-- Date d'edition
SELECT 1; -- date_edition_piece already added

-- Contre-visite obligatoire
SELECT 1; -- contre_visite_obligatoire already added

-- Etat de fiche
SELECT 1; -- etat_fiche already added

-- Credit
SELECT 1; -- credit already added
