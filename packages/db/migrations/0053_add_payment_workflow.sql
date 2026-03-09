-- Migration: Add payment workflow columns to bulletins_soins
-- Description: Adds columns for payment processing workflow

-- Add payment workflow columns
ALTER TABLE bulletins_soins ADD COLUMN approved_date TEXT;
ALTER TABLE bulletins_soins ADD COLUMN approved_amount INTEGER;

-- Add payment workflow columns to bulletins_soins
ALTER TABLE bulletins_soins ADD COLUMN approved_date TEXT;
ALTER TABLE bulletins_soins ADD COLUMN approved_by TEXT;
ALTER TABLE bulletins_soins ADD COLUMN approved_amount INTEGER;
ALTER TABLE bulletins_soins ADD COLUMN payment_reference TEXT;
ALTER TABLE bulletins_soins ADD COLUMN payment_method TEXT;
ALTER TABLE bulletins_soins ADD COLUMN payment_date TEXT;
ALTER TABLE bulletins_soins ADD COLUMN payment_notes TEXT;

-- Backfill any reimbursed bulletins
UPDATE bulletins_soins
SET approved_date = processing_date,
    approved_amount = reimbursed_amount
WHERE status = 'reimbursed' AND approved_date IS NULL;
