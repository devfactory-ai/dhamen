-- Migration: Add care_type column to actes_bulletin (per-acte care type)
-- NOTE: Column already exists on staging. No-op for idempotency.
SELECT 1;
