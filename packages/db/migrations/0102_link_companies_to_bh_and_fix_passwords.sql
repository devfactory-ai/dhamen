-- Migration: Link all companies to BH insurer and fix all passwords
-- Now that we consolidated to single BH insurer, all companies should reference BH

-- ============================================
-- 1. Link all existing companies to BH insurer
-- ============================================

UPDATE companies SET insurer_id = '01JCVMK8R7P2N3X4Y5Z6A7B8BH', updated_at = datetime('now')
WHERE id IN (
  '01JCVMKC3AP2N3X4Y5Z6A7B8C9',  -- Tunisie Telecom
  '01JCVMKC3BP2N3X4Y5Z6A7B8D0',  -- BIAT
  '01JCVMKC3CP2N3X4Y5Z6A7B8E1',  -- Groupe Poulina
  '01JCVMKC3DP2N3X4Y5Z6A7B8F2',  -- Clinique les Oliviers
  '01JCVMKC3EP2N3X4Y5Z6A7B8G3'   -- Carrefour Tunisie
);

-- ============================================
-- 2. Fix all passwords to Password123! (known-good Worker hash)
-- ============================================

UPDATE users
SET password_hash = '$pbkdf2$100000$EEleqOw1cOzGOkvmhy/cZQ==$bNyLTEip7trKXM+kYpujDoNYjdapsVWKWdAarxKVipg=',
    updated_at = datetime('now')
WHERE is_active = 1;

-- ============================================
-- 3. Link existing insurer users to BH
-- (Old STAR/GAT/COMAR/AMI insurer_id -> BH)
-- ============================================

UPDATE users SET insurer_id = '01JCVMK8R7P2N3X4Y5Z6A7B8BH', updated_at = datetime('now')
WHERE role IN ('INSURER_ADMIN', 'INSURER_AGENT') AND insurer_id IS NOT NULL;
