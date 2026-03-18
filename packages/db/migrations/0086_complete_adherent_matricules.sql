-- Migration: Completer les matricules manquants pour les adherents existants
-- 9 adherents principaux n'avaient pas de matricule apres migration 0083

-- Tunisie Telecom
UPDATE adherents SET
  matricule = 'TT/2024/003',
  date_of_birth = '1991-01-28',
  gender = 'M',
  etat_civil = 'celibataire',
  date_debut_adhesion = '2024-01-01',
  date_fin_adhesion = '2026-12-31',
  plafond_consomme = 0
WHERE id = '01JCVMKA1AP2N3X4Y5Z6A7B8C9';
-- Mohamed Ben Salah

UPDATE adherents SET
  matricule = 'TT/2024/004',
  date_of_birth = '1989-06-14',
  gender = 'F',
  etat_civil = 'celibataire',
  date_debut_adhesion = '2024-01-01',
  date_fin_adhesion = '2026-12-31',
  plafond_consomme = 0
WHERE id = '01JCVMKA1BP2N3X4Y5Z6A7B8D0';
-- Fatma Trabelsi

-- Groupe Poulina
UPDATE adherents SET
  matricule = 'POU/2024/003',
  date_of_birth = '1984-03-11',
  gender = 'M',
  etat_civil = 'celibataire',
  date_debut_adhesion = '2024-01-01',
  date_fin_adhesion = '2026-12-31',
  plafond_consomme = 0
WHERE id = '01JCVMKA1IP2N3X4Y5Z6A7B8K7';
-- Hichem Ferchichi

UPDATE adherents SET
  matricule = 'POU/2024/004',
  date_of_birth = '1990-09-22',
  gender = 'F',
  etat_civil = 'mariee',
  date_debut_adhesion = '2024-01-01',
  date_fin_adhesion = '2026-12-31',
  plafond_consomme = 0
WHERE id = '01JCVMKA1JP2N3X4Y5Z6A7B8L8';
-- Nadia Ghannouchi

-- Clinique les Oliviers
UPDATE adherents SET
  matricule = 'OLI/2024/004',
  date_of_birth = '1994-11-30',
  gender = 'F',
  etat_civil = 'celibataire',
  date_debut_adhesion = '2024-01-01',
  date_fin_adhesion = '2026-12-31',
  plafond_consomme = 0
WHERE id = '01JCVMKA1PP2N3X4Y5Z6A7B8R4';
-- Hela Sfar

-- Carrefour Tunisie
UPDATE adherents SET
  matricule = 'CAR/2024/001',
  date_of_birth = '1987-07-05',
  gender = 'M',
  etat_civil = 'marie',
  date_debut_adhesion = '2024-01-01',
  date_fin_adhesion = '2026-12-31',
  plafond_consomme = 0
WHERE id = '01JCVMKA1QP2N3X4Y5Z6A7B8S5';
-- Amine Kchaou

UPDATE adherents SET
  matricule = 'CAR/2024/002',
  date_of_birth = '1985-04-18',
  gender = 'F',
  etat_civil = 'mariee',
  date_debut_adhesion = '2024-01-01',
  date_fin_adhesion = '2026-12-31',
  plafond_consomme = 0
WHERE id = '01JCVMKA1RP2N3X4Y5Z6A7B8T6';
-- Rim Mahjoub

UPDATE adherents SET
  matricule = 'CAR/2024/003',
  date_of_birth = '1993-02-10',
  gender = 'M',
  etat_civil = 'celibataire',
  date_debut_adhesion = '2024-01-01',
  date_fin_adhesion = '2026-12-31',
  plafond_consomme = 0
WHERE id = '01JCVMKA1SP2N3X4Y5Z6A7B8U7';
-- Fares Zouari

UPDATE adherents SET
  matricule = 'CAR/2024/004',
  date_of_birth = '1996-08-25',
  gender = 'F',
  etat_civil = 'celibataire',
  date_debut_adhesion = '2024-01-01',
  date_fin_adhesion = '2026-12-31',
  plafond_consomme = 0
WHERE id = '01JCVMKA1TP2N3X4Y5Z6A7B8V8';
-- Maha Nemri
