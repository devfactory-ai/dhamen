-- Migration: Add columns for compagnies partenaires module (REQ-014)
-- Columns already exist on remote, using no-ops to sync migration state
SELECT 1; -- type_assureur already exists
SELECT 1; -- matricule_fiscal already exists
SELECT 1; -- matricule_valide already exists
SELECT 1; -- date_debut_convention already exists
SELECT 1; -- date_fin_convention already exists
SELECT 1; -- taux_couverture already exists
