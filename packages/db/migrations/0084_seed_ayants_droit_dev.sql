-- Migration: Seed ayants-droit (conjoints et enfants) pour env dev
-- Corrige 0083 qui manquait le champ national_id_encrypted (NOT NULL)

-- ============================================
-- Famille Ahmed Bouazizi (Tunisie Telecom)
-- ============================================

-- Conjoint
INSERT OR IGNORE INTO adherents (id, national_id_encrypted, first_name, last_name, date_of_birth, gender, email, matricule, company_id, company_name, code_type, parent_adherent_id, etat_civil, date_debut_adhesion, date_fin_adhesion, plafond_consomme, created_at, updated_at)
VALUES (
  '01ADHT0C01CONJ0BOUAZIZI001',
  'enc_09876543_fatma_bouazizi',
  'Fatma', 'Bouazizi', '1987-09-10', 'F',
  'fatma.bouazizi@email.tn', 'TT/2024/001-C1',
  '01JCVMKC3AP2N3X4Y5Z6A7B8C9', 'Tunisie Telecom',
  'C', '01JCVMKA1CP2N3X4Y5Z6A7B8E1',
  'mariee', '2024-01-01', '2026-12-31', 0,
  datetime('now'), datetime('now')
);

-- Enfant 1
INSERT OR IGNORE INTO adherents (id, national_id_encrypted, first_name, last_name, date_of_birth, gender, email, matricule, company_id, company_name, code_type, parent_adherent_id, etat_civil, date_debut_adhesion, date_fin_adhesion, plafond_consomme, created_at, updated_at)
VALUES (
  '01ADHT0E01ENF1BOUAZIZI0001',
  'enc_09876544_mohamed_bouazizi',
  'Mohamed', 'Bouazizi', '2015-03-20', 'M',
  NULL, 'TT/2024/001-E1',
  '01JCVMKC3AP2N3X4Y5Z6A7B8C9', 'Tunisie Telecom',
  'E', '01JCVMKA1CP2N3X4Y5Z6A7B8E1',
  'celibataire', '2024-01-01', '2026-12-31', 0,
  datetime('now'), datetime('now')
);

-- Enfant 2
INSERT OR IGNORE INTO adherents (id, national_id_encrypted, first_name, last_name, date_of_birth, gender, email, matricule, company_id, company_name, code_type, parent_adherent_id, etat_civil, date_debut_adhesion, date_fin_adhesion, plafond_consomme, created_at, updated_at)
VALUES (
  '01ADHT0E02ENF2BOUAZIZI0001',
  'enc_09876545_yasmine_bouazizi',
  'Yasmine', 'Bouazizi', '2018-11-05', 'F',
  NULL, 'TT/2024/001-E2',
  '01JCVMKC3AP2N3X4Y5Z6A7B8C9', 'Tunisie Telecom',
  'E', '01JCVMKA1CP2N3X4Y5Z6A7B8E1',
  'celibataire', '2024-01-01', '2026-12-31', 0,
  datetime('now'), datetime('now')
);

-- ============================================
-- Famille Karim Jebali (BIAT)
-- ============================================

-- Conjoint
INSERT OR IGNORE INTO adherents (id, national_id_encrypted, first_name, last_name, date_of_birth, gender, email, matricule, company_id, company_name, code_type, parent_adherent_id, etat_civil, date_debut_adhesion, date_fin_adhesion, plafond_consomme, created_at, updated_at)
VALUES (
  '01ADHT0C02CONJ0JEBALI00001',
  'enc_08765432_nadia_jebali',
  'Nadia', 'Jebali', '1982-04-25', 'F',
  'nadia.jebali@email.tn', 'BIAT/2024/001-C1',
  '01JCVMKC3BP2N3X4Y5Z6A7B8D0', 'BIAT',
  'C', '01JCVMKA1EP2N3X4Y5Z6A7B8G3',
  'mariee', '2024-01-01', '2026-12-31', 0,
  datetime('now'), datetime('now')
);

-- Enfant
INSERT OR IGNORE INTO adherents (id, national_id_encrypted, first_name, last_name, date_of_birth, gender, email, matricule, company_id, company_name, code_type, parent_adherent_id, etat_civil, date_debut_adhesion, date_fin_adhesion, plafond_consomme, created_at, updated_at)
VALUES (
  '01ADHT0E03ENF1JEBALI000001',
  'enc_08765433_amine_jebali',
  'Amine', 'Jebali', '2012-08-15', 'M',
  NULL, 'BIAT/2024/001-E1',
  '01JCVMKC3BP2N3X4Y5Z6A7B8D0', 'BIAT',
  'E', '01JCVMKA1EP2N3X4Y5Z6A7B8G3',
  'celibataire', '2024-01-01', '2026-12-31', 0,
  datetime('now'), datetime('now')
);

-- ============================================
-- Famille Walid Baccouche (Groupe Poulina)
-- ============================================

-- Conjoint
INSERT OR IGNORE INTO adherents (id, national_id_encrypted, first_name, last_name, date_of_birth, gender, email, matricule, company_id, company_name, code_type, parent_adherent_id, etat_civil, date_debut_adhesion, date_fin_adhesion, plafond_consomme, created_at, updated_at)
VALUES (
  '01ADHT0C03CONJBACCOUCHE001',
  'enc_07654321_rim_baccouche',
  'Rim', 'Baccouche', '1979-12-01', 'F',
  'rim.baccouche@email.tn', 'POU/2024/001-C1',
  '01JCVMKC3CP2N3X4Y5Z6A7B8E1', 'Groupe Poulina',
  'C', '01JCVMKA1KP2N3X4Y5Z6A7B8M9',
  'mariee', '2024-01-01', '2026-12-31', 0,
  datetime('now'), datetime('now')
);

-- Enfant 1
INSERT OR IGNORE INTO adherents (id, national_id_encrypted, first_name, last_name, date_of_birth, gender, email, matricule, company_id, company_name, code_type, parent_adherent_id, etat_civil, date_debut_adhesion, date_fin_adhesion, plafond_consomme, created_at, updated_at)
VALUES (
  '01ADHT0E04ENF1BACCOUCHE01',
  'enc_07654322_selim_baccouche',
  'Selim', 'Baccouche', '2010-06-18', 'M',
  NULL, 'POU/2024/001-E1',
  '01JCVMKC3CP2N3X4Y5Z6A7B8E1', 'Groupe Poulina',
  'E', '01JCVMKA1KP2N3X4Y5Z6A7B8M9',
  'celibataire', '2024-01-01', '2026-12-31', 0,
  datetime('now'), datetime('now')
);

-- Enfant 2
INSERT OR IGNORE INTO adherents (id, national_id_encrypted, first_name, last_name, date_of_birth, gender, email, matricule, company_id, company_name, code_type, parent_adherent_id, etat_civil, date_debut_adhesion, date_fin_adhesion, plafond_consomme, created_at, updated_at)
VALUES (
  '01ADHT0E05ENF2BACCOUCHE01',
  'enc_07654323_lina_baccouche',
  'Lina', 'Baccouche', '2014-02-28', 'F',
  NULL, 'POU/2024/001-E2',
  '01JCVMKC3CP2N3X4Y5Z6A7B8E1', 'Groupe Poulina',
  'E', '01JCVMKA1KP2N3X4Y5Z6A7B8M9',
  'celibataire', '2024-01-01', '2026-12-31', 0,
  datetime('now'), datetime('now')
);

-- ============================================
-- Famille Ridha Belhadj (Clinique les Oliviers)
-- ============================================

-- Conjoint
INSERT OR IGNORE INTO adherents (id, national_id_encrypted, first_name, last_name, date_of_birth, gender, email, matricule, company_id, company_name, code_type, parent_adherent_id, etat_civil, date_debut_adhesion, date_fin_adhesion, plafond_consomme, created_at, updated_at)
VALUES (
  '01ADHT0C04CONJ0BELHADJ0001',
  'enc_06543210_samia_belhadj',
  'Samia', 'Belhadj', '1983-10-08', 'F',
  'samia.belhadj@email.tn', 'OLI/2024/001-C1',
  '01JCVMKC3DP2N3X4Y5Z6A7B8F2', 'Clinique les Oliviers',
  'C', '01JCVMKA1MP2N3X4Y5Z6A7B8O1',
  'mariee', '2024-01-01', '2026-12-31', 0,
  datetime('now'), datetime('now')
);

-- Enfant
INSERT OR IGNORE INTO adherents (id, national_id_encrypted, first_name, last_name, date_of_birth, gender, email, matricule, company_id, company_name, code_type, parent_adherent_id, etat_civil, date_debut_adhesion, date_fin_adhesion, plafond_consomme, created_at, updated_at)
VALUES (
  '01ADHT0E06ENF1BELHADJ00001',
  'enc_06543211_rayan_belhadj',
  'Rayan', 'Belhadj', '2016-07-22', 'M',
  NULL, 'OLI/2024/001-E1',
  '01JCVMKC3DP2N3X4Y5Z6A7B8F2', 'Clinique les Oliviers',
  'E', '01JCVMKA1MP2N3X4Y5Z6A7B8O1',
  'celibataire', '2024-01-01', '2026-12-31', 0,
  datetime('now'), datetime('now')
);
