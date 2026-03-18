---
id: TASK-006
parent: REQ-013
status: todo
dependencies:
  - TASK-001
  - TASK-003
  - TASK-005
files:
  - scripts/seed-tenant-registry.sh
---

## Objective

Creer un script pour peupler le KV namespace TENANT_REGISTRY de chaque environnement avec la configuration des 4 tenants (STAR, GAT, COMAR, AMI).

## Context

Le middleware `tenant-resolver.ts` lit la configuration tenant depuis le KV namespace TENANT_REGISTRY. Chaque tenant doit avoir une entree JSON contenant : tenantId, code, name, subdomain, databaseBinding, status. Sans ce seed, le tenant resolver ne peut pas resoudre les sous-domaines vers les bases D1.

## Acceptance Criteria

- AC1 : le script accepte un parametre `--env` (dev, staging, production)
- AC2 : les 4 tenants (STAR, GAT, COMAR, AMI) sont inseres dans le TENANT_REGISTRY de l'environnement cible
- AC3 : chaque entree KV contient un JSON valide avec les champs : tenantId, code, name, subdomain, databaseBinding, status
- AC4 : le script est idempotent (peut etre re-execute sans duplication)

## Implementation Steps

1. Creer `scripts/seed-tenant-registry.sh`
2. Definir les 4 tenants en JSON (STAR → DB_STAR, GAT → DB_GAT, COMAR → DB_COMAR, AMI → DB_AMI)
3. Pour chaque tenant, executer `wrangler kv key put "tenant:<code>" '<json>' --namespace-id <ID> --env <ENV>`
4. Ajouter une entree index `wrangler kv key put "tenants:list" '["STAR","GAT","COMAR","AMI"]'`
5. Rendre le script executable

## Validation

- `wrangler kv key get "tenant:STAR" --namespace-id <staging-id>` retourne le JSON du tenant STAR
- `wrangler kv key get "tenants:list" --namespace-id <staging-id>` retourne la liste des 4 codes
- Re-execution du script ne cree pas de doublons
