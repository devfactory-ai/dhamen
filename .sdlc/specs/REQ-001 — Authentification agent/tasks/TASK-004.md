---
id: TASK-004
parent: REQ-001
status: done
dependencies: [TASK-003]
files:
  - apps/api/src/middleware/auth.ts
  - apps/api/src/middleware/auth.test.ts
---

## Objective

Vérifier et renforcer le middleware d'authentification pour protéger les routes API avec un token JWT valide. S'assurer que les routes protégées rejettent les requêtes sans token ou avec un token invalide.

## Acceptance Criteria

- AC3 : l'accès aux routes API protégées nécessite un token JWT valide dans le header `Authorization: Bearer <token>`
- Requête sans token → 401 avec code `MISSING_TOKEN`
- Requête avec token expiré ou invalide → 401 avec code `INVALID_TOKEN`
- Le middleware injecte les infos de l'agent (`id`, `role`, `insurerId`) dans le contexte Hono
- Les routes protégées ont accès au contexte utilisateur via `c.get('user')`

## Implementation Steps

1. Vérifier/compléter `apps/api/src/middleware/auth.ts` :
   - Extraire le token du header `Authorization`
   - Vérifier le JWT via `lib/jwt.ts`
   - Injecter `{ id, role, insurerId }` dans le contexte Hono
   - Retourner 401 si absent ou invalide
2. Écrire les tests unitaires du middleware
3. Vérifier que le middleware est appliqué sur les routes protégées dans `apps/api/src/index.ts`

## Tests

- Test : requête sans header Authorization → 401 MISSING_TOKEN
- Test : requête avec token invalide → 401 INVALID_TOKEN
- Test : requête avec token expiré → 401 INVALID_TOKEN
- Test : requête avec token valide → next() appelé + contexte user disponible
