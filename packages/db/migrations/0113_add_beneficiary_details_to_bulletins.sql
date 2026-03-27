-- Migration: Add beneficiary details columns to bulletins_soins
-- Allows storing beneficiary info (email, address, date of naissance) when conjoint/enfant
-- is not yet registered in the system

ALTER TABLE bulletins_soins ADD COLUMN beneficiary_email TEXT;
ALTER TABLE bulletins_soins ADD COLUMN beneficiary_address TEXT;
ALTER TABLE bulletins_soins ADD COLUMN beneficiary_date_of_birth TEXT;
