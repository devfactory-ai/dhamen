# Calcul remboursement

## Inputs

- montant_acte
- taux_remboursement
- plafond_restant

---

## Process

1 récupérer taux de remboursement de l’acte

2 calculer remboursement brut

remboursement_brut = montant × taux

3 vérifier plafond restant

si remboursement_brut > plafond_restant

remboursement_final = plafond_restant

sinon

remboursement_final = remboursement_brut

---


## Outputs

- remboursement_acte
- remboursement_total_bulletin

---

## Entités utilisées

bulletins

bulletin_actes

actes

adherents

plafonds