-- Migration: Seed entreprises (companies) et adherents avec matricules pour env dev
-- Ajoute des matricules aux adherents existants, des ayants-droit (conjoint/enfant),
-- et enrichit les entreprises avec des donnees realistes tunisiennes.

-- ============================================
-- 1. Enrichir les entreprises existantes
-- ============================================

UPDATE companies SET
  address = '13, Rue Hedi Nouira',
  city = 'Tunis',
  phone = '+21671123456',
  email = 'rh@tunisietelecom.tn',
  sector = 'Telecommunications'
WHERE name = 'Tunisie Telecom';

UPDATE companies SET
  address = '70, Avenue Habib Bourguiba',
  city = 'Tunis',
  phone = '+21671456789',
  email = 'rh@biat.com.tn',
  sector = 'Banque'
WHERE name LIKE 'BIAT%';

UPDATE companies SET
  address = 'Zone Industrielle Ben Arous',
  city = 'Ben Arous',
  phone = '+21671789012',
  email = 'rh@poulina.com.tn',
  sector = 'Agroalimentaire'
WHERE name = 'Groupe Poulina';

UPDATE companies SET
  address = 'Route de la Corniche',
  city = 'Sousse',
  phone = '+21673345678',
  email = 'rh@oliviers.com.tn',
  sector = 'Sante'
WHERE name = 'Clinique les Oliviers';

UPDATE companies SET
  address = 'Centre Commercial Manar City',
  city = 'Tunis',
  phone = '+21671901234',
  email = 'rh@carrefour.com.tn',
  sector = 'Distribution'
WHERE name = 'Carrefour Tunisie';

-- ============================================
-- 2. Ajouter des matricules aux adherents existants
-- Format: COMPANY_CODE/ANNEE/NUMERO (ex: TT/2024/001)
-- ============================================

-- Tunisie Telecom adherents
UPDATE adherents SET
  matricule = 'TT/2024/001',
  date_of_birth = '1985-03-15',
  gender = 'M',
  etat_civil = 'marie',
  date_debut_adhesion = '2024-01-01',
  date_fin_adhesion = '2026-12-31',
  plafond_consomme = 0
WHERE first_name = 'Ahmed' AND last_name = 'Bouazizi';

UPDATE adherents SET
  matricule = 'TT/2024/002',
  date_of_birth = '1990-07-22',
  gender = 'F',
  etat_civil = 'celibataire',
  date_debut_adhesion = '2024-01-01',
  date_fin_adhesion = '2026-12-31',
  plafond_consomme = 0
WHERE first_name = 'Leila' AND last_name = 'Hammami';

-- BIAT adherents
UPDATE adherents SET
  matricule = 'BIAT/2024/001',
  date_of_birth = '1978-11-05',
  gender = 'M',
  etat_civil = 'marie',
  date_debut_adhesion = '2024-01-01',
  date_fin_adhesion = '2026-12-31',
  plafond_consomme = 150000
WHERE first_name = 'Karim' AND last_name = 'Jebali';

UPDATE adherents SET
  matricule = 'BIAT/2024/002',
  date_of_birth = '1988-04-18',
  gender = 'F',
  etat_civil = 'mariee',
  date_debut_adhesion = '2024-01-01',
  date_fin_adhesion = '2026-12-31',
  plafond_consomme = 50000
WHERE first_name = 'Sonia' AND last_name = 'Chahed';

UPDATE adherents SET
  matricule = 'BIAT/2024/003',
  date_of_birth = '1982-09-30',
  gender = 'M',
  etat_civil = 'marie',
  date_debut_adhesion = '2024-01-01',
  date_fin_adhesion = '2026-12-31',
  plafond_consomme = 0
WHERE first_name = 'Youssef' AND last_name = 'Mekni';

UPDATE adherents SET
  matricule = 'BIAT/2024/004',
  date_of_birth = '1995-01-12',
  gender = 'F',
  etat_civil = 'celibataire',
  date_debut_adhesion = '2024-01-01',
  date_fin_adhesion = '2026-12-31',
  plafond_consomme = 0
WHERE first_name = 'Amira' AND last_name = 'Saidi';

-- Groupe Poulina adherents
UPDATE adherents SET
  matricule = 'POU/2024/001',
  date_of_birth = '1975-06-08',
  gender = 'M',
  etat_civil = 'marie',
  date_debut_adhesion = '2024-01-01',
  date_fin_adhesion = '2026-12-31',
  plafond_consomme = 200000
WHERE first_name = 'Walid' AND last_name = 'Baccouche';

UPDATE adherents SET
  matricule = 'POU/2024/002',
  date_of_birth = '1992-12-25',
  gender = 'F',
  etat_civil = 'mariee',
  date_debut_adhesion = '2024-01-01',
  date_fin_adhesion = '2026-12-31',
  plafond_consomme = 0
WHERE first_name = 'Salma' AND last_name = 'Essebsi';

-- Clinique les Oliviers adherents
UPDATE adherents SET
  matricule = 'OLI/2024/001',
  date_of_birth = '1980-02-14',
  gender = 'M',
  etat_civil = 'marie',
  date_debut_adhesion = '2024-01-01',
  date_fin_adhesion = '2026-12-31',
  plafond_consomme = 0
WHERE first_name = 'Ridha' AND last_name = 'Belhadj';

UPDATE adherents SET
  matricule = 'OLI/2024/002',
  date_of_birth = '1993-08-03',
  gender = 'F',
  etat_civil = 'celibataire',
  date_debut_adhesion = '2024-01-01',
  date_fin_adhesion = '2026-12-31',
  plafond_consomme = 0
WHERE first_name = 'Ines' AND last_name = 'Marzouki';

UPDATE adherents SET
  matricule = 'OLI/2024/003',
  date_of_birth = '1986-05-20',
  gender = 'M',
  etat_civil = 'marie',
  date_debut_adhesion = '2024-01-01',
  date_fin_adhesion = '2026-12-31',
  plafond_consomme = 0
WHERE first_name = 'Bassem' AND last_name = 'Kallel';

-- ============================================
-- 3. Ajouter des ayants-droit (conjoint + enfants)
-- code_type: C = conjoint, E = enfant
-- parent_adherent_id = reference vers l'assure principal
-- ============================================

-- Conjoint d'Ahmed Bouazizi (Tunisie Telecom)
INSERT OR IGNORE INTO adherents (id, first_name, last_name, date_of_birth, gender, email, matricule, company_id, company_name, code_type, parent_adherent_id, etat_civil, date_debut_adhesion, date_fin_adhesion, plafond_consomme, created_at, updated_at)
VALUES (
  '01ADHT0C01CONJ0BOUAZIZI001',
  'Fatma', 'Bouazizi', '1987-09-10', 'F',
  'fatma.bouazizi@email.tn', 'TT/2024/001-C1',
  '01JCVMKC3AP2N3X4Y5Z6A7B8C9', 'Tunisie Telecom',
  'C', '01JCVMKA1CP2N3X4Y5Z6A7B8E1',
  'mariee', '2024-01-01', '2026-12-31', 0,
  datetime('now'), datetime('now')
);

-- Enfant 1 d'Ahmed Bouazizi
INSERT OR IGNORE INTO adherents (id, first_name, last_name, date_of_birth, gender, email, matricule, company_id, company_name, code_type, parent_adherent_id, etat_civil, date_debut_adhesion, date_fin_adhesion, plafond_consomme, created_at, updated_at)
VALUES (
  '01ADHT0E01ENF1BOUAZIZI0001',
  'Mohamed', 'Bouazizi', '2015-03-20', 'M',
  NULL, 'TT/2024/001-E1',
  '01JCVMKC3AP2N3X4Y5Z6A7B8C9', 'Tunisie Telecom',
  'E', '01JCVMKA1CP2N3X4Y5Z6A7B8E1',
  'celibataire', '2024-01-01', '2026-12-31', 0,
  datetime('now'), datetime('now')
);

-- Enfant 2 d'Ahmed Bouazizi
INSERT OR IGNORE INTO adherents (id, first_name, last_name, date_of_birth, gender, email, matricule, company_id, company_name, code_type, parent_adherent_id, etat_civil, date_debut_adhesion, date_fin_adhesion, plafond_consomme, created_at, updated_at)
VALUES (
  '01ADHT0E02ENF2BOUAZIZI0001',
  'Yasmine', 'Bouazizi', '2018-11-05', 'F',
  NULL, 'TT/2024/001-E2',
  '01JCVMKC3AP2N3X4Y5Z6A7B8C9', 'Tunisie Telecom',
  'E', '01JCVMKA1CP2N3X4Y5Z6A7B8E1',
  'celibataire', '2024-01-01', '2026-12-31', 0,
  datetime('now'), datetime('now')
);

-- Conjoint de Karim Jebali (BIAT)
INSERT OR IGNORE INTO adherents (id, first_name, last_name, date_of_birth, gender, email, matricule, company_id, company_name, code_type, parent_adherent_id, etat_civil, date_debut_adhesion, date_fin_adhesion, plafond_consomme, created_at, updated_at)
VALUES (
  '01ADHT0C02CONJ0JEBALI00001',
  'Nadia', 'Jebali', '1982-04-25', 'F',
  'nadia.jebali@email.tn', 'BIAT/2024/001-C1',
  '01JCVMKC3BP2N3X4Y5Z6A7B8D0', 'BIAT',
  'C', '01JCVMKA1EP2N3X4Y5Z6A7B8G3',
  'mariee', '2024-01-01', '2026-12-31', 0,
  datetime('now'), datetime('now')
);

-- Enfant de Karim Jebali
INSERT OR IGNORE INTO adherents (id, first_name, last_name, date_of_birth, gender, email, matricule, company_id, company_name, code_type, parent_adherent_id, etat_civil, date_debut_adhesion, date_fin_adhesion, plafond_consomme, created_at, updated_at)
VALUES (
  '01ADHT0E03ENF1JEBALI000001',
  'Amine', 'Jebali', '2012-08-15', 'M',
  NULL, 'BIAT/2024/001-E1',
  '01JCVMKC3BP2N3X4Y5Z6A7B8D0', 'BIAT',
  'E', '01JCVMKA1EP2N3X4Y5Z6A7B8G3',
  'celibataire', '2024-01-01', '2026-12-31', 0,
  datetime('now'), datetime('now')
);

-- Conjoint de Walid Baccouche (Groupe Poulina)
INSERT OR IGNORE INTO adherents (id, first_name, last_name, date_of_birth, gender, email, matricule, company_id, company_name, code_type, parent_adherent_id, etat_civil, date_debut_adhesion, date_fin_adhesion, plafond_consomme, created_at, updated_at)
VALUES (
  '01ADHT0C03CONJBACCOUCHE001',
  'Rim', 'Baccouche', '1979-12-01', 'F',
  'rim.baccouche@email.tn', 'POU/2024/001-C1',
  '01JCVMKC3CP2N3X4Y5Z6A7B8E1', 'Groupe Poulina',
  'C', '01JCVMKA1KP2N3X4Y5Z6A7B8M9',
  'mariee', '2024-01-01', '2026-12-31', 0,
  datetime('now'), datetime('now')
);

-- Enfant 1 de Walid Baccouche
INSERT OR IGNORE INTO adherents (id, first_name, last_name, date_of_birth, gender, email, matricule, company_id, company_name, code_type, parent_adherent_id, etat_civil, date_debut_adhesion, date_fin_adhesion, plafond_consomme, created_at, updated_at)
VALUES (
  '01ADHT0E04ENF1BACCOUCHE01',
  'Selim', 'Baccouche', '2010-06-18', 'M',
  NULL, 'POU/2024/001-E1',
  '01JCVMKC3CP2N3X4Y5Z6A7B8E1', 'Groupe Poulina',
  'E', '01JCVMKA1KP2N3X4Y5Z6A7B8M9',
  'celibataire', '2024-01-01', '2026-12-31', 0,
  datetime('now'), datetime('now')
);

-- Enfant 2 de Walid Baccouche
INSERT OR IGNORE INTO adherents (id, first_name, last_name, date_of_birth, gender, email, matricule, company_id, company_name, code_type, parent_adherent_id, etat_civil, date_debut_adhesion, date_fin_adhesion, plafond_consomme, created_at, updated_at)
VALUES (
  '01ADHT0E05ENF2BACCOUCHE01',
  'Lina', 'Baccouche', '2014-02-28', 'F',
  NULL, 'POU/2024/001-E2',
  '01JCVMKC3CP2N3X4Y5Z6A7B8E1', 'Groupe Poulina',
  'E', '01JCVMKA1KP2N3X4Y5Z6A7B8M9',
  'celibataire', '2024-01-01', '2026-12-31', 0,
  datetime('now'), datetime('now')
);

-- Conjoint de Ridha Belhadj (Clinique les Oliviers)
INSERT OR IGNORE INTO adherents (id, first_name, last_name, date_of_birth, gender, email, matricule, company_id, company_name, code_type, parent_adherent_id, etat_civil, date_debut_adhesion, date_fin_adhesion, plafond_consomme, created_at, updated_at)
VALUES (
  '01ADHT0C04CONJ0BELHADJ0001',
  'Samia', 'Belhadj', '1983-10-08', 'F',
  'samia.belhadj@email.tn', 'OLI/2024/001-C1',
  '01JCVMKC3DP2N3X4Y5Z6A7B8F2', 'Clinique les Oliviers',
  'C', '01JCVMKA1MP2N3X4Y5Z6A7B8O1',
  'mariee', '2024-01-01', '2026-12-31', 0,
  datetime('now'), datetime('now')
);
