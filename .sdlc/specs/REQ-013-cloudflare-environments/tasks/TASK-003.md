---
id: TASK-003
parent: REQ-013
status: todo
dependencies: []
files:
  - apps/api/wrangler.toml
---

## Objective

Creer le KV namespace TENANT_REGISTRY manquant pour staging et production, et verifier/corriger le KV CACHE de production.

## Context

Le KV namespace `TENANT_REGISTRY` n'existe que pour l'environnement dev. Il est absent de staging et production. Ce namespace est critique car le middleware `tenant-resolver.ts` y stocke et lit la configuration de chaque tenant (subdomain → DB binding). Le KV `CACHE` de production a egalement un placeholder ID.

## Acceptance Criteria

- AC1 : KV namespace `TENANT_REGISTRY` existe pour staging avec son ID dans `wrangler.toml`
- AC2 : KV namespace `TENANT_REGISTRY` existe pour production avec son ID dans `wrangler.toml`
- AC3 : KV namespace `CACHE` de production a un ID reel (plus de placeholder)
- AC4 : chaque environnement a exactement 2 KV bindings (CACHE + TENANT_REGISTRY)

## Implementation Steps

1. Executer `wrangler kv namespace create TENANT_REGISTRY` pour staging
2. Executer `wrangler kv namespace create TENANT_REGISTRY` pour production
3. Creer le KV CACHE production si le placeholder n'est pas encore remplace
4. Ajouter `[[env.staging.kv_namespaces]]` binding TENANT_REGISTRY dans `wrangler.toml`
5. Ajouter `[[env.production.kv_namespaces]]` binding TENANT_REGISTRY dans `wrangler.toml`
6. Remplacer `REPLACE_WITH_PRODUCTION_KV_ID` par l'ID reel du CACHE production

## Validation

- `wrangler kv namespace list` affiche les namespaces TENANT_REGISTRY pour les 3 envs
- `wrangler deploy --env staging --dry-run` ne signale pas de binding KV manquant
- `wrangler deploy --env production --dry-run` ne signale pas de binding KV manquant
