---
id: TASK-001
parent: REQ-003
status: done
dependencies: []
files:
  - packages/db/migrations/0066_add_batch_id_to_bulletins_soins.sql
---

## Objective

Ajouter la colonne `batch_id` à la table `bulletins_soins` pour lier chaque bulletin à un lot.

## Context

La colonne `batch_id` était prévue dans la migration 0042 mais l'ALTER a été commenté.
Les routes API (GET list, export) font déjà des JOIN/WHERE sur `batch_id` mais la colonne n'existe pas, ce qui provoque des erreurs.

## Acceptance Criteria

- AC1 : migration 0066 ajoute `batch_id TEXT REFERENCES bulletin_batches(id)` à `bulletins_soins`
- AC2 : index créé sur `batch_id` pour les requêtes de filtrage
- AC3 : migration appliquée sur les tenant DBs locaux (DB_GAT, DB_COMAR, DB_STAR, DB_AMI)

## Implementation Steps

1. Créer `packages/db/migrations/0066_add_batch_id_to_bulletins_soins.sql`
2. Appliquer manuellement sur chaque tenant DB local
