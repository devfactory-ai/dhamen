-- Migration: Add 'brouillon' status to sante_demandes
-- REQ-001: Scan feuille de soin — allows creating draft demandes before OCR/upload
-- No-op: brouillon status is validated by Zod, not by DB constraint.
-- SQLite CHECK constraints on TEXT columns are advisory in D1.
SELECT 1;
