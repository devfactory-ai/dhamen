-- Migration: Add workflow columns to bulletins_soins
-- Adds columns for the validation workflow by insurer agents

-- Add paper reception and workflow columns
ALTER TABLE bulletins_soins ADD COLUMN paper_received_date TEXT;
ALTER TABLE bulletins_soins ADD COLUMN estimated_reimbursement_date TEXT;
ALTER TABLE bulletins_soins ADD COLUMN missing_documents TEXT; -- JSON array
ALTER TABLE bulletins_soins ADD COLUMN validated_by TEXT REFERENCES users(id);
ALTER TABLE bulletins_soins ADD COLUMN agent_notes TEXT;

-- Update existing submitted statuses to scan_uploaded for new workflow
UPDATE bulletins_soins SET status = 'scan_uploaded' WHERE status = 'submitted';
