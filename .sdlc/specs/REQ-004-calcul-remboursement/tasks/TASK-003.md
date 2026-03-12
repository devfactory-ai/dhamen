---
id: TASK-003
parent: REQ-004
status: done
dependencies: []
files:
  - packages/db/migrations/0072_add_plafond_consomme_to_adherents.sql
---

## Objective

Ajouter la colonne `plafond_consomme` à la table `adherents` pour suivre la consommation du plafond annuel.

## Context

Le domaine définit que chaque **adhérent** possède un plafond annuel (REQ-000 architecture.md). La colonne `plafond_global` existe déjà (migration 0020, INTEGER en millimes). Il manque une colonne pour tracker le montant déjà consommé afin de calculer le `plafond_restant = plafond_global - plafond_consomme`.

## Acceptance Criteria

- AC1 : migration ajoute `plafond_consomme INTEGER DEFAULT 0` à `adherents`
- AC2 : migration appliquée sur les tenant DBs locaux

## Implementation Steps

1. Créer `packages/db/migrations/0072_add_plafond_consomme_to_adherents.sql`
2. ALTER TABLE `adherents` ADD COLUMN `plafond_consomme INTEGER DEFAULT 0`
3. Appliquer sur chaque tenant DB local
