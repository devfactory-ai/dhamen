---
id: TASK-005
parent: REQ-013
status: todo
dependencies:
  - TASK-001
  - TASK-002
files:
  - scripts/migrate-all.sh
---

## Objective

Creer un script `scripts/migrate-all.sh` qui execute les migrations D1 sur toutes les bases d'un environnement donne (5 bases multi-tenant + 1 base legacy).

## Context

Wrangler `d1 migrations apply` ne supporte qu'une seule base a la fois. Avec 6 bases D1 par environnement (DB, DB_PLATFORM, DB_STAR, DB_GAT, DB_COMAR, DB_AMI), appliquer les migrations manuellement est fastidieux et source d'erreurs. Un script centralise est necessaire pour le developpement local et le pipeline CI/CD.

## Acceptance Criteria

- AC1 : le script accepte un parametre `--env` (dev, staging, production)
- AC2 : le script execute les migrations sur les 6 bases D1 de l'environnement cible
- AC3 : le script affiche le nom de chaque base avant d'executer ses migrations
- AC4 : le script echoue immediatement (fail fast) si une migration echoue sur une base
- AC5 : le script retourne un code de sortie 0 en cas de succes total, 1 en cas d'echec

## Implementation Steps

1. Creer `scripts/migrate-all.sh` avec `#!/bin/bash` et `set -e`
2. Parser le parametre `--env` avec valeur par defaut `dev`
3. Definir la liste des bases : DB, DB_PLATFORM, DB_STAR, DB_GAT, DB_COMAR, DB_AMI
4. Boucler sur chaque base et executer `npx wrangler d1 migrations apply <DB_NAME> --env <ENV>`
5. Ajouter un `chmod +x scripts/migrate-all.sh`
6. Documenter l'usage dans le header du script

## Validation

- `./scripts/migrate-all.sh --env dev` execute les migrations sur les 6 bases dev sans erreur
- Le script echoue si wrangler n'est pas installe ou si un nom de base est invalide
- `echo $?` retourne 0 apres une execution reussie
