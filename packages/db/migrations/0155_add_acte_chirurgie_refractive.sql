-- Ajouter un acte referentiel pour la chirurgie refractive (laser)
-- Rubrique 5 du TP - pas de famille d'actes existante, on utilise un code simple

INSERT OR IGNORE INTO actes_referentiel (id, code, label, taux_remboursement, plafond_acte, famille_id, type_calcul, valeur_base, code_assureur)
VALUES ('acte-laser', 'LASER', 'Chirurgie réfractive (traitement par laser)', 1.00, NULL, NULL, 'taux', NULL, 'LASER');
