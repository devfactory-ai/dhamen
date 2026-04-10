-- Migration: Add individual contract support alongside group contracts
-- Columns already exist on some tenant DBs
SELECT 1; -- contract_type already exists
SELECT 1; -- adherent_id already exists

CREATE INDEX IF NOT EXISTS idx_group_contracts_type ON group_contracts(contract_type);
CREATE INDEX IF NOT EXISTS idx_group_contracts_adherent ON group_contracts(adherent_id);

-- Sentinel company for individual contracts
INSERT OR IGNORE INTO companies (id, name, matricule_fiscal, is_active, created_at, updated_at)
VALUES ('__INDIVIDUAL__', 'Contrats Individuels', '000000000', 1, datetime('now'), datetime('now'));
