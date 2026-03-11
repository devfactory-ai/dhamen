---
id: TASK-004
parent: REQ-003
status: done
dependencies: [TASK-002, TASK-003]
files:
  - apps/web/src/features/bulletins/pages/BulletinsSaisiePage.tsx
---

## Objective

Connecter la page `BulletinsSaisiePage` au contexte agent (entreprise + lot sélectionnés) et envoyer le `batch_id` lors de la création d'un bulletin.

## Acceptance Criteria

- AC1 : la page affiche l'entreprise et le lot actif en en-tête avec un lien pour changer
- AC2 : le formulaire de création envoie `batch_id` du lot sélectionné au POST `/create`
- AC3 : la liste des bulletins est filtrée par le lot actif (query param `batchId`)
- AC4 : les requêtes GET batches passent le `companyId` du contexte
- AC5 : après soumission réussie, le bulletin apparaît dans la liste avec statut `in_batch`

## Implementation Steps

1. Importer `useAgentContext` dans `BulletinsSaisiePage`
2. Afficher un bandeau en-tête avec entreprise + lot sélectionnés
3. Ajouter `batch_id` dans le FormData envoyé au submit
4. Passer `companyId` dans les requêtes de listing batches
5. Filtrer les bulletins par batch actif si pertinent
