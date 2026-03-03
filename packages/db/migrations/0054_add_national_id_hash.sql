-- Migration: Add national_id_hash column for searchable encrypted fields
-- This allows lookup of adherents by national ID without decryption

-- Add hash column for indexed lookups (SHA-256 hash of nationalId + secret)
ALTER TABLE adherents ADD COLUMN national_id_hash TEXT;

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_adherents_national_id_hash ON adherents(national_id_hash);
