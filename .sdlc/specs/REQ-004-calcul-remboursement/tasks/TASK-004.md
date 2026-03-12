---
id: TASK-004
parent: REQ-004
status: done
dependencies: [TASK-001, TASK-002, TASK-003]
files:
  - apps/api/src/services/remboursement.service.ts
  - packages/shared/src/types/remboursement.ts
  - packages/shared/src/schemas/remboursement.ts
---

## Objective

Créer le service de calcul de remboursement : logique métier centralisée, types et schemas Zod partagés.

## Context

La règle de calcul définie dans REQ-000 et REQ-004 :
- `remboursement_brut = montant_acte × taux_remboursement`
- `remboursement_final = min(remboursement_brut, plafond_restant)`

Le service doit traiter un **bulletin de soins** contenant une liste d'**actes médicaux**, en respectant le **plafond annuel** de l'**adhérent**. Le calcul est purement fonctionnel (pas d'accès DB).

## Acceptance Criteria

- AC1 : type `RemboursementActeResult` dans `packages/shared/src/types/remboursement.ts` avec `{ montantActe, tauxRemboursement, remboursementBrut, remboursementFinal, plafondDepasse }`
- AC2 : type `RemboursementBulletinResult` avec `{ actes: RemboursementActeResult[], totalRembourse, plafondRestantApres }`
- AC3 : schema Zod de validation dans `packages/shared/src/schemas/remboursement.ts`
- AC4 : fonction `calculateRemboursementActe(montant, taux, plafondRestant)` retourne un `RemboursementActeResult`
- AC5 : fonction `calculateRemboursementBulletin(actes[], plafondRestant)` itère sur les actes, décrémente le plafond progressivement, retourne un `RemboursementBulletinResult`
- AC6 : le calcul est déterministe — même entrées = même sorties (AC4 du requirement)

## Implementation Steps

1. Créer `packages/shared/src/types/remboursement.ts`
2. Créer `packages/shared/src/schemas/remboursement.ts`
3. Créer `apps/api/src/services/remboursement.service.ts`
