---
id: TASK-002
parent: REQ-001
status: done
dependencies: []
files:
  - packages/shared/src/schemas/auth.ts
  - packages/shared/src/types/auth.ts
  - packages/shared/src/index.ts
---

## Objective

Définir les schemas Zod de validation et les types TypeScript pour le flux d'authentification agent (login request/response).

## Acceptance Criteria

- Schema Zod `loginRequestSchema` valide `{ email, password }` avec contraintes (email valide, password non vide)
- Schema Zod `loginResponseSchema` valide `{ success, data: { token } }`
- Types TypeScript `LoginRequest` et `LoginResponse` inférés depuis les schemas
- Schemas et types exportés depuis `packages/shared`

## Implementation Steps

1. Créer `packages/shared/src/schemas/auth.ts` avec :
   - `loginRequestSchema` : `email` (z.string().email()), `password` (z.string().min(1))
   - `loginResponseSchema` : réponse standardisée avec `token`
2. Créer `packages/shared/src/types/auth.ts` avec les types inférés (`z.infer`)
3. Exporter depuis `packages/shared/src/index.ts`

## Tests

- Test unitaire : `loginRequestSchema` rejette un email invalide
- Test unitaire : `loginRequestSchema` rejette un mot de passe vide
- Test unitaire : `loginRequestSchema` accepte des données valides
