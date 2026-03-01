-- Migration: Add document_url to contracts table
-- Description: Allow attaching a PDF document to each contract

ALTER TABLE contracts ADD COLUMN document_url TEXT;
ALTER TABLE contracts ADD COLUMN document_id TEXT;

-- Also add policy_number as it's used in some queries
ALTER TABLE contracts ADD COLUMN policy_number TEXT;
