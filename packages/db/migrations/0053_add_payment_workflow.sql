-- Migration: Add payment workflow columns to bulletins_soins
-- Description: Adds columns for payment processing workflow

-- Add payment-related columns
ALTER TABLE bulletins_soins ADD COLUMN approved_date TEXT;
ALTER TABLE bulletins_soins ADD COLUMN approved_by TEXT REFERENCES users(id);
ALTER TABLE bulletins_soins ADD COLUMN approved_amount REAL;
ALTER TABLE bulletins_soins ADD COLUMN payment_reference TEXT;
ALTER TABLE bulletins_soins ADD COLUMN payment_method TEXT CHECK (payment_method IN ('bank_transfer', 'check', 'cash', 'mobile_payment'));
ALTER TABLE bulletins_soins ADD COLUMN payment_date TEXT;
ALTER TABLE bulletins_soins ADD COLUMN payment_notes TEXT;

-- Update any bulletins with 'reimbursed' status that don't have approved_date
UPDATE bulletins_soins
SET approved_date = processing_date,
    approved_amount = reimbursed_amount
WHERE status = 'reimbursed' AND approved_date IS NULL;
