-- Migration: 0093_add_group_contract_id_to_contracts
-- Description: Add group_contract_id FK to contracts table to link individual contracts
-- to their parent group contract

ALTER TABLE contracts ADD COLUMN group_contract_id TEXT REFERENCES group_contracts(id);

CREATE INDEX IF NOT EXISTS idx_contracts_group_contract ON contracts(group_contract_id);
