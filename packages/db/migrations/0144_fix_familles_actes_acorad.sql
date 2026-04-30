-- Fix familles_actes to match Acorad reference data (tableau1.PNG)
-- FA0008 "Hospitalisation hôpital" does not exist in Acorad — merge into FA0007
-- FA0014 is "Frais funéraires" in Acorad, not "Soins orthodontiques"
-- FA0019 is "Aide" in Acorad, not "Frais funéraires"

-- Step 1: Move actes from FA0008 to FA0007 (both are hospitalisation)
UPDATE actes_referentiel SET famille_id = 'fa-007' WHERE famille_id = 'fa-008';

-- Step 2: Move orthodontie actes (ODF) from FA0014 to FA0011 (soins dentaires)
UPDATE actes_referentiel SET famille_id = 'fa-011' WHERE famille_id = 'fa-014';

-- Step 3: Move frais funéraires actes (FF) from FA0019 to FA0014
UPDATE actes_referentiel SET famille_id = 'fa-014' WHERE famille_id = 'fa-019';

-- Step 4: Fix labels to match Acorad
UPDATE familles_actes SET label = 'Frais funéraires' WHERE code = 'FA0014';
UPDATE familles_actes SET label = 'Aide' WHERE code = 'FA0019';

-- Step 5: Deactivate FA0008 (does not exist in Acorad)
UPDATE familles_actes SET is_active = 0 WHERE code = 'FA0008';

-- Step 6: Also fix contrat_baremes that reference old famille IDs
UPDATE contrat_baremes SET famille_id = 'fa-007' WHERE famille_id = 'fa-008';
UPDATE contrat_baremes SET famille_id = 'fa-011' WHERE famille_id = 'fa-014'
  AND EXISTS (SELECT 1 FROM familles_actes WHERE id = 'fa-014');
