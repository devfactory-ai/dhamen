-- Migration: Seed BH insurer and demo users
-- Description: Add BH Assurance insurer and 6 demo user accounts

-- ============================================
-- BH INSURER
-- ============================================

INSERT OR IGNORE INTO insurers (id, code, name, email, phone, is_active, created_at, updated_at)
VALUES ('01JCVMK8R7P2N3X4Y5Z6A7B8BH', 'BH', 'BH Assurance', 'contact@bh.com.tn', '+21671126000', 1, datetime('now'), datetime('now'));

-- ============================================
-- USERS (Password: Password123!)
-- Hash format: PBKDF2-SHA256 (100k iterations)
-- ============================================

-- Super Admins (2)
INSERT OR REPLACE INTO users (id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at)
VALUES
  ('01SUPERADMIN00000000000001', 'admin@yopmail.com', '$pbkdf2$100000$EEleqOw1cOzGOkvmhy/cZQ==$bNyLTEip7trKXM+kYpujDoNYjdapsVWKWdAarxKVipg=', 'Admin', 'Principal', 'ADMIN', 1, datetime('now'), datetime('now')),
  ('01SUPERADMIN00000000000002', 'admin1@yopmail.com', '$pbkdf2$100000$EEleqOw1cOzGOkvmhy/cZQ==$bNyLTEip7trKXM+kYpujDoNYjdapsVWKWdAarxKVipg=', 'Admin', 'Secondaire', 'ADMIN', 1, datetime('now'), datetime('now'));

-- Admin Assureurs (2) - linked to BH
INSERT OR REPLACE INTO users (id, email, password_hash, first_name, last_name, role, insurer_id, is_active, created_at, updated_at)
VALUES
  ('01INSURADMIN0000000000001', 'adminassureur@yopmail.com', '$pbkdf2$100000$EEleqOw1cOzGOkvmhy/cZQ==$bNyLTEip7trKXM+kYpujDoNYjdapsVWKWdAarxKVipg=', 'Admin', 'Assureur', 'INSURER_ADMIN', '01JCVMK8R7P2N3X4Y5Z6A7B8BH', 1, datetime('now'), datetime('now')),
  ('01INSURADMIN0000000000002', 'adminassureur1@yopmail.com', '$pbkdf2$100000$EEleqOw1cOzGOkvmhy/cZQ==$bNyLTEip7trKXM+kYpujDoNYjdapsVWKWdAarxKVipg=', 'Admin', 'Assureur 2', 'INSURER_ADMIN', '01JCVMK8R7P2N3X4Y5Z6A7B8BH', 1, datetime('now'), datetime('now'));

-- Agents (2) - linked to BH
INSERT OR REPLACE INTO users (id, email, password_hash, first_name, last_name, role, insurer_id, is_active, created_at, updated_at)
VALUES
  ('01INSURERAGENT000000000001', 'testagent@yopmail.com', '$pbkdf2$100000$EEleqOw1cOzGOkvmhy/cZQ==$bNyLTEip7trKXM+kYpujDoNYjdapsVWKWdAarxKVipg=', 'Test', 'Agent', 'INSURER_AGENT', '01JCVMK8R7P2N3X4Y5Z6A7B8BH', 1, datetime('now'), datetime('now')),
  ('01INSURERAGENT000000000002', 'sirine@yopmail.com', '$pbkdf2$100000$EEleqOw1cOzGOkvmhy/cZQ==$bNyLTEip7trKXM+kYpujDoNYjdapsVWKWdAarxKVipg=', 'Sirine', 'Agent', 'INSURER_AGENT', '01JCVMK8R7P2N3X4Y5Z6A7B8BH', 1, datetime('now'), datetime('now'));
