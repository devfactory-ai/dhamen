---
id: TASK-002
parent: REQ-003
status: todo
dependencies: [TASK-001]
files:
  - apps/api/src/routes/bulletins-agent.ts
---

## Objective

Modifier le endpoint POST `/bulletins-soins/agent/create` pour accepter `batch_id` et l'insérer dans la table `bulletins_soins`.

## Acceptance Criteria

- AC1 : le endpoint accepte un champ optionnel `batch_id` dans le formulaire
- AC2 : si `batch_id` est fourni, le bulletin est inséré avec `batch_id` et statut `in_batch`
- AC3 : si `batch_id` est absent, le bulletin est inséré avec statut `draft` (comportement actuel)
- AC4 : validation que le batch existe et appartient à l'agent

## Implementation Steps

1. Extraire `batch_id` du formData
2. Si fourni, vérifier que le batch existe, est `open`, et appartient à l'agent
3. Ajouter `batch_id` dans le INSERT et adapter le statut
