-- Ajout champs société Acorad : code, date ouverture, numéro contrat
ALTER TABLE companies ADD COLUMN code TEXT;
ALTER TABLE companies ADD COLUMN date_ouverture TEXT;
ALTER TABLE companies ADD COLUMN contract_number TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_code ON companies(code) WHERE code IS NOT NULL;
