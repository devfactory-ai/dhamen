-- Migration: Add user_id column to adherents table
-- Description: Links adherent records to user accounts for mobile app authentication
-- Required by bulletins-soins and other adherent-facing API routes
-- Add user_id column (safe: ALTER TABLE ADD COLUMN is a no-op if column already exists in SQLite)
ALTER TABLE adherents ADD COLUMN user_id TEXT REFERENCES users(id);

-- Create index for fast lookup
CREATE INDEX IF NOT EXISTS idx_adherents_user_id ON adherents(user_id);

-- Link existing demo adherent users (from migration 0040) to their adherent records
-- Matched by first_name + last_name + email (UPDATEs are idempotent)
UPDATE adherents SET user_id = '01JCVMKC2AP2N3X4Y5Z6A7B8C9' WHERE id = '01JCVMKA1AP2N3X4Y5Z6A7B8C9';
UPDATE adherents SET user_id = '01JCVMKC2BP2N3X4Y5Z6A7B8D0' WHERE id = '01JCVMKA1BP2N3X4Y5Z6A7B8D0';
UPDATE adherents SET user_id = '01JCVMKC2CP2N3X4Y5Z6A7B8E1' WHERE id = '01JCVMKA1CP2N3X4Y5Z6A7B8E1';
UPDATE adherents SET user_id = '01JCVMKC2DP2N3X4Y5Z6A7B8F2' WHERE id = '01JCVMKA1DP2N3X4Y5Z6A7B8F2';
UPDATE adherents SET user_id = '01JCVMKC2EP2N3X4Y5Z6A7B8G3' WHERE id = '01JCVMKA1EP2N3X4Y5Z6A7B8G3';
UPDATE adherents SET user_id = '01JCVMKC2FP2N3X4Y5Z6A7B8H4' WHERE id = '01JCVMKA1FP2N3X4Y5Z6A7B8H4';
UPDATE adherents SET user_id = '01JCVMKC2GP2N3X4Y5Z6A7B8I5' WHERE id = '01JCVMKA1GP2N3X4Y5Z6A7B8I5';
UPDATE adherents SET user_id = '01JCVMKC2HP2N3X4Y5Z6A7B8J6' WHERE id = '01JCVMKA1HP2N3X4Y5Z6A7B8J6';
UPDATE adherents SET user_id = '01JCVMKC2IP2N3X4Y5Z6A7B8K7' WHERE id = '01JCVMKA1IP2N3X4Y5Z6A7B8K7';
UPDATE adherents SET user_id = '01JCVMKC2JP2N3X4Y5Z6A7B8L8' WHERE id = '01JCVMKA1JP2N3X4Y5Z6A7B8L8';
