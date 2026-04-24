-- Add lettre_cle column to link each acte to its letter-key (B, K, KC, D, Z, etc.)
-- Used for reimbursement calculation when the acte code doesn't directly match letter_keys_json
ALTER TABLE actes_referentiel ADD COLUMN lettre_cle TEXT;

-- Map existing actes to their letter-keys
UPDATE actes_referentiel SET lettre_cle = 'B' WHERE code = 'AN';
UPDATE actes_referentiel SET lettre_cle = 'Z' WHERE code = 'R';
UPDATE actes_referentiel SET lettre_cle = 'KC' WHERE code IN ('KC', 'FCH');
UPDATE actes_referentiel SET lettre_cle = 'Z' WHERE code = 'Z';
UPDATE actes_referentiel SET lettre_cle = 'E' WHERE code = 'E';
UPDATE actes_referentiel SET lettre_cle = 'PC' WHERE code = 'PC';
UPDATE actes_referentiel SET lettre_cle = 'AM' WHERE code = 'AM';
UPDATE actes_referentiel SET lettre_cle = 'AMM' WHERE code = 'AMM';
UPDATE actes_referentiel SET lettre_cle = 'D' WHERE code IN ('SD', 'ODF');
