---
id: TASK-003
parent: REQ-002
status: done
dependencies: [TASK-001, TASK-002]
files:
  - apps/api/src/routes/bulletins-agent.ts
---

## Objective

Adapter les routes API des batches pour supporter le filtrage par `companyId` et la création de lots liés à une entreprise.

## Acceptance Criteria

- AC3 : `GET /bulletins-soins/agent/batches?companyId={id}&status=open` retourne les lots ouverts de l'entreprise
- AC4 : `POST /bulletins-soins/agent/batches` accepte `{ name, companyId }` et crée un lot vide lié à l'entreprise
- AC5 : seuls les lots `open` sont retournés par défaut
- Validation Zod sur les entrées
- L'agent ne peut voir que les entreprises de son assureur (vérification `insurer_id`)

## Implementation Steps

1. Modifier `GET /batches` dans `bulletins-agent.ts` :
   - Ajouter query param `companyId` (requis) et `status` (optionnel, défaut `open`)
   - Filtrer par `company_id` dans la requête SQL
   - Vérifier que l'entreprise appartient à l'assureur de l'agent
2. Modifier `POST /batches` dans `bulletins-agent.ts` :
   - Accepter `{ name, companyId }` (sans `bulletinIds` requis)
   - Valider avec `createBatchSchema`
   - Vérifier que l'entreprise appartient à l'assureur de l'agent
   - Insérer avec `company_id`
3. Utiliser les réponses standardisées (`success/error`)

## Tests

- Test : GET batches avec companyId retourne uniquement les lots de cette entreprise
- Test : GET batches sans companyId → 400
- Test : POST batch avec companyId valide → 201
- Test : POST batch avec entreprise d'un autre assureur → 403
