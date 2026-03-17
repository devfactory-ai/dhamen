# Deployment Guide — Dhamen API

## Branch Strategy

| Branch | Environment | Worker Name | Auto-deploy |
|--------|-------------|-------------|-------------|
| `develop` | dev | `dhamen-api-dev` | Yes (current) |
| `staging` | staging | `dhamen-api-staging` | Yes (current) |
| `main` | production | `dhamen-api` | Not yet |

## Environments

### Dev (active)

- **Branch**: `develop`
- **Worker**: `dhamen-api-dev`
- **D1 databases**: `dhamen-db`, `dhamen-platform`, `dhamen-star`, `dhamen-gat`, `dhamen-comar`, `dhamen-ami`
- **KV**: `CACHE`, `TENANT_REGISTRY`
- **R2**: `dhamen-files`
- **Status**: fully configured, ready to deploy

### Staging (configured, not deployed)

- **Branch**: `staging`
- **Worker**: `dhamen-api-staging`
- **Status**: wrangler.toml configured with placeholder IDs for multi-tenant D1 and TENANT_REGISTRY KV
- **Before first deploy**: create D1 databases and KV namespaces, replace placeholder IDs in `wrangler.toml`

### Production (configured, not deployed)

- **Branch**: `main`
- **Worker**: `dhamen-api`
- **Status**: wrangler.toml configured with placeholder IDs for all resources
- **Before first deploy**: create all resources, set secrets via `wrangler secret put`

## Commands

### Local development

```bash
pnpm dev --filter api          # Start local dev server on port 8787
pnpm db:migrate --filter api   # Apply migrations to local D1
```

### Deploy to dev

```bash
cd apps/api
pnpm deploy:dev
# or directly:
wrangler deploy --env dev
```

### Deploy to staging (when ready)

```bash
cd apps/api
pnpm deploy:staging
# or directly:
wrangler deploy --env staging
```

### Deploy to production (when ready)

```bash
cd apps/api
pnpm deploy:prod
# or directly:
wrangler deploy --env production
```

### Claude Code deployment

Claude Code can deploy to dev by running:

```bash
cd apps/api && wrangler deploy --env dev
```

Claude Code must NOT deploy to staging or production without explicit user approval.

## Setting Up Staging (when ready)

1. Create multi-tenant D1 databases:

```bash
wrangler d1 create dhamen-staging-platform
wrangler d1 create dhamen-staging-star
wrangler d1 create dhamen-staging-gat
wrangler d1 create dhamen-staging-comar
wrangler d1 create dhamen-staging-ami
```

2. Create TENANT_REGISTRY KV:

```bash
wrangler kv namespace create TENANT_REGISTRY --env staging
```

3. Replace all `REPLACE_WITH_STAGING_*` placeholders in `wrangler.toml` with the real IDs

4. Set secrets:

```bash
wrangler secret put JWT_SECRET --env staging
wrangler secret put ENCRYPTION_KEY --env staging
```

5. Deploy:

```bash
wrangler deploy --env staging
```

## Setting Up Production (when ready)

1. Create all D1 databases:

```bash
wrangler d1 create dhamen-db-production
wrangler d1 create dhamen-prod-platform
wrangler d1 create dhamen-prod-star
wrangler d1 create dhamen-prod-gat
wrangler d1 create dhamen-prod-comar
wrangler d1 create dhamen-prod-ami
```

2. Create KV namespaces:

```bash
wrangler kv namespace create CACHE --env production
wrangler kv namespace create TENANT_REGISTRY --env production
```

3. Replace all `REPLACE_WITH_PRODUCTION_*` placeholders in `wrangler.toml`

4. Set secrets:

```bash
wrangler secret put JWT_SECRET --env production
wrangler secret put ENCRYPTION_KEY --env production
```

5. Deploy:

```bash
wrangler deploy --env production
```

## Secrets Checklist

| Secret | Dev | Staging | Production |
|--------|-----|---------|------------|
| JWT_SECRET | set | pending | pending |
| ENCRYPTION_KEY | set | pending | pending |
| RESEND_API_KEY | optional | pending | pending |
| CNAM_API_KEY | optional | pending | pending |
