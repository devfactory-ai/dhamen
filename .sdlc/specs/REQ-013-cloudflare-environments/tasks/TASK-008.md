---
id: TASK-008
parent: REQ-013
status: todo
dependencies:
  - TASK-007
files:
  - .github/workflows/deploy-production.yml
---

## Objective

Creer le workflow GitHub Actions pour le deploiement vers production sur merge dans `main`, avec approbation manuelle obligatoire.

## Context

Le deploiement en production doit etre controle et ne pas se declencher automatiquement sans validation humaine. GitHub Environments avec protection rules permet d'exiger une approbation avant l'execution du job de deploiement.

## Acceptance Criteria

- AC1 : le workflow se declenche sur push vers la branche `main`
- AC2 : le deploiement requiert une approbation manuelle via GitHub Environment protection rules
- AC3 : le pipeline execute : install → migrate D1 (production) → deploy Worker (production)
- AC4 : le deploiement utilise `wrangler deploy --env production`
- AC5 : le GitHub Environment `production` est configure avec au moins 1 reviewer requis

## Implementation Steps

1. Creer `.github/workflows/deploy-production.yml`
2. Trigger : `on: push: branches: [main]`
3. Job `deploy` avec `environment: production` (active les protection rules)
4. Steps similaires a staging mais avec `--env production`
5. Configurer le GitHub Environment `production` :
   - Settings → Environments → New environment → `production`
   - Activer "Required reviewers" avec au moins 1 approbateur
   - Ajouter les secrets specifiques a la production
6. Utiliser les memes secrets Cloudflare que staging (ou des tokens dedies si souhaite)

## Validation

- Push vers `main` declenche le workflow mais le job attend l'approbation
- Apres approbation, le deploiement s'execute avec succes
- Sans approbation, le deploiement reste en attente indefiniment
- Le Worker production est accessible apres deploiement reussi
