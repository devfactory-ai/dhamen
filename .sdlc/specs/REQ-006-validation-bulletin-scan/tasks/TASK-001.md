---
id: TASK-001
parent: REQ-006
status: done
dependencies: []
files:
  - packages/shared/src/schemas/bulletin-validation.ts
  - packages/shared/src/types/bulletin-validation.ts
  - packages/shared/src/types/index.ts
  - packages/shared/src/schemas/index.ts
---

## Objective

Créer les types et schemas Zod partagés pour la validation de bulletin et l'upload de scan.

## Context

La validation d'un bulletin par l'agent nécessite un schéma de requête (montant final, notes) et un type de réponse standardisé. L'upload de scan nécessite la validation du type MIME et de la taille. Ces types seront réutilisés par l'API et le frontend.

## Acceptance Criteria

- AC1 : schema Zod `validateBulletinSchema` avec champs : `reimbursed_amount` (number, positif), `notes` (string, optionnel)
- AC2 : schema Zod `uploadScanSchema` avec validation du type MIME (JPEG, PNG, PDF) et taille max (10 Mo)
- AC3 : types TypeScript `ValidateBulletinRequest`, `ValidateBulletinResponse`, `ScanUploadResponse` exportés
- AC4 : réexportés depuis les index de `packages/shared`

## Implementation Steps

1. Créer `packages/shared/src/schemas/bulletin-validation.ts` avec les schemas Zod
2. Créer `packages/shared/src/types/bulletin-validation.ts` avec les types inférés
3. Réexporter depuis `packages/shared/src/schemas/index.ts` et `packages/shared/src/types/index.ts`

## Tests

- Schema accepte un montant positif avec notes optionnelles
- Schema rejette un montant négatif ou nul
- Schema rejette un type MIME non supporté
- Les types s'exportent correctement depuis le package shared
