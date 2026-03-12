# Architecture métier

Ce document décrit les principales entités du domaine.

---

# Entités principales

## Sociétés

Entreprise ayant un contrat d'assurance santé.

---

## Adhérents

Personnes assurées rattachées à une société.

Chaque adhérent possède :

- un plafond annuel
- une date d'adhésion
- une relation avec une société

---

## Bénéficiaires

Personnes dépendantes d'un adhérent :

- conjoint
- enfants

---

## Actes médicaux

Prestations médicales remboursables.

Chaque acte possède :

- un code
- un libellé
- un taux de remboursement
- éventuellement une limite ou condition.

---

## Bulletins de soins

Déclaration contenant un ou plusieurs actes médicaux.

Chaque bulletin contient :

- un adhérent
- une date
- une liste d'actes
- des montants déclarés

---

## Remboursements

Le remboursement est calculé selon :

montant_acte × taux_remboursement

Le système doit ensuite vérifier :

plafond restant de l'adhérent.

---

# Règle principale

remboursement = montant × taux

remboursement_final = min(remboursement, plafond_restant)

---

# Objectif technique

Les spécifications suivantes implémenteront ces concepts dans
une architecture moderne basée sur :

- API backend
- application web
- application mobile
- base de données relationnelle
