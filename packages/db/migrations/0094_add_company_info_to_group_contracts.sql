-- Migration: 0094_add_company_info_to_group_contracts
-- Description: Add company address and matricule fiscale fields extracted from contract PDF

ALTER TABLE group_contracts ADD COLUMN company_address TEXT;
ALTER TABLE group_contracts ADD COLUMN matricule_fiscale TEXT;
