---
id: TASK-004
parent: REQ-005
status: done
dependencies: [TASK-001]
files:
  - apps/web/src/features/adherents/hooks/useAdherents.ts
---

## Objective

Enrichir les hooks TanStack Query pour supporter le filtrage par entreprise, la recherche autocomplete et l'historique bulletins.

## Context

Les hooks existants (`useAdherents`, `useAdherent`, `useSearchAdherent`) ne supportent pas le filtrage par `companyId` ni l'historique bulletins. Il faut ajouter ces hooks pour alimenter les nouvelles pages agent.

## Acceptance Criteria

- AC1 : `useAdherents` accepte un param `companyId` optionnel
- AC2 : nouveau hook `useSearchAdherents(query, companyId?)` pour l'autocomplete (min 2 chars)
- AC3 : nouveau hook `useAdherentBulletins(adherentId, page, limit)` pour l'historique
- AC4 : les queryKeys sont cohérentes pour le cache invalidation

## Implementation Steps

1. Modifier `useAdherents` pour accepter et passer `companyId` à l'API
2. Créer `useSearchAdherents` appelant GET `/adherents/search?q=X`
3. Créer `useAdherentBulletins` appelant GET `/adherents/:id/bulletins`
4. Exporter les nouveaux hooks depuis le fichier

## Tests

- `useAdherents` avec companyId passe le param dans la requête
- `useSearchAdherents` ne s'exécute pas si query < 2 chars (enabled: false)
- `useAdherentBulletins` retourne les bulletins paginés
