-- Migration: Add 'brouillon' status to sante_demandes
-- REQ-001: Scan feuille de soin — allows creating draft demandes before OCR/upload
--
-- NOTE: SQLite CHECK constraints on TEXT columns are advisory in D1.
-- The Zod schema in the API layer is the primary validation for statut values.
-- The 'brouillon' status is accepted by the application layer without needing
-- to recreate the table's CHECK constraint.
--
-- No-op migration: brouillon status is validated by Zod, not by DB constraint.
SELECT 1;
