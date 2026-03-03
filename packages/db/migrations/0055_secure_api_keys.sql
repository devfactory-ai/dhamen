-- Migration: Secure API keys with hash-based lookup
-- The `key` column will be replaced by `key_hash` to prevent plaintext storage

-- Add key_hash column for secure lookups (SHA-256 hash)
ALTER TABLE api_keys ADD COLUMN key_hash TEXT;

-- Create unique index on key_hash
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);

-- Add key_prefix column to store first 8 chars for debugging (pk_live_xxx...)
ALTER TABLE api_keys ADD COLUMN key_prefix TEXT;

-- NOTE: After deploying this migration, run a script to:
-- 1. Hash all existing keys: UPDATE api_keys SET key_hash = sha256(key), key_prefix = substr(key, 1, 12)
-- 2. Then drop the `key` column in a future migration
