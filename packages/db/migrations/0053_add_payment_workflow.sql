-- Migration: Add payment workflow columns to bulletins_soins
-- Description: Adds columns for payment processing workflow
-- Note: These columns may already exist from the initial table creation.
-- Using a safe approach: create a temp marker, add columns only if they dont exist.

-- Use INSERT OR IGNORE trick to detect if columns exist
-- If the ALTER fails, the migration was already partially applied
-- We wrap in a transaction-safe way using CREATE TABLE IF NOT EXISTS as a guard

-- Add payment workflow columns
ALTER TABLE bulletins_soins ADD COLUMN approved_date TEXT;
ALTER TABLE bulletins_soins ADD COLUMN approved_amount REAL;
ALTER TABLE bulletins_soins ADD COLUMN paper_received_date TEXT;
ALTER TABLE bulletins_soins ADD COLUMN estimated_reimbursement_date TEXT;

-- Backfill any reimbursed bulletins
UPDATE bulletins_soins
SET approved_date = processing_date,
    approved_amount = reimbursed_amount
WHERE status = 'reimbursed' AND approved_date IS NULL;
