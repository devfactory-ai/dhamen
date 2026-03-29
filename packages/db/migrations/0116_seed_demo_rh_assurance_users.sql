-- Migration: Seed demo RH, Admin Assureur users
-- Password: Password123! (known-good Worker PBKDF2 hash)

-- ============================================
-- RH USERS
-- ============================================

-- RH Principal
INSERT OR REPLACE INTO users (id, email, password_hash, first_name, last_name, role, provider_id, insurer_id, company_id, mfa_enabled, is_active, created_at, updated_at)
VALUES ('01DEMORH00000000000001', 'rh@yopmail.com', '$pbkdf2$100000$EEleqOw1cOzGOkvmhy/cZQ==$bNyLTEip7trKXM+kYpujDoNYjdapsVWKWdAarxKVipg=', 'Sana', 'Meddeb', 'HR', NULL, NULL, NULL, 0, 1, datetime('now'), datetime('now'));

-- RH Test
INSERT OR REPLACE INTO users (id, email, password_hash, first_name, last_name, role, provider_id, insurer_id, company_id, mfa_enabled, is_active, created_at, updated_at)
VALUES ('01DEMORH00000000000002', 'rhTest@yopmail.com', '$pbkdf2$100000$EEleqOw1cOzGOkvmhy/cZQ==$bNyLTEip7trKXM+kYpujDoNYjdapsVWKWdAarxKVipg=', 'Karim', 'Belhadj', 'HR', NULL, NULL, NULL, 0, 1, datetime('now'), datetime('now'));

-- ============================================
-- ADMIN ASSUREUR USERS
-- ============================================

-- Admin Assureur 1 - linked to BH Assurance insurer
INSERT OR REPLACE INTO users (id, email, password_hash, first_name, last_name, role, provider_id, insurer_id, company_id, mfa_enabled, is_active, created_at, updated_at)
VALUES ('01DEMOADMINASS000000001', 'adminassureur@yopmail.com', '$pbkdf2$100000$EEleqOw1cOzGOkvmhy/cZQ==$bNyLTEip7trKXM+kYpujDoNYjdapsVWKWdAarxKVipg=', 'Riadh', 'Ksouri', 'INSURER_ADMIN', NULL, (SELECT id FROM insurers WHERE code = 'BH' LIMIT 1), NULL, 0, 1, datetime('now'), datetime('now'));

-- Admin Assureur 2
INSERT OR REPLACE INTO users (id, email, password_hash, first_name, last_name, role, provider_id, insurer_id, company_id, mfa_enabled, is_active, created_at, updated_at)
VALUES ('01DEMOADMINASS000000002', 'adminassureur2@yopmail.com', '$pbkdf2$100000$EEleqOw1cOzGOkvmhy/cZQ==$bNyLTEip7trKXM+kYpujDoNYjdapsVWKWdAarxKVipg=', 'Olfa', 'Chaabane', 'INSURER_ADMIN', NULL, (SELECT id FROM insurers WHERE code = 'BH' LIMIT 1), NULL, 0, 1, datetime('now'), datetime('now'));
