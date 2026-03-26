-- Migration: Seed demo prestataire users for BH Assurance
-- 4 provider demo accounts linked to existing providers
-- Password: Password123! (known-good Worker PBKDF2 hash)

-- Pharmacien - linked to Pharmacie Centrale Tunis
INSERT OR REPLACE INTO users (id, email, password_hash, first_name, last_name, role, provider_id, insurer_id, mfa_enabled, is_active, created_at, updated_at)
VALUES ('01DEMOPHARMA000000000001', 'pharmacien@yopmail.com', '$pbkdf2$100000$EEleqOw1cOzGOkvmhy/cZQ==$bNyLTEip7trKXM+kYpujDoNYjdapsVWKWdAarxKVipg=', 'Nabil', 'Hamdouni', 'PHARMACIST', '01JCVMK9A1P2N3X4Y5Z6A7B8C9', NULL, 0, 1, datetime('now'), datetime('now'));

-- Medecin - linked to Cabinet Dr. Ben Ali
INSERT OR REPLACE INTO users (id, email, password_hash, first_name, last_name, role, provider_id, insurer_id, mfa_enabled, is_active, created_at, updated_at)
VALUES ('01DEMOMEDECIN00000000001', 'medecin@yopmail.com', '$pbkdf2$100000$EEleqOw1cOzGOkvmhy/cZQ==$bNyLTEip7trKXM+kYpujDoNYjdapsVWKWdAarxKVipg=', 'Mehdi', 'Ben Ali', 'DOCTOR', '01JCVMK9B1P2N3X4Y5Z6A7B8C9', NULL, 0, 1, datetime('now'), datetime('now'));

-- Laborantin - linked to Laboratoire Central d'Analyses
INSERT OR REPLACE INTO users (id, email, password_hash, first_name, last_name, role, provider_id, insurer_id, mfa_enabled, is_active, created_at, updated_at)
VALUES ('01DEMOLABO0000000000001', 'labo@yopmail.com', '$pbkdf2$100000$EEleqOw1cOzGOkvmhy/cZQ==$bNyLTEip7trKXM+kYpujDoNYjdapsVWKWdAarxKVipg=', 'Lamia', 'Jomaa', 'LAB_MANAGER', '01JCVMK9C1P2N3X4Y5Z6A7B8C9', NULL, 0, 1, datetime('now'), datetime('now'));

-- Clinique - linked to Clinique Les Oliviers
INSERT OR REPLACE INTO users (id, email, password_hash, first_name, last_name, role, provider_id, insurer_id, mfa_enabled, is_active, created_at, updated_at)
VALUES ('01DEMOCLINIQUE000000001', 'clinique@yopmail.com', '$pbkdf2$100000$EEleqOw1cOzGOkvmhy/cZQ==$bNyLTEip7trKXM+kYpujDoNYjdapsVWKWdAarxKVipg=', 'Hajer', 'Slim', 'CLINIC_ADMIN', '01JCVMK9D1P2N3X4Y5Z6A7B8C9', NULL, 0, 1, datetime('now'), datetime('now'));
