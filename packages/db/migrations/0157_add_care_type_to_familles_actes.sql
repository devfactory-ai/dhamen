-- Add care_type column to familles_actes so the famille→guarantee mapping is data-driven, not hardcoded.
-- care_type references the contract_guarantees.care_type used for reimbursement lookup.

ALTER TABLE familles_actes ADD COLUMN care_type TEXT;

-- Populate based on actual BH contract guarantee care_types
UPDATE familles_actes SET care_type = 'consultation_visite' WHERE id = 'fa-001';
-- fa-002: merged into fa-009, no active actes
UPDATE familles_actes SET care_type = 'pharmacie' WHERE id = 'fa-003';
UPDATE familles_actes SET care_type = 'laboratoire' WHERE id = 'fa-004';
UPDATE familles_actes SET care_type = 'orthopedie' WHERE id = 'fa-005';
UPDATE familles_actes SET care_type = 'optique' WHERE id = 'fa-006';
UPDATE familles_actes SET care_type = 'hospitalisation' WHERE id = 'fa-007';
-- fa-008: hospitalisation hôpital, covered by fa-007 sub-limits
UPDATE familles_actes SET care_type = 'hospitalisation' WHERE id = 'fa-008';
UPDATE familles_actes SET care_type = 'actes_courants' WHERE id = 'fa-009';
UPDATE familles_actes SET care_type = 'chirurgie' WHERE id = 'fa-010';
UPDATE familles_actes SET care_type = 'dentaire' WHERE id = 'fa-011';
UPDATE familles_actes SET care_type = 'accouchement' WHERE id = 'fa-012';
UPDATE familles_actes SET care_type = 'cures_thermales' WHERE id = 'fa-013';
UPDATE familles_actes SET care_type = 'orthodontie' WHERE id = 'fa-014';
UPDATE familles_actes SET care_type = 'circoncision' WHERE id = 'fa-015';
UPDATE familles_actes SET care_type = 'transport' WHERE id = 'fa-016';
UPDATE familles_actes SET care_type = 'actes_courants' WHERE id = 'fa-017';
-- fa-018: soins étranger, pas de garantie standard
UPDATE familles_actes SET care_type = 'frais_funeraires' WHERE id = 'fa-019';
-- fa-020: non remboursable
