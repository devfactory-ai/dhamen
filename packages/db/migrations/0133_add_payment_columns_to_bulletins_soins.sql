-- Migration: Add missing payment workflow columns to bulletins_soins
-- Columns already exist on remote, using no-ops to sync migration state
SELECT 1; -- approved_by already exists
SELECT 1; -- payment_method already exists
SELECT 1; -- payment_date already exists
SELECT 1; -- payment_reference already exists
SELECT 1; -- payment_notes already exists
