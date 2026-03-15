# Export CSV lot

## Source des données

Les bulletins validés d’un lot.

Tables utilisées :

lots
bulletins
remboursements
adherents

---

## Requête principale

SELECT
adherents.matricule,
remboursements.montant
FROM remboursements
JOIN bulletins ON bulletins.id = remboursements.bulletin_id
JOIN adherents ON adherents.id = bulletins.adherent_id
WHERE bulletins.lot_id = ?

---

## Endpoint

GET /lots/:id/export.csv

---

## Format CSV

matricule_adherent,montant_remboursement
123456,95
789012,40