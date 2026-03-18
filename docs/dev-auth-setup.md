# Dev Environment Auth Setup

## Prerequisites

- `wrangler` CLI installed
- Cloudflare account authenticated (`wrangler login`)

## Worker URL

https://dhamen-api-dev.yassine-techini.workers.dev

## Secrets

The dev Worker requires these secrets (set via `wrangler secret put`):

```bash
wrangler secret put JWT_SECRET --env dev
wrangler secret put ENCRYPTION_KEY --env dev
```

## Applying Migrations

Migrations must be applied to all 6 D1 databases:

```bash
cd apps/api

# All databases at once
for DB in dhamen-db dhamen-platform dhamen-star dhamen-gat dhamen-comar dhamen-ami; do
  npx wrangler d1 migrations apply "$DB" --env dev --remote
done
```

## Test Users

All dev users share the same password: `Password123!`

| Email | Role | Tenant |
|-------|------|--------|
| admin@dhamen.tn | ADMIN | any |
| admin@star.com.tn | INSURER_ADMIN | STAR |
| admin@gat.com.tn | INSURER_ADMIN | GAT |
| admin@comar.com.tn | INSURER_ADMIN | COMAR |
| admin@ami.com.tn | INSURER_ADMIN | AMI |
| agent@star.com.tn | INSURER_AGENT | STAR |
| pharmacie.pasteur@dhamen.tn | PHARMACIST | any |
| dr.benali@dhamen.tn | DOCTOR | any |

## Testing Login

```bash
# Create JSON payload (use heredoc to avoid bash ! escaping)
cat > /tmp/login.json << 'EOF'
{"email":"admin@dhamen.tn","password":"Password123!"}
EOF

# Test login on STAR tenant
curl -s 'https://dhamen-api-dev.yassine-techini.workers.dev/api/v1/auth/login' \
  -H 'Content-Type: application/json' \
  -H 'X-Tenant-Code: STAR' \
  -d @/tmp/login.json

# Test login on AMI tenant
cat > /tmp/login-ami.json << 'EOF'
{"email":"admin@ami.com.tn","password":"Password123!"}
EOF

curl -s 'https://dhamen-api-dev.yassine-techini.workers.dev/api/v1/auth/login' \
  -H 'Content-Type: application/json' \
  -H 'X-Tenant-Code: AMI' \
  -d @/tmp/login-ami.json
```

## Resetting Passwords

If passwords need to be reset on remote databases:

```bash
HASH='$pbkdf2$100000$EEleqOw1cOzGOkvmhy/cZQ==$bNyLTEip7trKXM+kYpujDoNYjdapsVWKWdAarxKVipg='
for DB in dhamen-db dhamen-platform dhamen-star dhamen-gat dhamen-comar dhamen-ami; do
  npx wrangler d1 execute "$DB" --env dev --remote \
    --command "UPDATE users SET password_hash = '$HASH', updated_at = datetime('now') WHERE is_active = 1;"
done
```

## Deploying

```bash
cd apps/api
wrangler deploy --env dev
```

## Troubleshooting

### "Malformed JSON in request body"
The `!` in `Password123!` is interpreted by bash. Always use a heredoc or file:
```bash
cat > /tmp/payload.json << 'EOF'
{"email":"admin@dhamen.tn","password":"Password123!"}
EOF
curl ... -d @/tmp/payload.json
```

### "INVALID_CREDENTIALS" after deploy
The password hashes in the migration seeds may differ from the remote DB hashes. Re-run the password reset command above.

### Missing secrets
Check: `wrangler secret list --env dev`
Required: JWT_SECRET, ENCRYPTION_KEY
