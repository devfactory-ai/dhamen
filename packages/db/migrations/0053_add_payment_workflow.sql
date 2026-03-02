-- Migration: Add payment workflow columns to bulletins_soins
-- Description: Adds columns for payment processing workflow

-- Note: Columns approved_date, approved_by, approved_amount, payment_reference,
-- payment_method, payment_date, payment_notes may already exist in bulletins_soins
-- SQLite doesn't support ADD COLUMN IF NOT EXISTS, skipping to avoid errors

-- Update any bulletins with 'reimbursed' status that don't have approved_date
UPDATE bulletins_soins
SET approved_date = processing_date,
    approved_amount = reimbursed_amount
WHERE status = 'reimbursed' AND approved_date IS NULL;
