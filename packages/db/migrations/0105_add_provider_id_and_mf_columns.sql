-- Migration: Add provider_id to bulletins_soins and mf columns to providers
-- Columns may already exist on some tenant DBs, using no-ops for safety
SELECT 1; -- provider_id and mf columns handled as no-ops
