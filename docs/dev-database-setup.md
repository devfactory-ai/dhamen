# Dev Database Setup

## Overview

The dev environment uses 6 D1 databases (multi-tenant architecture):

| Binding | Database Name | Purpose |
|---------|--------------|---------|
| DB | dhamen-db | Legacy single DB |
| DB_PLATFORM | dhamen-platform | Platform registry, super admin |
| DB_STAR | dhamen-star | STAR Assurances tenant |
| DB_GAT | dhamen-gat | GAT Assurances tenant |
| DB_COMAR | dhamen-comar | COMAR tenant |
| DB_AMI | dhamen-ami | AMI Assurances tenant |

## Worker URL

```
https://dhamen-api-dev.yassine-techini.workers.dev
```

## How Migrations Were Applied

All migrations are in `packages/db/migrations/` (86 files: 0001 to 0086).

Apply to all 6 databases:

```bash
cd apps/api
for DB in dhamen-db dhamen-platform dhamen-star dhamen-gat dhamen-comar dhamen-ami; do
  npx wrangler d1 migrations apply "$DB" --env dev --remote
done
```

Check migration status:

```bash
CLOUDFLARE_ACCOUNT_ID=6435a77d3ce17b7de468c6618e7b2b14 \
  npx wrangler d1 migrations list "dhamen-gat" --env dev --remote
```

## Test Data Summary

Data exists identically across all 6 tenant databases:

### Users (33-36 per DB)

| Email | Password | Role | Tenant |
|-------|----------|------|--------|
| admin@dhamen.tn | Password123! | ADMIN | any |
| admin@star.com.tn | Password123! | INSURER_ADMIN | STAR |
| admin@gat.com.tn | Password123! | INSURER_ADMIN | GAT |
| admin@comar.com.tn | Password123! | INSURER_ADMIN | COMAR |
| admin@ami.com.tn | Password123! | INSURER_ADMIN | AMI |
| agent.star@email.tn | Password123! | INSURER_AGENT | STAR |
| agent.gat@email.tn | Password123! | INSURER_AGENT | GAT |
| agent.comar@email.tn | Password123! | INSURER_AGENT | COMAR |
| pharmacie.pasteur@dhamen.tn | Password123! | PHARMACIST | any |
| dr.benali@dhamen.tn | Password123! | DOCTOR | any |

### Companies (5)

| Company | Insurer | Code |
|---------|---------|------|
| Tunisie Telecom | STAR | TT |
| BIAT | GAT | BIAT |
| Groupe Poulina | COMAR | POU |
| Clinique les Oliviers | AMI | OLI |
| Carrefour Tunisie | STAR | CAR |

### Adherents (30 per DB)

- 20 adherents principaux (code_type = 'A') with matricules
- 10 ayants-droit: 4 conjoints (code_type = 'C') + 6 enfants (code_type = 'E')

### Other Data

- 4 insurers (STAR, GAT, COMAR, AMI)
- 12 providers (pharmacies, doctors, labs, clinics)
- 20-40 bulletins_soins per DB
- Contrat baremes and familles d'actes

## How to Import/Reset Test Data

### Reset Password Hashes (all users to Password123!)

```bash
HASH='$pbkdf2$100000$EEleqOw1cOzGOkvmhy/cZQ==$bNyLTEip7trKXM+kYpujDoNYjdapsVWKWdAarxKVipg='
for DB in dhamen-db dhamen-platform dhamen-star dhamen-gat dhamen-comar dhamen-ami; do
  npx wrangler d1 execute "$DB" --env dev --remote \
    --command "UPDATE users SET password_hash = '$HASH', updated_at = datetime('now') WHERE is_active = 1;"
done
```

### Full Database Reset

To completely reset a dev database and re-apply all migrations:

```bash
# 1. Drop all tables (DESTRUCTIVE - dev only!)
DB_NAME="dhamen-gat"
TABLES=$(npx wrangler d1 execute "$DB_NAME" --env dev --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' AND name != 'sqlite_sequence';" \
  --json 2>/dev/null | python3 -c "
import sys, json
results = json.load(sys.stdin)[0]['results']
for t in results:
    print(t['name'])
")

for TABLE in $TABLES; do
  npx wrangler d1 execute "$DB_NAME" --env dev --remote \
    --command "DROP TABLE IF EXISTS $TABLE;"
done

# 2. Clear migration tracking
npx wrangler d1 execute "$DB_NAME" --env dev --remote \
  --command "DELETE FROM d1_migrations;"

# 3. Re-apply all migrations
npx wrangler d1 migrations apply "$DB_NAME" --env dev --remote
```

## How to Verify the API Works

### 1. Health Check

```bash
curl -s https://dhamen-api-dev.yassine-techini.workers.dev/api/v1/health | python3 -m json.tool
```

Expected: `status: "healthy"`, database/cache/storage all `ok`.

### 2. Authentication

```bash
cat > /tmp/login.json << 'EOF'
{"email":"admin@star.com.tn","password":"Password123!"}
EOF

curl -s 'https://dhamen-api-dev.yassine-techini.workers.dev/api/v1/auth/login' \
  -H 'Content-Type: application/json' \
  -H 'X-Tenant-Code: STAR' \
  -d @/tmp/login.json
```

Expected: `success: true` with JWT tokens.

### 3. Adherents

```bash
TOKEN="<access_token_from_login>"
curl -s "https://dhamen-api-dev.yassine-techini.workers.dev/api/v1/adherents?companyId=01JCVMKC3AP2N3X4Y5Z6A7B8C9" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Code: STAR"
```

### 4. Data Count Verification

```bash
for DB in dhamen-db dhamen-platform dhamen-star dhamen-gat dhamen-comar dhamen-ami; do
  echo "=== $DB ==="
  npx wrangler d1 execute "$DB" --env dev --remote \
    --command "SELECT
      (SELECT COUNT(*) FROM users) as users,
      (SELECT COUNT(*) FROM adherents) as adherents,
      (SELECT COUNT(*) FROM companies) as companies,
      (SELECT COUNT(*) FROM insurers) as insurers,
      (SELECT COUNT(*) FROM bulletins_soins) as bulletins,
      (SELECT COUNT(*) FROM providers) as providers;"
done
```

Expected counts per database:
- users: 33-36
- adherents: 30
- companies: 5
- insurers: 4
- bulletins: 20-40
- providers: 12

## Deploying

```bash
cd apps/api
wrangler deploy --env dev
```

## Secrets

Required secrets (set via `wrangler secret put --env dev`):
- `JWT_SECRET`
- `ENCRYPTION_KEY`

Check: `wrangler secret list --env dev`
