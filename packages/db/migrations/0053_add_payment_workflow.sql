-- Migration: Add payment workflow columns to bulletins_soins
-- Description: Adds columns for payment processing workflow

-- Add payment workflow columns
ALTER TABLE bulletins_soins ADD COLUMN approved_date TEXT;
ALTER TABLE bulletins_soins ADD COLUMN approved_amount INTEGER;

-- Update any bulletins with 'reimbursed' status that don't have approved_date
UPDATE bulletins_soins
SET approved_date = processing_date,
    approved_amount = reimbursed_amount
WHERE status = 'reimbursed' AND approved_date IS NULL;
