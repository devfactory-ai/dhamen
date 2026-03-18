---
id: TASK-004
parent: REQ-013
status: todo
dependencies:
  - TASK-001
  - TASK-002
  - TASK-003
files:
  - apps/api/wrangler.toml
---

## Objective

Configurer les secrets sensibles (JWT_SECRET, ENCRYPTION_KEY, etc.) pour staging et production via `wrangler secret put`.

## Context

Les secrets ne doivent jamais apparaitre dans `wrangler.toml` (versionne dans git). Ils sont injectes via `wrangler secret put` qui les stocke de maniere chiffree cote Cloudflare. Chaque environnement doit avoir ses propres secrets avec des valeurs distinctes.

## Acceptance Criteria

- AC1 : JWT_SECRET est defini pour staging et production (valeurs distinctes)
- AC2 : ENCRYPTION_KEY est defini pour staging et production (valeurs distinctes)
- AC3 : les secrets optionnels (RESEND_API_KEY, CNAM_API_KEY) sont documentes meme s'ils ne sont pas encore configures
- AC4 : un fichier `docs/secrets-checklist.md` liste tous les secrets requis par environnement
- AC5 : aucun secret n'apparait dans le code source ou dans `wrangler.toml`

## Implementation Steps

1. Generer un JWT_SECRET unique pour staging (256 bits, base64)
2. Executer `wrangler secret put JWT_SECRET --env staging`
3. Executer `wrangler secret put ENCRYPTION_KEY --env staging`
4. Generer un JWT_SECRET unique pour production (256 bits, base64)
5. Executer `wrangler secret put JWT_SECRET --env production`
6. Executer `wrangler secret put ENCRYPTION_KEY --env production`
7. Creer `docs/secrets-checklist.md` listant tous les secrets par environnement

## Validation

- `wrangler secret list --env staging` affiche JWT_SECRET et ENCRYPTION_KEY
- `wrangler secret list --env production` affiche JWT_SECRET et ENCRYPTION_KEY
- `grep -r "JWT_SECRET\|ENCRYPTION_KEY" apps/api/wrangler.toml` ne retourne aucune valeur sensible
