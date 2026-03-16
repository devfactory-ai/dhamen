---
id: TASK-009
parent: REQ-013
status: todo
dependencies:
  - TASK-001
  - TASK-002
  - TASK-003
  - TASK-005
  - TASK-006
files:
  - apps/api/wrangler.toml
  - apps/api/src/middleware/tenant-resolver.ts
---

## Objective

Deployer et valider le fonctionnement multi-tenant de staging et production en executant les migrations, le seed KV, et un deploiement de test.

## Context

Apres creation des ressources (TASK-001 a TASK-006), il faut valider que l'ensemble fonctionne de bout en bout : les migrations passent sur toutes les bases, le tenant resolver resout les tenants, et les endpoints API repondent correctement.

## Acceptance Criteria

- AC1 : `./scripts/migrate-all.sh --env staging` s'execute sans erreur sur les 6 bases
- AC2 : `./scripts/seed-tenant-registry.sh --env staging` insere les 4 tenants
- AC3 : `wrangler deploy --env staging` deploie le Worker sans erreur
- AC4 : une requete GET vers `https://dhamen-api-staging.<account>.workers.dev/api/v1/health` retourne 200
- AC5 : une requete avec header `X-Tenant-Code: STAR` utilise la base DB_STAR staging
- AC6 : les memes validations passent pour production (apres deploiement)

## Implementation Steps

1. Executer `./scripts/migrate-all.sh --env staging`
2. Executer `./scripts/seed-tenant-registry.sh --env staging`
3. Executer `wrangler deploy --env staging`
4. Tester le health check endpoint
5. Tester avec `curl -H "X-Tenant-Code: STAR"` un endpoint qui lit en base
6. Verifier dans les logs Cloudflare que le bon tenant est resolu
7. Repeter les etapes 1-6 pour production (apres approbation)

## Validation

- Le Worker staging repond sur son URL workers.dev
- Chaque tenant est resolu correctement via header X-Tenant-Code
- Les donnees de chaque tenant sont isolees (insert dans STAR non visible dans GAT)
- Les logs Cloudflare montrent le bon `tenantDb` utilise
