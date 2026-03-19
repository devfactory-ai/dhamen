-- Seed: Données de test pour les pré-autorisations (PEC / Accord préalable)
-- Scénarios réalistes de demandes de PEC en Tunisie

-- PEC 1: Hospitalisation approuvée (Mohamed Ben Salah)
INSERT INTO pre_authorizations (id, authorization_number, adherent_id, provider_id, insurer_id, care_type, procedure_code, procedure_description, diagnosis_code, diagnosis_description, medical_justification, prescribing_doctor, prescription_date, estimated_amount, approved_amount, coverage_rate, requested_care_date, validity_start_date, validity_end_date, status, decision_reason, priority, is_emergency, submitted_at, reviewed_at, decided_at, created_at)
VALUES (
  '01JCVMPEC001P2N3X4Y5Z6A7B8',
  'AP-2026-00001',
  '01JCVMKA1BP2N3X4Y5Z6A7B8D0',
  '01JCVMK9B1P2N3X4Y5Z6A7B8C9',
  '01JCVMK8R7P2N3X4Y5Z6A7B8D0',
  'hospitalization',
  'HOSP-001',
  'Hospitalisation pour cholécystectomie laparoscopique',
  'K80.1',
  'Lithiase vésiculaire avec cholécystite',
  'Patient présentant des calculs biliaires symptomatiques récurrents. Échographie confirmant lithiase multiple. Indication chirurgicale formelle après échec du traitement médical.',
  'Dr. Mohamed Ben Ali',
  '2026-03-10',
  2500.000,
  2250.000,
  0.90,
  '2026-03-25',
  '2026-03-20',
  '2026-04-20',
  'approved',
  'Dossier complet. Indication chirurgicale justifiée. Couverture à 90% selon barème hospitalisation.',
  'normal',
  0,
  '2026-03-10',
  '2026-03-12',
  '2026-03-12',
  '2026-03-10'
);

-- PEC 2: IRM en attente (Fatma Trabelsi)
INSERT INTO pre_authorizations (id, adherent_id, provider_id, insurer_id, care_type, procedure_code, procedure_description, diagnosis_code, diagnosis_description, medical_justification, prescribing_doctor, prescription_date, estimated_amount, requested_care_date, status, priority, submitted_at, created_at)
VALUES (
  '01JCVMPEC002P2N3X4Y5Z6A7B8',
  '01JCVMKA1CP2N3X4Y5Z6A7B8E1',
  '01JCVMK9C1P2N3X4Y5Z6A7B8C9',
  '01JCVMK8R7P2N3X4Y5Z6A7B8D0',
  'mri',
  'IRM-RACH',
  'IRM rachis lombaire avec injection de gadolinium',
  'M54.5',
  'Lombalgie basse',
  'Lombalgie chronique résistante au traitement conservateur depuis 6 mois. Suspicion de hernie discale L4-L5. IRM nécessaire pour bilan pré-chirurgical.',
  'Dr. Sami Trabelsi',
  '2026-03-15',
  450.000,
  '2026-03-28',
  'pending',
  'normal',
  '2026-03-15',
  '2026-03-15'
);

-- PEC 3: Scanner approuvé partiellement (Ahmed Bouazizi)
INSERT INTO pre_authorizations (id, authorization_number, adherent_id, provider_id, insurer_id, care_type, procedure_code, procedure_description, diagnosis_code, diagnosis_description, medical_justification, prescribing_doctor, prescription_date, estimated_amount, approved_amount, coverage_rate, requested_care_date, validity_start_date, validity_end_date, status, decision_reason, priority, submitted_at, reviewed_at, decided_at, created_at)
VALUES (
  '01JCVMPEC003P2N3X4Y5Z6A7B8',
  'AP-2026-00003',
  '01JCVMKA1EP2N3X4Y5Z6A7B8G3',
  '01JCVMK9C1P2N3X4Y5Z6A7B8C9',
  '01JCVMK8R7P2N3X4Y5Z6A7B8D0',
  'scanner',
  'TDM-THOR',
  'Scanner thoraco-abdominal avec injection',
  'R91',
  'Anomalie à l''imagerie pulmonaire',
  'Opacité pulmonaire découverte sur radiographie de routine. Bilan d''extension nécessaire. Patient fumeur depuis 20 ans.',
  'Dr. Mohamed Ben Ali',
  '2026-03-08',
  380.000,
  300.000,
  0.80,
  '2026-03-20',
  '2026-03-12',
  '2026-04-12',
  'partially_approved',
  'Scanner thoracique approuvé. Extension abdominale non justifiée à ce stade. Couverture 80% sur la partie thoracique uniquement.',
  'high',
  '2026-03-08',
  '2026-03-10',
  '2026-03-10',
  '2026-03-08'
);

-- PEC 4: Chirurgie urgente approuvée (Nour Hammami)
INSERT INTO pre_authorizations (id, authorization_number, adherent_id, provider_id, insurer_id, care_type, procedure_code, procedure_description, diagnosis_code, diagnosis_description, medical_justification, prescribing_doctor, prescription_date, estimated_amount, approved_amount, coverage_rate, requested_care_date, validity_start_date, validity_end_date, status, decision_reason, priority, is_emergency, submitted_at, reviewed_at, decided_at, created_at)
VALUES (
  '01JCVMPEC004P2N3X4Y5Z6A7B8',
  'AP-2026-00004',
  '01JCVMKA1FP2N3X4Y5Z6A7B8H4',
  '01JCVMK9B2P2N3X4Y5Z6A7B8D0',
  '01JCVMK8R7P2N3X4Y5Z6A7B8D0',
  'surgery',
  'CHIR-ORTH',
  'Arthroscopie du genou - méniscectomie partielle',
  'M23.3',
  'Lésion méniscale interne du genou',
  'Blocage articulaire récurrent du genou droit. IRM confirmant déchirure méniscale. Échec du traitement conservateur. Indication chirurgicale urgente.',
  'Dr. Sami Trabelsi',
  '2026-03-12',
  1800.000,
  1800.000,
  1.00,
  '2026-03-18',
  '2026-03-14',
  '2026-04-14',
  'approved',
  'Urgence chirurgicale confirmée. Couverture intégrale selon barème chirurgie orthopédique.',
  'urgent',
  1,
  '2026-03-12',
  '2026-03-13',
  '2026-03-13',
  '2026-03-12'
);

-- PEC 5: Prothèse dentaire rejetée (Leila Gharbi)
INSERT INTO pre_authorizations (id, adherent_id, provider_id, insurer_id, care_type, procedure_code, procedure_description, diagnosis_code, diagnosis_description, medical_justification, prescribing_doctor, prescription_date, estimated_amount, status, decision_reason, priority, submitted_at, reviewed_at, decided_at, created_at)
VALUES (
  '01JCVMPEC005P2N3X4Y5Z6A7B8',
  '01JCVMKA1GP2N3X4Y5Z6A7B8I5',
  '01JCVMK9B1P2N3X4Y5Z6A7B8C9',
  '01JCVMK8R7P2N3X4Y5Z6A7B8D0',
  'dental_prosthesis',
  'DENT-PROT',
  'Prothèse dentaire amovible partielle - 6 éléments',
  'K08.1',
  'Perte de dents due à un accident ou extraction',
  'Patient ayant perdu 6 dents suite à parodontite avancée. Prothèse amovible partielle nécessaire pour restauration fonctionnelle.',
  'Dr. Mohamed Ben Ali',
  '2026-03-05',
  1200.000,
  'rejected',
  'Prothèse dentaire non couverte par le contrat groupe actuel. Recommander souscription option dentaire premium.',
  'low',
  '2026-03-05',
  '2026-03-08',
  '2026-03-08',
  '2026-03-05'
);

-- PEC 6: Kinésithérapie en revue médicale (Mohamed Ben Salah)
INSERT INTO pre_authorizations (id, adherent_id, provider_id, insurer_id, care_type, procedure_code, procedure_description, diagnosis_code, diagnosis_description, medical_justification, prescribing_doctor, prescription_date, estimated_amount, requested_care_date, status, priority, submitted_at, reviewed_at, created_at)
VALUES (
  '01JCVMPEC006P2N3X4Y5Z6A7B8',
  '01JCVMKA1BP2N3X4Y5Z6A7B8D0',
  '01JCVMK9B2P2N3X4Y5Z6A7B8D0',
  '01JCVMK8R7P2N3X4Y5Z6A7B8D0',
  'physical_therapy',
  'KINE-30',
  'Kinésithérapie respiratoire - 30 séances',
  'J44.1',
  'BPCO avec exacerbation aiguë',
  'Post-hospitalisation pour exacerbation de BPCO. Rééducation respiratoire prescrite pour 30 séances. Programme de réhabilitation pulmonaire nécessaire.',
  'Dr. Mohamed Ben Ali',
  '2026-03-14',
  900.000,
  '2026-04-01',
  'medical_review',
  'normal',
  '2026-03-14',
  '2026-03-16',
  '2026-03-14'
);

-- PEC 7: Optique brouillon (Fatma Trabelsi)
INSERT INTO pre_authorizations (id, adherent_id, provider_id, insurer_id, care_type, procedure_description, medical_justification, prescribing_doctor, prescription_date, estimated_amount, requested_care_date, status, priority, created_at)
VALUES (
  '01JCVMPEC007P2N3X4Y5Z6A7B8',
  '01JCVMKA1CP2N3X4Y5Z6A7B8E1',
  '01JCVMK9B1P2N3X4Y5Z6A7B8C9',
  '01JCVMK8R7P2N3X4Y5Z6A7B8D0',
  'optical',
  'Lunettes progressives verres amincis + monture',
  'Myopie évolutive avec presbytie associée. Nouvelle correction nécessaire (changement > 0.5 dioptrie).',
  'Dr. Sami Trabelsi',
  '2026-03-18',
  350.000,
  '2026-04-05',
  'draft',
  'low',
  '2026-03-18'
);

-- PEC 8: Médicament coûteux approuvé (Ahmed Bouazizi)
INSERT INTO pre_authorizations (id, authorization_number, adherent_id, provider_id, insurer_id, care_type, procedure_code, procedure_description, diagnosis_code, diagnosis_description, medical_justification, prescribing_doctor, prescription_date, estimated_amount, approved_amount, coverage_rate, requested_care_date, validity_start_date, validity_end_date, status, decision_reason, priority, submitted_at, reviewed_at, decided_at, created_at)
VALUES (
  '01JCVMPEC008P2N3X4Y5Z6A7B8',
  'AP-2026-00008',
  '01JCVMKA1EP2N3X4Y5Z6A7B8G3',
  '01JCVMK9B1P2N3X4Y5Z6A7B8C9',
  '01JCVMK8R7P2N3X4Y5Z6A7B8D0',
  'expensive_medication',
  'MED-BIO',
  'Traitement biologique - Adalimumab (Humira) 40mg - 6 mois',
  'M06.9',
  'Polyarthrite rhumatoïde non précisée',
  'Polyarthrite rhumatoïde active résistante aux DMARDs conventionnels (méthotrexate, sulfasalazine). DAS28 > 5.1. Indication de biothérapie validée en RCP.',
  'Dr. Mohamed Ben Ali',
  '2026-03-01',
  4200.000,
  3780.000,
  0.90,
  '2026-03-20',
  '2026-03-15',
  '2026-09-15',
  'approved',
  'Biothérapie approuvée après validation RCP. Couverture 90% sur 6 mois. Renouvellement conditionné à la réévaluation clinique.',
  'high',
  '2026-03-01',
  '2026-03-10',
  '2026-03-15',
  '2026-03-01'
);

-- Seed: Règles de pré-autorisation pour GAT Assurances
INSERT INTO pre_authorization_rules (id, insurer_id, care_type, max_auto_approve_amount, requires_medical_review, requires_documents, min_days_advance, default_validity_days, is_active)
VALUES
  ('01JCVMRULE01P2N3X4Y5Z6A7B8', '01JCVMK8R7P2N3X4Y5Z6A7B8D0', 'hospitalization', 500.000, 1, 1, 5, 30, 1),
  ('01JCVMRULE02P2N3X4Y5Z6A7B8', '01JCVMK8R7P2N3X4Y5Z6A7B8D0', 'surgery', 0, 1, 1, 3, 30, 1),
  ('01JCVMRULE03P2N3X4Y5Z6A7B8', '01JCVMK8R7P2N3X4Y5Z6A7B8D0', 'mri', 500.000, 0, 1, 3, 15, 1),
  ('01JCVMRULE04P2N3X4Y5Z6A7B8', '01JCVMK8R7P2N3X4Y5Z6A7B8D0', 'scanner', 400.000, 0, 1, 3, 15, 1),
  ('01JCVMRULE05P2N3X4Y5Z6A7B8', '01JCVMK8R7P2N3X4Y5Z6A7B8D0', 'optical', 200.000, 0, 0, 0, 60, 1),
  ('01JCVMRULE06P2N3X4Y5Z6A7B8', '01JCVMK8R7P2N3X4Y5Z6A7B8D0', 'dental_prosthesis', 0, 1, 1, 7, 30, 1),
  ('01JCVMRULE07P2N3X4Y5Z6A7B8', '01JCVMK8R7P2N3X4Y5Z6A7B8D0', 'physical_therapy', 300.000, 1, 1, 3, 90, 1),
  ('01JCVMRULE08P2N3X4Y5Z6A7B8', '01JCVMK8R7P2N3X4Y5Z6A7B8D0', 'expensive_medication', 0, 1, 1, 5, 180, 1);
