-- Migration: Create companies table and add HR role
-- Description: Companies sign contracts with insurers, HR staff manage their employees (adherents)

-- Create companies table
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  matricule_fiscal TEXT UNIQUE, -- Matricule Fiscal tunisien
  address TEXT,
  city TEXT,
  phone TEXT,
  email TEXT,
  sector TEXT, -- Secteur d'activite: 'IT', 'BANKING', 'HEALTHCARE', 'MANUFACTURING', 'RETAIL', 'OTHER'
  employee_count INTEGER,
  insurer_id TEXT REFERENCES insurers(id), -- Primary insurer
  contract_id TEXT REFERENCES contracts(id), -- Group contract
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_companies_mf ON companies(matricule_fiscal);
CREATE INDEX IF NOT EXISTS idx_companies_insurer ON companies(insurer_id);
CREATE INDEX IF NOT EXISTS idx_companies_is_active ON companies(is_active);

-- Add HR role and company_id to users
-- SQLite requires table recreation to modify CHECK constraints

CREATE TABLE IF NOT EXISTS users_new (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN (
    'ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT',
    'PHARMACIST', 'DOCTOR', 'LAB_MANAGER', 'CLINIC_ADMIN',
    'ADHERENT', 'HR',
    'SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'PRATICIEN', 'SOIN_RESPONSABLE', 'SOIN_DIRECTEUR',
    'COMPLIANCE_OFFICER'
  )),
  provider_id TEXT REFERENCES providers(id),
  insurer_id TEXT REFERENCES insurers(id),
  company_id TEXT REFERENCES companies(id), -- For HR users
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  mfa_enabled INTEGER DEFAULT 0,
  mfa_secret TEXT,
  last_login_at TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Copy existing data (add NULL for company_id)
INSERT INTO users_new (id, email, password_hash, role, provider_id, insurer_id, company_id, first_name, last_name, phone, mfa_enabled, mfa_secret, last_login_at, is_active, created_at, updated_at)
SELECT id, email, password_hash, role, provider_id, insurer_id, NULL, first_name, last_name, phone, mfa_enabled, mfa_secret, last_login_at, is_active, created_at, updated_at FROM users;

-- Drop old table and rename
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_provider ON users(provider_id);
CREATE INDEX IF NOT EXISTS idx_users_insurer ON users(insurer_id);
CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- Update adherents to link to companies
-- (company_id already exists from migration 0020)
