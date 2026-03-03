-- Migration: Fix all user passwords to use correct PBKDF2 hash for 'Password123!'
-- The original seed data (0011) had an incorrectly generated hash
-- This updates ALL users to use the verified correct hash

UPDATE users
SET password_hash = '$pbkdf2$100000$EEleqOw1cOzGOkvmhy/cZQ==$bNyLTEip7trKXM+kYpujDoNYjdapsVWKWdAarxKVipg=',
    updated_at = datetime('now')
WHERE is_active = 1;
