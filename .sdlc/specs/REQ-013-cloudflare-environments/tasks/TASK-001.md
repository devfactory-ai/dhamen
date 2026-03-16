---
id: TASK-001
parent: REQ-013
status: todo
dependencies: []
files:
  - apps/api/wrangler.toml
---

## Objective

Creer les 5 bases D1 multi-tenant pour l'environnement staging et mettre a jour `wrangler.toml` avec les IDs reels.

## Context

L'environnement staging ne dispose que d'une seule base D1 legacy (`dhamen-db-staging`, binding `DB`). Il manque les 5 bases multi-tenant (DB_PLATFORM, DB_STAR, DB_GAT, DB_COMAR, DB_AMI) necessaires au tenant resolver. Sans ces bases, le staging ne peut pas tester le fonctionnement multi-tenant.

## Acceptance Criteria

- AC1 : les 5 bases D1 staging existent dans Cloudflare (`dhamen-staging-platform`, `dhamen-staging-star`, `dhamen-staging-gat`, `dhamen-staging-comar`, `dhamen-staging-ami`)
- AC2 : `wrangler.toml` section `[env.staging]` contient les 5 bindings `[[env.staging.d1_databases]]` avec les IDs reels
- AC3 : la base legacy `DB` reste presente pour retrocompatibilite
- AC4 : chaque binding pointe vers `migrations_dir = "../../packages/db/migrations"`

## Implementation Steps

1. Executer `wrangler d1 create dhamen-staging-platform`
2. Executer `wrangler d1 create dhamen-staging-star`
3. Executer `wrangler d1 create dhamen-staging-gat`
4. Executer `wrangler d1 create dhamen-staging-comar`
5. Executer `wrangler d1 create dhamen-staging-ami`
6. Noter les database_id retournes par chaque commande
7. Ajouter les 5 blocs `[[env.staging.d1_databases]]` dans `wrangler.toml`

## Validation

- `wrangler d1 list` affiche les 5 nouvelles bases staging
- `wrangler deploy --env staging --dry-run` ne retourne pas d'erreur de binding manquant
