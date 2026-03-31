-- Migration: Fix RH user company associations
-- Description: Associate demo RH users (Sana, Karim) with existing companies
--              and ensure test data exists for validation

-- ============================================
-- FIX: Associate demo RH users with companies
-- ============================================

-- Associate Sana Meddeb (rh@yopmail.com) with Tunisie Telecom
UPDATE users SET company_id = '01JCVMKC3AP2N3X4Y5Z6A7B8C9'
WHERE id = '01DEMORH00000000000001' AND company_id IS NULL;

-- Associate Karim Belhadj (rhTest@yopmail.com) with BIAT
UPDATE users SET company_id = '01JCVMKC3BP2N3X4Y5Z6A7B8D0'
WHERE id = '01DEMORH00000000000002' AND company_id IS NULL;

-- ============================================
-- SEED: Test adherents for BIAT (Karim's company)
-- ============================================

INSERT OR IGNORE INTO adherents (id, first_name, last_name, email, phone_encrypted, national_id_encrypted, date_of_birth, gender, city, company_id, company_name, is_active, created_at, updated_at)
VALUES
  ('01TESTRHADH000000000001', 'Ahmed', 'Ben Salem', 'ahmed.bensalem@biat.com.tn', '+21698100001', '00000001', '1985-03-15', 'M', 'Tunis', '01JCVMKC3BP2N3X4Y5Z6A7B8D0', 'BIAT', 1, datetime('now'), datetime('now')),
  ('01TESTRHADH000000000002', 'Fatma', 'Gharbi', 'fatma.gharbi@biat.com.tn', '+21698100002', '00000002', '1990-07-22', 'F', 'Tunis', '01JCVMKC3BP2N3X4Y5Z6A7B8D0', 'BIAT', 1, datetime('now'), datetime('now')),
  ('01TESTRHADH000000000003', 'Mohamed', 'Trabelsi', 'mohamed.trabelsi@biat.com.tn', '+21698100003', '00000003', '1988-11-05', 'M', 'Ariana', '01JCVMKC3BP2N3X4Y5Z6A7B8D0', 'BIAT', 1, datetime('now'), datetime('now'));
