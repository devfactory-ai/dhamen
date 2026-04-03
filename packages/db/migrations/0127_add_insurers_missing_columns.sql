-- Migration: Add missing columns to insurers table (city, postal_code, website, registration_number, type)
-- These fields exist in the UI form but were not in the DB

ALTER TABLE insurers ADD COLUMN city TEXT;
ALTER TABLE insurers ADD COLUMN postal_code TEXT;
ALTER TABLE insurers ADD COLUMN website TEXT;
ALTER TABLE insurers ADD COLUMN registration_number TEXT;
ALTER TABLE insurers ADD COLUMN type TEXT DEFAULT 'INSURANCE';
