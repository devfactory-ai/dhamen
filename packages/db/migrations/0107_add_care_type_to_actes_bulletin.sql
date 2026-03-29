-- Migration: Add care_type column to actes_bulletin (per-acte care type)
-- Previously care_type was only on bulletins_soins (bulletin level).
-- Now each acte can have its own care type (consultation, pharmacy, lab, hospital).

ALTER TABLE actes_bulletin ADD COLUMN care_type TEXT DEFAULT 'consultation';
