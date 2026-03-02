-- Migration: Add workflow columns to bulletins_soins
-- Adds columns for the validation workflow by insurer agents

-- Note: Columns paper_received_date, estimated_reimbursement_date, missing_documents,
-- validated_by, agent_notes may already exist in bulletins_soins
-- SQLite doesn't support ADD COLUMN IF NOT EXISTS, skipping to avoid errors

-- Update existing submitted statuses to scan_uploaded for new workflow
UPDATE bulletins_soins SET status = 'scan_uploaded' WHERE status = 'submitted';
