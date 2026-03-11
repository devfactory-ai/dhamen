---
id: REQ-003
title: Saisie bulletin remboursement
status: draft
---

## Description

Permettre à un agent d'assurance de saisir un bulletin de remboursement
dans un lot actif.

Chaque bulletin contient les informations nécessaires pour calculer
le remboursement selon le contrat de l'adhérent.

## User Story

En tant qu'agent assurance,
je veux saisir les informations d'un bulletin
afin que le système calcule automatiquement le remboursement.

## Champs requis

- matricule adhérent
- liste actes médicaux
- montant par acte

## Flux

1. l'agent ouvre l'écran saisie bulletin
2. il saisit matricule adhérent
3. il ajoute un ou plusieurs actes
4. il saisit les montants
5. il valide le bulletin

## Acceptance Criteria

AC1 : formulaire permet saisir matricule adhérent
AC2 : possibilité d'ajouter plusieurs actes médicaux
AC3 : montant saisi pour chaque acte
AC4 : validation du formulaire
AC5 : bulletin enregistré dans le lot actif
