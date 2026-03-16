# Cloudflare Environments Architecture

## Environments

dev
staging
prod

---

## Deployment Flow

developer
↓
commit
↓
Claude Code
↓
wrangler deploy
↓
Cloudflare Workers

---

## Configuration

Chaque environnement possède :

- son worker
- sa base D1
- son R2
- ses variables d'environnement

---

## Exemple wrangler

wrangler deploy --env dev

wrangler deploy --env staging

wrangler deploy --env prod