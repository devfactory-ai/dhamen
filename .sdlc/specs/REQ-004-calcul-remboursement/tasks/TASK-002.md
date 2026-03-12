---
id: TASK-002
parent: REQ-004
status: done
dependencies: [TASK-001]
files:
  - packages/db/migrations/0071_add_remboursement_to_actes_bulletin.sql
---

## Objective

Ajouter les colonnes de remboursement à la table `actes_bulletin` pour stocker le résultat du calcul par acte.

## Context

Le domaine définit le **remboursement** comme `montant_acte × taux_remboursement`, plafonné au plafond restant de l'**adhérent** (REQ-000). La table `actes_bulletin` (migration 0068) contient `code`, `label`, `amount` mais pas le taux ni le montant remboursé. Ces colonnes doivent être ajoutées pour persister le calcul.

## Acceptance Criteria

- AC1 : migration ajoute `taux_remboursement REAL` à `actes_bulletin`
- AC2 : migration ajoute `montant_rembourse REAL` à `actes_bulletin`
- AC3 : migration ajoute `acte_ref_id TEXT REFERENCES actes_referentiel(id)` (nullable, lien au référentiel)
- AC4 : migration appliquée sur les tenant DBs locaux

## Implementation Steps

1. Créer `packages/db/migrations/0071_add_remboursement_to_actes_bulletin.sql`
2. ALTER TABLE `actes_bulletin` ADD COLUMN pour les 3 colonnes
3. Appliquer sur chaque tenant DB local
