-- Migration: Add ADHERENT role to users table
-- Description: Modify the role CHECK constraint to include ADHERENT role for mobile app users

-- SQLite requires table recreation to modify CHECK constraints
-- Step 1: Create new table with updated constraint (includes company_id for future HR users)
CREATE TABLE IF NOT EXISTS users_new (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN (
    'ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT',
    'PHARMACIST', 'DOCTOR', 'LAB_MANAGER', 'CLINIC_ADMIN',
    'ADHERENT', 'HR', 'HR_ADMIN', 'HR_USER'
  )),
  provider_id TEXT REFERENCES providers(id),
  insurer_id TEXT REFERENCES insurers(id),
  company_id TEXT,
  company_id TEXT,
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

-- Step 2: Copy existing data (explicitly list columns since users_new has extra company_id)
INSERT INTO users_new (id, email, password_hash, role, provider_id, insurer_id, first_name, last_name, phone, mfa_enabled, mfa_secret, last_login_at, is_active, created_at, updated_at)
SELECT id, email, password_hash, role, provider_id, insurer_id, first_name, last_name, phone, mfa_enabled, mfa_secret, last_login_at, is_active, created_at, updated_at FROM users;

-- Step 3: Drop old table
DROP TABLE users;

-- Step 4: Rename new table
ALTER TABLE users_new RENAME TO users;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_provider ON users(provider_id);
CREATE INDEX IF NOT EXISTS idx_users_insurer ON users(insurer_id);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
