-- Migration: Add beneficiary details columns to bulletins_soins

ALTER TABLE bulletins_soins ADD COLUMN beneficiary_email TEXT;
ALTER TABLE bulletins_soins ADD COLUMN beneficiary_address TEXT;
ALTER TABLE bulletins_soins ADD COLUMN beneficiary_date_of_birth TEXT;
