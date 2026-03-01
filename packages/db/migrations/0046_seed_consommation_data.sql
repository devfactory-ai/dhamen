-- Seed coverage limits for active contracts - consultation
INSERT INTO contract_coverage_limits (id, contract_id, care_type, care_label, annual_limit, per_event_limit, reimbursement_rate)
SELECT 'CCL' || substr(hex(randomblob(8)), 1, 16), c.id, 'consultation', 'Consultations médicales', 1500.00, 80.00, 80
FROM contracts c WHERE c.status = 'active';

-- pharmacy
INSERT INTO contract_coverage_limits (id, contract_id, care_type, care_label, annual_limit, per_event_limit, reimbursement_rate)
SELECT 'CCL' || substr(hex(randomblob(8)), 1, 16), c.id, 'pharmacy', 'Pharmacie', 2000.00, NULL, 70
FROM contracts c WHERE c.status = 'active';

-- lab
INSERT INTO contract_coverage_limits (id, contract_id, care_type, care_label, annual_limit, per_event_limit, reimbursement_rate)
SELECT 'CCL' || substr(hex(randomblob(8)), 1, 16), c.id, 'lab', 'Analyses médicales', 1000.00, 200.00, 80
FROM contracts c WHERE c.status = 'active';

-- hospital
INSERT INTO contract_coverage_limits (id, contract_id, care_type, care_label, annual_limit, per_event_limit, reimbursement_rate)
SELECT 'CCL' || substr(hex(randomblob(8)), 1, 16), c.id, 'hospital', 'Hospitalisation', 15000.00, NULL, 90
FROM contracts c WHERE c.status = 'active';

-- dental
INSERT INTO contract_coverage_limits (id, contract_id, care_type, care_label, annual_limit, per_event_limit, reimbursement_rate)
SELECT 'CCL' || substr(hex(randomblob(8)), 1, 16), c.id, 'dental', 'Soins dentaires', 800.00, 150.00, 60
FROM contracts c WHERE c.status = 'active';

-- optical
INSERT INTO contract_coverage_limits (id, contract_id, care_type, care_label, annual_limit, per_event_limit, reimbursement_rate)
SELECT 'CCL' || substr(hex(randomblob(8)), 1, 16), c.id, 'optical', 'Optique', 500.00, 250.00, 70
FROM contracts c WHERE c.status = 'active';

-- maternity
INSERT INTO contract_coverage_limits (id, contract_id, care_type, care_label, annual_limit, per_event_limit, reimbursement_rate)
SELECT 'CCL' || substr(hex(randomblob(8)), 1, 16), c.id, 'maternity', 'Maternité', 3000.00, NULL, 100
FROM contracts c WHERE c.status = 'active';

-- Seed consumption for adherents - consultation
INSERT INTO beneficiary_consumption (id, contract_id, adherent_id, beneficiary_id, beneficiary_name, care_type, year, total_consumed, total_claims, last_claim_date)
SELECT 'BC' || substr(hex(randomblob(8)), 1, 16), c.id, a.id, NULL, a.first_name || ' ' || a.last_name, 'consultation', 2025,
  ROUND(150 + (abs(random()) % 400), 2), 3 + (abs(random()) % 4), date('now', '-' || (abs(random() % 30)) || ' days')
FROM adherents a
JOIN contracts c ON c.adherent_id = a.id AND c.status = 'active'
LIMIT 15;

-- pharmacy
INSERT INTO beneficiary_consumption (id, contract_id, adherent_id, beneficiary_id, beneficiary_name, care_type, year, total_consumed, total_claims, last_claim_date)
SELECT 'BC' || substr(hex(randomblob(8)), 1, 16), c.id, a.id, NULL, a.first_name || ' ' || a.last_name, 'pharmacy', 2025,
  ROUND(300 + (abs(random()) % 600), 2), 6 + (abs(random()) % 8), date('now', '-' || (abs(random() % 15)) || ' days')
FROM adherents a
JOIN contracts c ON c.adherent_id = a.id AND c.status = 'active'
LIMIT 15;

-- lab
INSERT INTO beneficiary_consumption (id, contract_id, adherent_id, beneficiary_id, beneficiary_name, care_type, year, total_consumed, total_claims, last_claim_date)
SELECT 'BC' || substr(hex(randomblob(8)), 1, 16), c.id, a.id, NULL, a.first_name || ' ' || a.last_name, 'lab', 2025,
  ROUND(80 + (abs(random()) % 250), 2), 1 + (abs(random()) % 3), date('now', '-' || (abs(random() % 40)) || ' days')
FROM adherents a
JOIN contracts c ON c.adherent_id = a.id AND c.status = 'active'
LIMIT 10;
