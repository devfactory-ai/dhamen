-- Migration: Add individual contract support alongside group contracts
-- Individual contracts reuse the group_contracts + contract_guarantees tables
-- with contract_type = 'individual' and adherent_id instead of company_id

-- Add contract type discriminator (group = existing, individual = new)
ALTER TABLE group_contracts ADD COLUMN contract_type TEXT NOT NULL DEFAULT 'group';

-- Add adherent_id for individual contracts (NULL for group contracts)
ALTER TABLE group_contracts ADD COLUMN adherent_id TEXT REFERENCES adherents(id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_group_contracts_type ON group_contracts(contract_type);
CREATE INDEX IF NOT EXISTS idx_group_contracts_adherent ON group_contracts(adherent_id);

-- Sentinel company for individual contracts (avoids NOT NULL violation on company_id)
INSERT OR IGNORE INTO companies (id, name, matricule_fiscal, is_active, created_at, updated_at)
VALUES ('__INDIVIDUAL__', 'Contrats Individuels', '000000000', 1, datetime('now'), datetime('now'));
