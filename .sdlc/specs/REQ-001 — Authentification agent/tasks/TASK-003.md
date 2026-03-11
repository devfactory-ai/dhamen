---
id: TASK-003
parent: REQ-001
status: done
dependencies: [TASK-001, TASK-002]
files:
  - apps/api/src/routes/auth.ts
  - apps/api/src/routes/auth.test.ts
---

## Objective

Implémenter l'endpoint `POST /api/v1/auth/login` qui authentifie un agent par email/mot de passe et retourne un token JWT.

## Acceptance Criteria

- AC1 : un agent peut se connecter avec email + mot de passe valides → 200 + token JWT
- AC2 : le token JWT contient `sub` (agent id), `role` (INSURER_AGENT), `insurerId`, et `exp`
- AC4 : identifiants incorrects → 401 avec code erreur `INVALID_CREDENTIALS`
- La route utilise `loginRequestSchema` pour valider l'entrée
- Le mot de passe est vérifié via `apps/api/src/lib/password.ts`
- Le JWT est signé via `apps/api/src/lib/jwt.ts`

## Implementation Steps

1. Ajouter/modifier la route `POST /login` dans `apps/api/src/routes/auth.ts`
2. Valider le body avec `loginRequestSchema`
3. Chercher l'agent par email via `findAgentByEmail`
4. Vérifier le mot de passe avec `verifyPassword` de `lib/password.ts`
5. Si invalide → retourner `{ success: false, error: { code: 'INVALID_CREDENTIALS', message } }` avec status 401
6. Si valide → générer un JWT avec `lib/jwt.ts` contenant `sub`, `role`, `insurerId`
7. Retourner `{ success: true, data: { token } }` avec status 200

## Tests

- Test : login avec identifiants valides → 200 + token JWT valide
- Test : login avec email inexistant → 401
- Test : login avec mauvais mot de passe → 401
- Test : login avec body invalide (email manquant) → 400
