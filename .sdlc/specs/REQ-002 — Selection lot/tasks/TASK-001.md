---
id: TASK-001
parent: REQ-002
status: done
dependencies: []
files:
  - packages/db/migrations/0065_add_company_id_to_bulletin_batches.sql
---

## Objective

Ajouter la colonne `company_id` (FK → companies) à la table `bulletin_batches` pour lier chaque lot à une entreprise.

## Acceptance Criteria

- La migration ajoute `company_id` (TEXT, nullable pour rétro-compatibilité) à `bulletin_batches`
- Un index `idx_bulletin_batches_company_id` est créé
- Les lots existants ne sont pas impactés (nullable)

## Implementation Steps

1. Créer `packages/db/migrations/0065_add_company_id_to_bulletin_batches.sql`
2. `ALTER TABLE bulletin_batches ADD COLUMN company_id TEXT REFERENCES companies(id)`
3. Créer l'index sur `company_id`

## Tests

- La migration s'applique sans erreur
- Les lots existants conservent `company_id = NULL`
