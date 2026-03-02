-- Migration: Add document_url to contracts table
-- Description: Allow attaching a PDF document to each contract

-- Note: Columns document_url, document_id, policy_number may already exist in contracts
-- SQLite doesn't support ADD COLUMN IF NOT EXISTS, skipping to avoid errors
-- If these columns don't exist, they should be added manually:
-- ALTER TABLE contracts ADD COLUMN document_url TEXT;
-- ALTER TABLE contracts ADD COLUMN document_id TEXT;
-- ALTER TABLE contracts ADD COLUMN policy_number TEXT;
