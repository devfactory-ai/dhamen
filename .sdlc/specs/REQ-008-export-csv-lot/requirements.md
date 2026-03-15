---
id: REQ-008
title: Export CSV des remboursements par lot
status: draft
priority: should
---

# Description

Après traitement des bulletins d’un lot,
l’agent doit pouvoir exporter un fichier CSV contenant
les remboursements à effectuer.

Le fichier sera utilisé par l’assureur pour exécuter
les paiements.

---

# Format du fichier

Le fichier CSV doit contenir exactement deux colonnes :

matricule_adherent  
montant_remboursement

Chaque ligne correspond à un bulletin validé.

---

# Encodage

Le fichier doit être encodé en UTF-8 avec BOM
afin d’être compatible avec Microsoft Excel.

---

# Nom du fichier

dhamen_lot_{lot_id}_{date}.csv

---

# Acceptance Criteria

AC1 : un agent peut exporter le CSV d’un lot

AC2 : le fichier contient uniquement deux colonnes

AC3 : chaque bulletin validé apparaît dans le fichier

AC4 : le fichier est encodé UTF-8 BOM

AC5 : le fichier s’ouvre correctement dans Excel