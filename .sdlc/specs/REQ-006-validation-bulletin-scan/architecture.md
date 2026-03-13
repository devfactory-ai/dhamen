---
id: REQ-006
title: Validation bulletin et upload scan
status: draft
priority: must
---

# Description

Après la saisie d'un bulletin et le calcul du remboursement,
l'agent doit pouvoir valider le bulletin.

Lors de la validation :

- le remboursement est enregistré
- le bulletin devient consultable dans l'historique
- un scan du bulletin peut être attaché (optionnel)

Le scan sert uniquement d'archivage.

Aucun traitement OCR n'est effectué dans ce sprint.

---

# User Story

En tant qu’agent assurance,

je veux valider un bulletin de remboursement

afin d'enregistrer définitivement le remboursement
et passer au bulletin suivant.

---

# Fonctionnalités

- bouton "Valider bulletin"
- enregistrement du remboursement
- possibilité d'ajouter un scan (image ou PDF)
- stockage du scan dans R2
- accès au fichier depuis la fiche bulletin

---

# Acceptance Criteria

AC1 : un bulletin validé est enregistré en base

AC2 : les remboursements sont ajoutés à l'historique

AC3 : un fichier peut être uploadé

AC4 : le fichier est stocké dans R2

AC5 : le lien vers le scan est visible dans la vue bulletin