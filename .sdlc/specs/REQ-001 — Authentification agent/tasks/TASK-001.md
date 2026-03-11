---
id: TASK-001
parent: REQ-001
status: done
dependencies: []
files:
  - packages/db/src/migrations/0065_create_agents.sql
  - packages/db/src/queries/agents.ts
  - packages/db/src/index.ts
---

## Objective

Créer la table `agents` en base D1 et les queries associées pour stocker les comptes des agents d'assurance.

## Acceptance Criteria

- La migration crée la table `agents` avec les colonnes : `id` (ULID), `email` (unique), `password_hash`, `insurer_id` (FK), `created_at`, `updated_at`, `deleted_at`
- Les queries `findAgentByEmail` et `createAgent` sont implémentées et exportées
- La migration est idempotente (IF NOT EXISTS)

## Implementation Steps

1. Créer `packages/db/src/migrations/0065_create_agents.sql` avec la DDL de la table `agents`
2. Créer `packages/db/src/queries/agents.ts` avec les fonctions :
   - `findAgentByEmail(db, email)` → retourne l'agent ou null
   - `createAgent(db, { email, passwordHash, insurerId })` → insère un agent
3. Exporter les queries depuis `packages/db/src/index.ts`

## Tests

- Test unitaire : `findAgentByEmail` retourne `null` si l'agent n'existe pas
- Test unitaire : `createAgent` insère correctement un agent
- Test unitaire : contrainte d'unicité sur `email`
