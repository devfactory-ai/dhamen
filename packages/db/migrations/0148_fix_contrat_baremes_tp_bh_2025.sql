-- Fix contrat_baremes to match TP BH 2025 rules (dossier/TP_BH_2025_regles.md)
-- All values are per-contract data, not hardcoded engine rules.
-- valeur is in millimes for forfait, decimal for taux.

-- § 2. Actes médicaux courants (letter keys)
-- AM = 1.750 DT = 1750 mill (was 1500)
UPDATE contrat_baremes SET valeur = 1750 WHERE id LIKE 'bar-%-am';
-- AMM = 1.750 DT = 1750 mill (was 10000 — wrong, confond valeur K/AMM)
UPDATE contrat_baremes SET valeur = 1750 WHERE id LIKE 'bar-%-amm';
-- PC = 1.200 DT = 1200 mill (was 1500)
UPDATE contrat_baremes SET valeur = 1200 WHERE id LIKE 'bar-%-pc';

-- § 4. Analyses: B = 0.270 DT = 270 mill per coefficient
-- Change from taux/0.8 to forfait/270 (letter key mode: nbrCle × 270)
UPDATE contrat_baremes SET type_calcul = 'forfait', valeur = 270 WHERE id LIKE 'bar-%-an';

-- § 3. Pharmacie: plafond annuel 1200 DT (was 1000 DT)
UPDATE contrat_baremes SET plafond_famille_annuel = 1200000 WHERE id LIKE 'bar-%-ph1';

-- § 5. Orthopédie: plafond par acte 800 DT (was null)
UPDATE contrat_baremes SET plafond_acte = 800000 WHERE id LIKE 'bar-%-orp';

-- § 7a. Hospitalisation clinique: 90 DT/jour (was 120 DT forfait)
UPDATE contrat_baremes SET valeur = 90000, plafond_acte = NULL WHERE id LIKE 'bar-%-cl';

-- § 7b. Hospitalisation hôpital: 10 DT/jour (was 45 DT forfait)
UPDATE contrat_baremes SET valeur = 10000, plafond_acte = NULL WHERE id LIKE 'bar-%-hp';

-- § 8b. Radiologie: taux 90% (was 80%)
UPDATE contrat_baremes SET valeur = 0.9 WHERE id LIKE 'bar-%-r';

-- § 9b. FSO (salle opération): taux 90%, plafond 400 DT (was 100%, 300 DT)
UPDATE contrat_baremes SET valeur = 0.9, plafond_acte = 400000 WHERE id LIKE 'bar-%-so';

-- § 9c. Matériel usage unique: taux 100%, plafond 200 DT (was 90%, 300 DT)
UPDATE contrat_baremes SET valeur = 1.0, plafond_acte = 200000 WHERE id LIKE 'bar-%-puu';

-- § 10a. Soins dentaires: D = 3.000 DT = 3000 mill, plafond 600 DT (was taux 0.8, 1200 DT)
UPDATE contrat_baremes SET type_calcul = 'forfait', valeur = 3000, plafond_famille_annuel = 600000 WHERE id LIKE 'bar-%-sd';

-- § 10c. ODF: taux 100%, plafond par acte 400 DT (was taux 80%, plafond famille 600 DT)
UPDATE contrat_baremes SET valeur = 1.0, plafond_acte = 400000, plafond_famille_annuel = NULL WHERE id LIKE 'bar-%-odf';

-- § 11a. Accouchement: plafond 700 DT (was 200 DT)
UPDATE contrat_baremes SET plafond_acte = 700000 WHERE id LIKE 'bar-%-acc';

-- § 11c. IVG: plafond 180 DT (was 100 DT)
UPDATE contrat_baremes SET plafond_acte = 180000 WHERE id LIKE 'bar-%-ig';

-- § 13. Frais funéraires: 150 DT (was 200 DT)
UPDATE contrat_baremes SET valeur = 150000, plafond_acte = 150000 WHERE id LIKE 'bar-%-ff';

-- § 14. Circoncision: taux 100%, plafond 350 DT (was forfait 200 DT)
UPDATE contrat_baremes SET type_calcul = 'taux', valeur = 1.0, plafond_acte = 350000 WHERE id LIKE 'bar-%-cir';

-- § 15. Transport: plafond par acte 300 DT (was plafond_famille 100 DT)
UPDATE contrat_baremes SET plafond_acte = 300000, plafond_famille_annuel = NULL WHERE id LIKE 'bar-%-tr';

-- Also fix actes_referentiel default values to match TP
UPDATE actes_referentiel SET valeur_base = 1750 WHERE code = 'AM';
UPDATE actes_referentiel SET valeur_base = 1750 WHERE code = 'AMM';
UPDATE actes_referentiel SET valeur_base = 1750 WHERE code = 'AMY';
UPDATE actes_referentiel SET valeur_base = 1750 WHERE code = 'AMO';
UPDATE actes_referentiel SET valeur_base = 1200 WHERE code = 'PC';
UPDATE actes_referentiel SET valeur_base = 270, type_calcul = 'forfait' WHERE code = 'AN';
UPDATE actes_referentiel SET valeur_base = 150000 WHERE code = 'FF';
