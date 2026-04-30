-- Migration 0150: Add daily limit columns to contrat_baremes
-- Enables per-day plafond for hospitalisation, cures thermales, etc.
-- Both columns are nullable → no impact on existing data

ALTER TABLE contrat_baremes ADD COLUMN plafond_jour REAL;
ALTER TABLE contrat_baremes ADD COLUMN max_jours INTEGER;
