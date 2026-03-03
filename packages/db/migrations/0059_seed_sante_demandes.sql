-- 0059_seed_sante_demandes.sql
-- Seed ~30 sante_demandes records for demo purposes
-- Covers Jan-Mar 2026 with a mix of statuses, type_soin, and realistic Tunisian amounts (millimes)

--------------------------------------------------------------------------------
-- 1. soumise (newly submitted, not yet examined)
--------------------------------------------------------------------------------

INSERT INTO sante_demandes (
  id, numero_demande, adherent_id, praticien_id, formule_id, source, type_soin,
  statut, montant_demande, date_soin, score_fraude, created_at, updated_at
) VALUES
-- DEM-001: Mohamed Ben Salah — pharmacy purchase
('01JSD0A001DEM0PHARMA0001', 'DEM-2026-00001',
 '01JCVMKA1AP2N3X4Y5Z6A7B8C9', 'prat_03HWPHHAMDI', 'form_01HWESSENTIEL',
 'adherent', 'pharmacie', 'soumise',
 35000, '2026-03-01', 8,
 '2026-03-01 09:15:00', '2026-03-01 09:15:00'),

-- DEM-002: Fatma Trabelsi — dental care
('01JSD0A002DEM0DENTAIRE01', 'DEM-2026-00002',
 '01JCVMKA1BP2N3X4Y5Z6A7B8D0', 'prat_04HWDTBOUAZIZ', 'form_02HWCONFORT',
 'adherent', 'dentaire', 'soumise',
 120000, '2026-03-02', 12,
 '2026-03-02 10:30:00', '2026-03-02 10:30:00'),

-- DEM-003: Ahmed Bouazizi — lab tests
('01JSD0A003DEM0LABORAT001', 'DEM-2026-00003',
 '01JCVMKA1CP2N3X4Y5Z6A7B8E1', 'prat_06HWLBTOUNSI', 'form_03HWPREMIUM',
 'adherent', 'laboratoire', 'soumise',
 85000, '2026-03-03', NULL,
 '2026-03-03 08:00:00', '2026-03-03 08:00:00'),

-- DEM-004: Leila Hammami — optical
('01JSD0A004DEM0OPTIQUE001', 'DEM-2026-00004',
 '01JCVMKA1DP2N3X4Y5Z6A7B8F2', 'prat_05HWOPKHELIL', 'form_02HWCONFORT',
 'adherent', 'optique', 'soumise',
 250000, '2026-02-28', 15,
 '2026-02-28 14:20:00', '2026-02-28 14:20:00');

--------------------------------------------------------------------------------
-- 2. en_examen (under review by agent)
--------------------------------------------------------------------------------

INSERT INTO sante_demandes (
  id, numero_demande, adherent_id, praticien_id, formule_id, source, type_soin,
  statut, montant_demande, date_soin, traite_par, score_fraude,
  created_at, updated_at
) VALUES
-- DEM-005: Karim Jebali — consultation
('01JSD0B005DEM0CONSULT001', 'DEM-2026-00005',
 '01JCVMKA1EP2N3X4Y5Z6A7B8G3', 'prat_01HWDRMEJRI', 'form_01HWESSENTIEL',
 'praticien', 'consultation', 'en_examen',
 45000, '2026-02-25', '01JCVMKD1AP2N3X4Y5Z6A7B8A1', 22,
 '2026-02-25 11:00:00', '2026-02-26 09:00:00'),

-- DEM-006: Sonia Chahed — hospitalisation
('01JSD0B006DEM0HOSPIT0001', 'DEM-2026-00006',
 '01JCVMKA1FP2N3X4Y5Z6A7B8H4', 'prat_01HWDRMEJRI', 'form_03HWPREMIUM',
 'praticien', 'hospitalisation', 'en_examen',
 1500000, '2026-02-20', '01JCVMKD1BP2N3X4Y5Z6A7B8B2', 35,
 '2026-02-20 16:45:00', '2026-02-22 10:00:00'),

-- DEM-007: Youssef Mekni — pharmacy (tiers payant)
('01JSD0B007DEM0PHARMA0002', 'DEM-2026-00007',
 '01JCVMKA1GP2N3X4Y5Z6A7B8I5', 'prat_03HWPHHAMDI', 'form_02HWCONFORT',
 'praticien', 'pharmacie', 'en_examen',
 72000, '2026-02-27', '01JCVMKD1AP2N3X4Y5Z6A7B8A1', 5,
 '2026-02-27 08:30:00', '2026-02-28 09:15:00'),

-- DEM-008: Amira Saidi — kinesitherapie
('01JSD0B008DEM0CONSULT002', 'DEM-2026-00008',
 '01JCVMKA1HP2N3X4Y5Z6A7B8J6', 'prat_02HWDRBENALI', 'form_01HWESSENTIEL',
 'adherent', 'consultation', 'en_examen',
 60000, '2026-02-24', '01JCVMKD1CP2N3X4Y5Z6A7B8C3', 18,
 '2026-02-24 13:00:00', '2026-02-25 11:30:00');

--------------------------------------------------------------------------------
-- 3. info_requise (additional information requested)
--------------------------------------------------------------------------------

INSERT INTO sante_demandes (
  id, numero_demande, adherent_id, praticien_id, formule_id, source, type_soin,
  statut, montant_demande, date_soin, traite_par, notes_internes, score_fraude,
  created_at, updated_at
) VALUES
-- DEM-009: Hichem Ferchichi — hospitalisation (docs missing)
('01JSD0C009DEM0HOSPIT0002', 'DEM-2026-00009',
 '01JCVMKA1IP2N3X4Y5Z6A7B8K7', 'prat_01HWDRMEJRI', 'form_03HWPREMIUM',
 'adherent', 'hospitalisation', 'info_requise',
 2200000, '2026-02-15', '01JCVMKD1BP2N3X4Y5Z6A7B8B2',
 'Rapport opératoire manquant. Relance envoyée le 18/02.', 42,
 '2026-02-15 07:30:00', '2026-02-18 14:00:00'),

-- DEM-010: Nadia Ghannouchi — optical (prescription needed)
('01JSD0C010DEM0OPTIQUE002', 'DEM-2026-00010',
 '01JCVMKA1JP2N3X4Y5Z6A7B8L8', 'prat_05HWOPKHELIL', 'form_02HWCONFORT',
 'adherent', 'optique', 'info_requise',
 180000, '2026-02-10', '01JCVMKD1AP2N3X4Y5Z6A7B8A1',
 'Ordonnance ophtalmologue requise pour verres progressifs.', 10,
 '2026-02-10 15:00:00', '2026-02-12 09:00:00'),

-- DEM-011: Mohamed Ben Salah — dentaire (radio needed)
('01JSD0C011DEM0DENTAIRE02', 'DEM-2026-00011',
 '01JCVMKA1AP2N3X4Y5Z6A7B8C9', 'prat_04HWDTBOUAZIZ', 'form_01HWESSENTIEL',
 'adherent', 'dentaire', 'info_requise',
 300000, '2026-01-28', '01JCVMKD1CP2N3X4Y5Z6A7B8C3',
 'Radio panoramique requise avant approbation prothèse dentaire.', 20,
 '2026-01-28 10:00:00', '2026-01-30 11:00:00');

--------------------------------------------------------------------------------
-- 4. approuvee (approved, pending payment)
--------------------------------------------------------------------------------

INSERT INTO sante_demandes (
  id, numero_demande, adherent_id, praticien_id, formule_id, source, type_soin,
  statut, montant_demande, montant_rembourse, montant_reste_charge, date_soin,
  traite_par, date_traitement, score_fraude, created_at, updated_at
) VALUES
-- DEM-012: Fatma Trabelsi — consultation
('01JSD0D012DEM0CONSULT003', 'DEM-2026-00012',
 '01JCVMKA1BP2N3X4Y5Z6A7B8D0', 'prat_01HWDRMEJRI', 'form_02HWCONFORT',
 'praticien', 'consultation', 'approuvee',
 50000, 40000, 10000, '2026-02-18',
 '01JCVMKD1AP2N3X4Y5Z6A7B8A1', '2026-02-20 10:00:00', 3,
 '2026-02-18 09:00:00', '2026-02-20 10:00:00'),

-- DEM-013: Ahmed Bouazizi — pharmacie
('01JSD0D013DEM0PHARMA0003', 'DEM-2026-00013',
 '01JCVMKA1CP2N3X4Y5Z6A7B8E1', 'prat_03HWPHHAMDI', 'form_03HWPREMIUM',
 'praticien', 'pharmacie', 'approuvee',
 28000, 25200, 2800, '2026-02-12',
 '01JCVMKD1AP2N3X4Y5Z6A7B8A1', '2026-02-14 14:30:00', 2,
 '2026-02-12 17:00:00', '2026-02-14 14:30:00'),

-- DEM-014: Leila Hammami — laboratoire
('01JSD0D014DEM0LABORAT002', 'DEM-2026-00014',
 '01JCVMKA1DP2N3X4Y5Z6A7B8F2', 'prat_06HWLBTOUNSI', 'form_02HWCONFORT',
 'adherent', 'laboratoire', 'approuvee',
 95000, 71250, 23750, '2026-02-05',
 '01JCVMKD1BP2N3X4Y5Z6A7B8B2', '2026-02-07 11:00:00', 7,
 '2026-02-05 08:15:00', '2026-02-07 11:00:00'),

-- DEM-015: Karim Jebali — hospitalisation (major)
('01JSD0D015DEM0HOSPIT0003', 'DEM-2026-00015',
 '01JCVMKA1EP2N3X4Y5Z6A7B8G3', 'prat_01HWDRMEJRI', 'form_03HWPREMIUM',
 'praticien', 'hospitalisation', 'approuvee',
 3500000, 3150000, 350000, '2026-01-20',
 '01JCVMKD1BP2N3X4Y5Z6A7B8B2', '2026-01-25 16:00:00', 15,
 '2026-01-20 06:00:00', '2026-01-25 16:00:00'),

-- DEM-016: Sonia Chahed — pharmacie
('01JSD0D016DEM0PHARMA0004', 'DEM-2026-00016',
 '01JCVMKA1FP2N3X4Y5Z6A7B8H4', 'prat_03HWPHHAMDI', 'form_01HWESSENTIEL',
 'adherent', 'pharmacie', 'approuvee',
 18000, 12600, 5400, '2026-02-22',
 '01JCVMKD1CP2N3X4Y5Z6A7B8C3', '2026-02-24 09:45:00', 0,
 '2026-02-22 11:30:00', '2026-02-24 09:45:00');

--------------------------------------------------------------------------------
-- 5. en_paiement (approved and in payment processing)
--------------------------------------------------------------------------------

INSERT INTO sante_demandes (
  id, numero_demande, adherent_id, praticien_id, formule_id, source, type_soin,
  statut, montant_demande, montant_rembourse, montant_reste_charge,
  est_tiers_payant, montant_praticien, date_soin,
  traite_par, date_traitement, score_fraude, created_at, updated_at
) VALUES
-- DEM-017: Youssef Mekni — consultation (tiers payant)
('01JSD0E017DEM0CONSULT004', 'DEM-2026-00017',
 '01JCVMKA1GP2N3X4Y5Z6A7B8I5', 'prat_02HWDRBENALI', 'form_02HWCONFORT',
 'praticien', 'consultation', 'en_paiement',
 55000, 44000, 11000, 1, 44000, '2026-02-01',
 '01JCVMKD1AP2N3X4Y5Z6A7B8A1', '2026-02-03 10:30:00', 6,
 '2026-02-01 14:00:00', '2026-02-05 09:00:00'),

-- DEM-018: Amira Saidi — pharmacie (tiers payant)
('01JSD0E018DEM0PHARMA0005', 'DEM-2026-00018',
 '01JCVMKA1HP2N3X4Y5Z6A7B8J6', 'prat_03HWPHHAMDI', 'form_01HWESSENTIEL',
 'praticien', 'pharmacie', 'en_paiement',
 42000, 29400, 12600, 1, 29400, '2026-01-30',
 '01JCVMKD1AP2N3X4Y5Z6A7B8A1', '2026-02-01 08:00:00', 0,
 '2026-01-30 16:00:00', '2026-02-03 10:00:00'),

-- DEM-019: Hichem Ferchichi — laboratoire
('01JSD0E019DEM0LABORAT003', 'DEM-2026-00019',
 '01JCVMKA1IP2N3X4Y5Z6A7B8K7', 'prat_06HWLBTOUNSI', 'form_03HWPREMIUM',
 'adherent', 'laboratoire', 'en_paiement',
 130000, 117000, 13000, 0, NULL, '2026-01-25',
 '01JCVMKD1BP2N3X4Y5Z6A7B8B2', '2026-01-28 15:00:00', 11,
 '2026-01-25 09:30:00', '2026-02-01 09:00:00');

--------------------------------------------------------------------------------
-- 6. payee (fully paid)
--------------------------------------------------------------------------------

INSERT INTO sante_demandes (
  id, numero_demande, adherent_id, praticien_id, formule_id, source, type_soin,
  statut, montant_demande, montant_rembourse, montant_reste_charge,
  est_tiers_payant, montant_praticien, date_soin,
  traite_par, date_traitement, score_fraude, created_at, updated_at
) VALUES
-- DEM-020: Mohamed Ben Salah — pharmacie (paid)
('01JSD0F020DEM0PHARMA0006', 'DEM-2026-00020',
 '01JCVMKA1AP2N3X4Y5Z6A7B8C9', 'prat_03HWPHHAMDI', 'form_01HWESSENTIEL',
 'praticien', 'pharmacie', 'payee',
 22000, 15400, 6600, 1, 15400, '2026-01-10',
 '01JCVMKD1AP2N3X4Y5Z6A7B8A1', '2026-01-12 09:00:00', 1,
 '2026-01-10 10:00:00', '2026-01-18 09:00:00'),

-- DEM-021: Fatma Trabelsi — consultation (paid)
('01JSD0F021DEM0CONSULT005', 'DEM-2026-00021',
 '01JCVMKA1BP2N3X4Y5Z6A7B8D0', 'prat_02HWDRBENALI', 'form_02HWCONFORT',
 'adherent', 'consultation', 'payee',
 40000, 32000, 8000, 0, NULL, '2026-01-08',
 '01JCVMKD1CP2N3X4Y5Z6A7B8C3', '2026-01-10 14:30:00', 4,
 '2026-01-08 11:15:00', '2026-01-15 10:00:00'),

-- DEM-022: Ahmed Bouazizi — hospitalisation (paid, large amount)
('01JSD0F022DEM0HOSPIT0004', 'DEM-2026-00022',
 '01JCVMKA1CP2N3X4Y5Z6A7B8E1', 'prat_01HWDRMEJRI', 'form_03HWPREMIUM',
 'praticien', 'hospitalisation', 'payee',
 4200000, 3780000, 420000, 1, 3780000, '2026-01-05',
 '01JCVMKD1BP2N3X4Y5Z6A7B8B2', '2026-01-10 16:00:00', 20,
 '2026-01-05 07:00:00', '2026-01-20 09:00:00'),

-- DEM-023: Leila Hammami — dentaire (paid)
('01JSD0F023DEM0DENTAIRE03', 'DEM-2026-00023',
 '01JCVMKA1DP2N3X4Y5Z6A7B8F2', 'prat_04HWDTBOUAZIZ', 'form_02HWCONFORT',
 'adherent', 'dentaire', 'payee',
 150000, 112500, 37500, 0, NULL, '2026-01-15',
 '01JCVMKD1AP2N3X4Y5Z6A7B8A1', '2026-01-17 11:00:00', 5,
 '2026-01-15 09:45:00', '2026-01-22 09:00:00'),

-- DEM-024: Karim Jebali — laboratoire (paid)
('01JSD0F024DEM0LABORAT004', 'DEM-2026-00024',
 '01JCVMKA1EP2N3X4Y5Z6A7B8G3', 'prat_06HWLBTOUNSI', 'form_01HWESSENTIEL',
 'adherent', 'laboratoire', 'payee',
 65000, 45500, 19500, 0, NULL, '2026-01-12',
 '01JCVMKD1CP2N3X4Y5Z6A7B8C3', '2026-01-14 10:00:00', 9,
 '2026-01-12 08:30:00', '2026-01-20 14:00:00'),

-- DEM-025: Sonia Chahed — optique (paid)
('01JSD0F025DEM0OPTIQUE003', 'DEM-2026-00025',
 '01JCVMKA1FP2N3X4Y5Z6A7B8H4', 'prat_05HWOPKHELIL', 'form_03HWPREMIUM',
 'adherent', 'optique', 'payee',
 320000, 288000, 32000, 0, NULL, '2026-01-18',
 '01JCVMKD1BP2N3X4Y5Z6A7B8B2', '2026-01-20 15:00:00', 3,
 '2026-01-18 14:00:00', '2026-01-25 09:00:00'),

-- DEM-026: Nadia Ghannouchi — pharmacie (paid)
('01JSD0F026DEM0PHARMA0007', 'DEM-2026-00026',
 '01JCVMKA1JP2N3X4Y5Z6A7B8L8', 'prat_03HWPHHAMDI', 'form_01HWESSENTIEL',
 'praticien', 'pharmacie', 'payee',
 15000, 10500, 4500, 1, 10500, '2026-01-22',
 '01JCVMKD1AP2N3X4Y5Z6A7B8A1', '2026-01-23 09:30:00', 0,
 '2026-01-22 17:00:00', '2026-01-28 09:00:00');

--------------------------------------------------------------------------------
-- 7. rejetee (rejected claims)
--------------------------------------------------------------------------------

INSERT INTO sante_demandes (
  id, numero_demande, adherent_id, praticien_id, formule_id, source, type_soin,
  statut, montant_demande, date_soin,
  traite_par, date_traitement, motif_rejet, notes_internes, score_fraude,
  created_at, updated_at
) VALUES
-- DEM-027: Youssef Mekni — dentaire (rejected, high fraud score)
('01JSD0G027DEM0DENTAIRE04', 'DEM-2026-00027',
 '01JCVMKA1GP2N3X4Y5Z6A7B8I5', 'prat_04HWDTBOUAZIZ', 'form_02HWCONFORT',
 'adherent', 'dentaire', 'rejetee',
 450000, '2026-02-08',
 '01JCVMKD1BP2N3X4Y5Z6A7B8B2', '2026-02-10 11:00:00',
 'Acte non couvert par la formule souscrite. Prothèse complète hors convention.',
 'Score fraude élevé — montant inhabituel pour ce type de praticien.', 78,
 '2026-02-08 10:00:00', '2026-02-10 11:00:00'),

-- DEM-028: Amira Saidi — hospitalisation (rejected, eligibility expired)
('01JSD0G028DEM0HOSPIT0005', 'DEM-2026-00028',
 '01JCVMKA1HP2N3X4Y5Z6A7B8J6', 'prat_01HWDRMEJRI', 'form_01HWESSENTIEL',
 'adherent', 'hospitalisation', 'rejetee',
 800000, '2026-01-05',
 '01JCVMKD1CP2N3X4Y5Z6A7B8C3', '2026-01-07 09:00:00',
 'Contrat suspendu pour impayé au moment du soin.',
 'Vérifier avec le service recouvrement si régularisation possible.', 55,
 '2026-01-05 12:00:00', '2026-01-07 09:00:00'),

-- DEM-029: Hichem Ferchichi — pharmacie (rejected, duplicate claim)
('01JSD0G029DEM0PHARMA0008', 'DEM-2026-00029',
 '01JCVMKA1IP2N3X4Y5Z6A7B8K7', 'prat_03HWPHHAMDI', 'form_03HWPREMIUM',
 'praticien', 'pharmacie', 'rejetee',
 38000, '2026-02-14',
 '01JCVMKD1AP2N3X4Y5Z6A7B8A1', '2026-02-15 10:30:00',
 'Doublon détecté — même ordonnance déjà remboursée le 12/02/2026.',
 'Ordonnance identique à DEM-2026-00013. Possible erreur de saisie praticien.', 85,
 '2026-02-14 14:00:00', '2026-02-15 10:30:00'),

-- DEM-030: Nadia Ghannouchi — consultation (rejected, non-conventioned)
('01JSD0G030DEM0CONSULT006', 'DEM-2026-00030',
 '01JCVMKA1JP2N3X4Y5Z6A7B8L8', 'prat_02HWDRBENALI', 'form_01HWESSENTIEL',
 'adherent', 'consultation', 'rejetee',
 75000, '2026-01-30',
 '01JCVMKD1CP2N3X4Y5Z6A7B8C3', '2026-02-01 14:00:00',
 'Praticien non conventionné avec la formule Essentiel.',
 'Orienté vers un praticien conventionné. Adhérent informé par email.', 30,
 '2026-01-30 09:00:00', '2026-02-01 14:00:00');
