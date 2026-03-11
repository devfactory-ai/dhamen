---
id: TASK-002
parent: REQ-002
status: draft
dependencies: []
files:
  - packages/shared/src/schemas/bulletin-batch.ts
  - packages/shared/src/types/bulletin-batch.ts
  - packages/shared/src/schemas/index.ts
  - packages/shared/src/types/index.ts
---

## Objective

Créer les schemas Zod et types TypeScript pour les bulletin batches (création de lot avec company_id).

## Acceptance Criteria

- Schema `createBatchSchema` valide `{ name: string, companyId: string }`
- Schema `batchFilterSchema` valide `{ companyId: string, status?: 'open' | 'closed' | 'exported' }`
- Type `BulletinBatch` avec id, name, status, companyId, createdBy, createdAt
- Schemas et types exportés depuis `packages/shared`

## Implementation Steps

1. Créer `packages/shared/src/schemas/bulletin-batch.ts` avec les schemas Zod
2. Créer `packages/shared/src/types/bulletin-batch.ts` avec les types inférés
3. Exporter depuis les fichiers index

## Tests

- Test : `createBatchSchema` rejette un name vide
- Test : `createBatchSchema` rejette un companyId manquant
- Test : `createBatchSchema` accepte des données valides
- Test : `batchFilterSchema` accepte un filtre par companyId + status
