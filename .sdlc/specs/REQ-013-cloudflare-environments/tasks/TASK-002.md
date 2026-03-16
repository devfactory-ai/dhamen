---
id: TASK-002
parent: REQ-013
status: todo
dependencies: []
files:
  - apps/api/wrangler.toml
---

## Objective

Creer les 5 bases D1 multi-tenant pour l'environnement production et remplacer les placeholders dans `wrangler.toml`.

## Context

L'environnement production contient un unique binding `DB` avec un placeholder `REPLACE_WITH_PRODUCTION_D1_ID`. Les 5 bases multi-tenant doivent etre creees et les IDs reels inseres. De plus les bases DB_PLATFORM, DB_STAR, DB_GAT, DB_COMAR, DB_AMI sont totalement absentes de la section production.

## Acceptance Criteria

- AC1 : les 5 bases D1 production existent dans Cloudflare (`dhamen-prod-platform`, `dhamen-prod-star`, `dhamen-prod-gat`, `dhamen-prod-comar`, `dhamen-prod-ami`)
- AC2 : `wrangler.toml` section `[env.production]` contient les 5 bindings multi-tenant avec IDs reels
- AC3 : le placeholder `REPLACE_WITH_PRODUCTION_D1_ID` du binding `DB` est remplace par l'ID reel
- AC4 : aucun placeholder `REPLACE_WITH_*` ne reste dans `wrangler.toml`

## Implementation Steps

1. Executer `wrangler d1 create dhamen-prod-platform`
2. Executer `wrangler d1 create dhamen-prod-star`
3. Executer `wrangler d1 create dhamen-prod-gat`
4. Executer `wrangler d1 create dhamen-prod-comar`
5. Executer `wrangler d1 create dhamen-prod-ami`
6. Executer `wrangler d1 create dhamen-db-production` (pour remplacer le placeholder du binding DB legacy)
7. Mettre a jour tous les `database_id` dans `[env.production]`

## Validation

- `wrangler d1 list` affiche les 5 nouvelles bases production + la base legacy
- `grep -c REPLACE_WITH wrangler.toml` retourne 0
- `wrangler deploy --env production --dry-run` ne retourne pas d'erreur de binding
