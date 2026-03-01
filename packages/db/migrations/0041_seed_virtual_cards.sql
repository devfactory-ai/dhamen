-- Migration: Seed virtual cards for demo adherents
-- This creates virtual cards for ALL adherent demo accounts

-- Insert virtual cards for all 20 demo adherents
INSERT INTO virtual_cards (id, adherent_id, card_number, qr_code_token, qr_code_secret, status, expires_at, created_at, updated_at)
VALUES
  -- Mohamed Ben Salah
  ('01JCVMKD1AP2N3X4Y5Z6A7B8VC', '01JCVMKA1AP2N3X4Y5Z6A7B8C9', 'DHM-2024-0001', 'QRT_BENSALAH_001', 'QRS_SEC_BENSALAH_001', 'active', '2027-12-31', datetime('now'), datetime('now')),
  -- Fatma Trabelsi
  ('01JCVMKD2BP2N3X4Y5Z6A7B8VD', '01JCVMKA1BP2N3X4Y5Z6A7B8D0', 'DHM-2024-0002', 'QRT_TRABELSI_002', 'QRS_SEC_TRABELSI_002', 'active', '2027-12-31', datetime('now'), datetime('now')),
  -- Ahmed Bouazizi
  ('01JCVMKD3CP2N3X4Y5Z6A7B8VE', '01JCVMKA1CP2N3X4Y5Z6A7B8E1', 'DHM-2024-0003', 'QRT_BOUAZIZI_003', 'QRS_SEC_BOUAZIZI_003', 'active', '2027-12-31', datetime('now'), datetime('now')),
  -- Leila Hammami
  ('01JCVMKD4DP2N3X4Y5Z6A7B8VF', '01JCVMKA1DP2N3X4Y5Z6A7B8F2', 'DHM-2024-0004', 'QRT_HAMMAMI_004', 'QRS_SEC_HAMMAMI_004', 'active', '2027-12-31', datetime('now'), datetime('now')),
  -- Karim Jebali
  ('01JCVMKD5EP2N3X4Y5Z6A7B8VG', '01JCVMKA1EP2N3X4Y5Z6A7B8G3', 'DHM-2024-0005', 'QRT_JEBALI_005', 'QRS_SEC_JEBALI_005', 'active', '2027-12-31', datetime('now'), datetime('now')),
  -- Sonia Chahed
  ('01JCVMKD6FP2N3X4Y5Z6A7B8VH', '01JCVMKA1FP2N3X4Y5Z6A7B8H4', 'DHM-2024-0006', 'QRT_CHAHED_006', 'QRS_SEC_CHAHED_006', 'active', '2027-12-31', datetime('now'), datetime('now')),
  -- Youssef Mekni
  ('01JCVMKD7GP2N3X4Y5Z6A7B8VI', '01JCVMKA1GP2N3X4Y5Z6A7B8I5', 'DHM-2024-0007', 'QRT_MEKNI_007', 'QRS_SEC_MEKNI_007', 'active', '2027-12-31', datetime('now'), datetime('now')),
  -- Amira Saidi
  ('01JCVMKD8HP2N3X4Y5Z6A7B8VJ', '01JCVMKA1HP2N3X4Y5Z6A7B8J6', 'DHM-2024-0008', 'QRT_SAIDI_008', 'QRS_SEC_SAIDI_008', 'active', '2027-12-31', datetime('now'), datetime('now')),
  -- Hichem Ferchichi
  ('01JCVMKD9IP2N3X4Y5Z6A7B8VK', '01JCVMKA1IP2N3X4Y5Z6A7B8K7', 'DHM-2024-0009', 'QRT_FERCHICHI_009', 'QRS_SEC_FERCHICHI_009', 'active', '2027-12-31', datetime('now'), datetime('now')),
  -- Nadia Ghannouchi
  ('01JCVMKDAJP2N3X4Y5Z6A7B8VL', '01JCVMKA1JP2N3X4Y5Z6A7B8L8', 'DHM-2024-0010', 'QRT_GHANNOUCHI_010', 'QRS_SEC_GHANNOUCHI_010', 'active', '2027-12-31', datetime('now'), datetime('now')),
  -- Walid Baccouche
  ('01JCVMKDBKP2N3X4Y5Z6A7B8VM', '01JCVMKA1KP2N3X4Y5Z6A7B8M9', 'DHM-2024-0011', 'QRT_BACCOUCHE_011', 'QRS_SEC_BACCOUCHE_011', 'active', '2027-12-31', datetime('now'), datetime('now')),
  -- Salma Essebsi
  ('01JCVMKDCLP2N3X4Y5Z6A7B8VN', '01JCVMKA1LP2N3X4Y5Z6A7B8N0', 'DHM-2024-0012', 'QRT_ESSEBSI_012', 'QRS_SEC_ESSEBSI_012', 'active', '2027-12-31', datetime('now'), datetime('now')),
  -- Ridha Belhadj
  ('01JCVMKDDMP2N3X4Y5Z6A7B8VO', '01JCVMKA1MP2N3X4Y5Z6A7B8O1', 'DHM-2024-0013', 'QRT_BELHADJ_013', 'QRS_SEC_BELHADJ_013', 'active', '2027-12-31', datetime('now'), datetime('now')),
  -- Ines Marzouki
  ('01JCVMKDENP2N3X4Y5Z6A7B8VP', '01JCVMKA1NP2N3X4Y5Z6A7B8P2', 'DHM-2024-0014', 'QRT_MARZOUKI_014', 'QRS_SEC_MARZOUKI_014', 'active', '2027-12-31', datetime('now'), datetime('now')),
  -- Bassem Kallel
  ('01JCVMKDFOP2N3X4Y5Z6A7B8VQ', '01JCVMKA1OP2N3X4Y5Z6A7B8Q3', 'DHM-2024-0015', 'QRT_KALLEL_015', 'QRS_SEC_KALLEL_015', 'active', '2027-12-31', datetime('now'), datetime('now')),
  -- Hela Sfar
  ('01JCVMKDGPP2N3X4Y5Z6A7B8VR', '01JCVMKA1PP2N3X4Y5Z6A7B8R4', 'DHM-2024-0016', 'QRT_SFAR_016', 'QRS_SEC_SFAR_016', 'active', '2027-12-31', datetime('now'), datetime('now')),
  -- Amine Kchaou
  ('01JCVMKDHQP2N3X4Y5Z6A7B8VS', '01JCVMKA1QP2N3X4Y5Z6A7B8S5', 'DHM-2024-0017', 'QRT_KCHAOU_017', 'QRS_SEC_KCHAOU_017', 'active', '2027-12-31', datetime('now'), datetime('now')),
  -- Rim Mahjoub
  ('01JCVMKDIRP2N3X4Y5Z6A7B8VT', '01JCVMKA1RP2N3X4Y5Z6A7B8T6', 'DHM-2024-0018', 'QRT_MAHJOUB_018', 'QRS_SEC_MAHJOUB_018', 'active', '2027-12-31', datetime('now'), datetime('now')),
  -- Fares Zouari
  ('01JCVMKDJSP2N3X4Y5Z6A7B8VU', '01JCVMKA1SP2N3X4Y5Z6A7B8U7', 'DHM-2024-0019', 'QRT_ZOUARI_019', 'QRS_SEC_ZOUARI_019', 'active', '2027-12-31', datetime('now'), datetime('now')),
  -- Maha Nemri
  ('01JCVMKDKTP2N3X4Y5Z6A7B8VV', '01JCVMKA1TP2N3X4Y5Z6A7B8V8', 'DHM-2024-0020', 'QRT_NEMRI_020', 'QRS_SEC_NEMRI_020', 'active', '2027-12-31', datetime('now'), datetime('now'))
ON CONFLICT(id) DO NOTHING;
