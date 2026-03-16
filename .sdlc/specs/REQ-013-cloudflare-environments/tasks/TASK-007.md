---
id: TASK-007
parent: REQ-013
status: todo
dependencies:
  - TASK-001
  - TASK-002
  - TASK-003
  - TASK-004
  - TASK-005
files:
  - .github/workflows/deploy-staging.yml
---

## Objective

Creer le workflow GitHub Actions pour le deploiement automatique vers staging sur merge dans `develop`.

## Context

Aucun pipeline CI/CD n'existe actuellement. Le deploiement vers staging doit etre automatise pour garantir que chaque merge dans `develop` est deploye et teste. Le pipeline doit executer les migrations D1 avant le deploiement du Worker.

## Acceptance Criteria

- AC1 : le workflow se declenche sur push vers la branche `develop`
- AC2 : le pipeline execute dans l'ordre : install → lint → test → migrate D1 → deploy Worker
- AC3 : les migrations D1 sont appliquees sur les 6 bases staging via `scripts/migrate-all.sh`
- AC4 : le deploiement utilise `wrangler deploy --env staging`
- AC5 : les secrets Cloudflare (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID) sont lus depuis GitHub Secrets
- AC6 : le statut du deploiement est visible dans GitHub (check sur le commit)

## Implementation Steps

1. Creer `.github/workflows/deploy-staging.yml`
2. Trigger : `on: push: branches: [develop]`
3. Job `deploy` avec steps :
   - `actions/checkout@v4`
   - `pnpm/action-setup` + `actions/setup-node`
   - `pnpm install`
   - `pnpm lint` (optionnel, peut etre un job separe)
   - `pnpm test` (optionnel, peut etre un job separe)
   - `chmod +x scripts/migrate-all.sh && ./scripts/migrate-all.sh --env staging`
   - `npx wrangler deploy --env staging`
4. Configurer les secrets : CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
5. Utiliser `cloudflare/wrangler-action@v3` si preferable

## Validation

- Push vers `develop` declenche le workflow dans l'onglet Actions de GitHub
- Le Worker staging est accessible apres deploiement reussi
- Un echec de migration bloque le deploiement du Worker
