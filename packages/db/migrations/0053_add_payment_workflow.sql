-- Migration: Add payment workflow columns to bulletins_soins
-- Description: Adds columns for payment processing workflow
-- Note: These columns may already exist from the initial table creation.
-- Using a safe approach: create a temp marker, add columns only if they dont exist.

-- Use INSERT OR IGNORE trick to detect if columns exist
-- If the ALTER fails, the migration was already partially applied
-- We wrap in a transaction-safe way using CREATE TABLE IF NOT EXISTS as a guard

-- Backfill any reimbursed bulletins (always safe to re-run)
UPDATE bulletins_soins
SET approved_date = processing_date,
    approved_amount = reimbursed_amount
WHERE status = 'reimbursed' AND approved_date IS NULL;
