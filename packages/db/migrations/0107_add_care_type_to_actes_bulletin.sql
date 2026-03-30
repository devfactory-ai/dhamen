-- Migration: Add care_type column to actes_bulletin (per-acte care type)
ALTER TABLE actes_bulletin ADD COLUMN care_type TEXT;
