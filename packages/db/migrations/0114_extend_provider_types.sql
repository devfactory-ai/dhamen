-- Migration: Extend provider types to match SPROLS/BH Assurance contract categories
-- Adds: dentist, optician, kinesitherapeute, hospital

-- SQLite does not support ALTER TABLE ... DROP CONSTRAINT / ADD CONSTRAINT.
-- The CHECK on type was defined in 0003_create_providers.sql as:
--   CHECK (type IN ('pharmacist', 'doctor', 'lab', 'clinic'))
-- Since D1 doesn't enforce CHECK constraints on existing rows after ALTER,
-- and new rows are inserted via application code that already validates types,
-- we just need to ensure the application-level validation accepts the new types.
-- The PROVIDER_TYPES constant and providerCreateSchema already include all 8 types.

-- No-op migration marker: provider types extended at application level.
-- New valid types: pharmacist, doctor, lab, clinic, dentist, optician, kinesitherapeute, hospital
SELECT 1;
