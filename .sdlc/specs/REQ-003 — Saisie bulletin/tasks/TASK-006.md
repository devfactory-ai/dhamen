---
id: TASK-006
parent: REQ-003
status: done
dependencies: [TASK-005]
files:
  - packages/shared/src/schemas/acte-bulletin.ts
  - packages/shared/src/schemas/index.ts
  - apps/api/src/routes/bulletins-agent.ts
---

## Objective

Adapter l'API POST `/bulletins-soins/agent/create` pour accepter un tableau d'actes médicaux et les insérer dans `actes_bulletin`.

## Acceptance Criteria

- AC1 : le endpoint accepte un champ `actes` (JSON array) dans le formulaire
- AC2 : chaque acte est validé (code ou label requis, montant > 0)
- AC3 : les actes sont insérés dans `actes_bulletin` liés au bulletin
- AC4 : `total_amount` du bulletin est calculé comme la somme des montants des actes
- AC5 : au moins un acte requis pour valider le bulletin

## Implementation Steps

1. Créer le schema Zod `acteSchema` dans `packages/shared`
2. Modifier le POST `/create` pour parser et valider le champ `actes`
3. Insérer les actes dans `actes_bulletin` après insertion du bulletin
4. Calculer `total_amount` = somme des montants
