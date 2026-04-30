-- § 1. Consultations et visites: taux 85%, plafond par acte = base conventionnelle
-- TP: rbs = min(facture × 0.85, base_conventionnelle)
-- C1: base 45 DT → plafond 45000 mill, taux 0.85
-- C2: base 55 DT → plafond 55000 mill, taux 0.85
-- C3: base 55 DT → plafond 55000 mill, taux 0.85
-- V1: base 50 DT → plafond 50000 mill, taux 0.85
-- V2: base 55 DT → plafond 55000 mill, taux 0.85
-- V3: base 55 DT → plafond 55000 mill, taux 0.85

UPDATE contrat_baremes SET type_calcul = 'taux', valeur = 0.85 WHERE id LIKE 'bar-%-c1';
UPDATE contrat_baremes SET type_calcul = 'taux', valeur = 0.85 WHERE id LIKE 'bar-%-c2';
UPDATE contrat_baremes SET type_calcul = 'taux', valeur = 0.85 WHERE id LIKE 'bar-%-c3';
UPDATE contrat_baremes SET type_calcul = 'taux', valeur = 0.85 WHERE id LIKE 'bar-%-v1';
UPDATE contrat_baremes SET type_calcul = 'taux', valeur = 0.85 WHERE id LIKE 'bar-%-v2';
UPDATE contrat_baremes SET type_calcul = 'taux', valeur = 0.85 WHERE id LIKE 'bar-%-v3';
