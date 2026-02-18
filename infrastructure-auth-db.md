# Spec — Infrastructure, Auth & Base de données

## Résumé

Fondations techniques de la plateforme : setup Cloudflare, schéma D1, authentification JWT + RBAC, middleware, CI/CD.

## 1. Setup Cloudflare

### wrangler.toml (apps/api)

```toml
name = "dhamen-api"
main = "src/index.ts"
compatibility_date = "2024-12-01"
compatibility_flags = ["nodejs_compat"]

[observability]
enabled = true

[vars]
ENVIRONMENT = "production"
API_VERSION = "v1"
JWT_ISSUER = "dhamen"
JWT_EXPIRES_IN = "900"       # 15 min
REFRESH_EXPIRES_IN = "86400" # 24h

[[d1_databases]]
binding = "DB"
database_name = "dhamen-db"

[[kv_namespaces]]
binding = "CACHE"

[[r2_buckets]]
binding = "STORAGE"
bucket_name = "dhamen-files"

[[queues.producers]]
binding = "EVENTS_QUEUE"
queue = "dhamen-events"

[[queues.producers]]
binding = "RECONCILIATION_QUEUE"
queue = "dhamen-reconciliation"

[durable_objects]
bindings = [
  { name = "RATE_LIMITER", class_name = "RateLimiter" },
]

[[migrations]]
tag = "v1"
new_classes = ["RateLimiter"]
```

### Environnements

```bash
# Création
wrangler d1 create dhamen-db-dev
wrangler d1 create dhamen-db-staging
wrangler d1 create dhamen-db-prod
wrangler kv:namespace create dhamen-cache-dev
wrangler r2 bucket create dhamen-files-dev
wrangler queues create dhamen-events-dev
```

## 2. Schéma D1

### Migrations

```
packages/db/migrations/
├── 0001_create_insurers.sql
├── 0002_create_adherents.sql
├── 0003_create_providers.sql
├── 0004_create_users.sql
├── 0005_create_contracts.sql
├── 0006_create_claims.sql
├── 0007_create_claim_items.sql
├── 0008_create_reconciliations.sql
├── 0009_create_audit_logs.sql
├── 0010_create_conventions.sql
└── 0011_seed_dev_data.sql
```

### Tables principales

```sql
-- 0001_create_insurers.sql
CREATE TABLE insurers (
  id TEXT PRIMARY KEY,          -- ULID
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,    -- Code court (ex: "STAR", "GAT")
  tax_id TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  config_json TEXT DEFAULT '{}', -- Configuration assureur (barèmes, seuils fraude, cycle réconciliation)
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- 0002_create_adherents.sql
CREATE TABLE adherents (
  id TEXT PRIMARY KEY,
  national_id_encrypted TEXT NOT NULL, -- Chiffré AES-256
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth TEXT NOT NULL,
  gender TEXT CHECK (gender IN ('M', 'F')),
  phone_encrypted TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  lat REAL,
  lng REAL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX idx_adherents_national_id ON adherents(national_id_encrypted);

-- 0003_create_providers.sql
CREATE TABLE providers (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('pharmacist', 'doctor', 'lab', 'clinic')),
  name TEXT NOT NULL,
  license_no TEXT NOT NULL UNIQUE,
  speciality TEXT,              -- Pour médecins
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  lat REAL,
  lng REAL,
  phone TEXT,
  email TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX idx_providers_type ON providers(type);
CREATE INDEX idx_providers_city ON providers(city);

-- 0004_create_users.sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN (
    'ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT',
    'PHARMACIST', 'DOCTOR', 'LAB_MANAGER', 'CLINIC_ADMIN'
  )),
  provider_id TEXT REFERENCES providers(id),   -- NULL pour admin/insurer
  insurer_id TEXT REFERENCES insurers(id),     -- NULL pour prestataires
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  mfa_enabled INTEGER DEFAULT 0,
  mfa_secret TEXT,
  last_login_at TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_provider ON users(provider_id);

-- 0005_create_contracts.sql
CREATE TABLE contracts (
  id TEXT PRIMARY KEY,
  insurer_id TEXT NOT NULL REFERENCES insurers(id),
  adherent_id TEXT NOT NULL REFERENCES adherents(id),
  contract_number TEXT NOT NULL,
  plan_type TEXT NOT NULL,       -- Ex: "individual", "family", "corporate"
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  carence_days INTEGER DEFAULT 0,
  annual_limit INTEGER,          -- En millimes TND, NULL = illimité
  coverage_json TEXT NOT NULL,   -- Détail couverture par type de soin
  exclusions_json TEXT DEFAULT '[]',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'expired', 'cancelled')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_contracts_adherent ON contracts(adherent_id);
CREATE INDEX idx_contracts_insurer ON contracts(insurer_id);
CREATE INDEX idx_contracts_status ON contracts(status);

-- 0006_create_claims.sql
CREATE TABLE claims (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('pharmacy', 'consultation', 'hospitalization')),
  contract_id TEXT NOT NULL REFERENCES contracts(id),
  provider_id TEXT NOT NULL REFERENCES providers(id),
  adherent_id TEXT NOT NULL REFERENCES adherents(id),
  insurer_id TEXT NOT NULL REFERENCES insurers(id),
  total_amount INTEGER NOT NULL,    -- Millimes TND
  covered_amount INTEGER NOT NULL,
  copay_amount INTEGER NOT NULL,
  fraud_score INTEGER DEFAULT 0,
  fraud_flags_json TEXT DEFAULT '[]',
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'eligible', 'approved', 'pending_review', 'blocked', 'rejected', 'paid'
  )),
  reconciliation_id TEXT REFERENCES reconciliations(id),
  bareme_version TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  validated_at TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_claims_adherent ON claims(adherent_id);
CREATE INDEX idx_claims_provider ON claims(provider_id);
CREATE INDEX idx_claims_insurer ON claims(insurer_id);
CREATE INDEX idx_claims_status ON claims(status);
CREATE INDEX idx_claims_date ON claims(created_at);
CREATE INDEX idx_claims_reconciliation ON claims(reconciliation_id);

-- 0007_create_claim_items.sql
CREATE TABLE claim_items (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES claims(id),
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,    -- Millimes
  line_total INTEGER NOT NULL,
  covered_amount INTEGER NOT NULL,
  copay_amount INTEGER NOT NULL,
  reimbursement_rate REAL,
  is_generic INTEGER DEFAULT 0,
  rule_applied TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_claim_items_claim ON claim_items(claim_id);

-- 0008_create_reconciliations.sql
CREATE TABLE reconciliations (
  id TEXT PRIMARY KEY,
  insurer_id TEXT NOT NULL REFERENCES insurers(id),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  total_claims INTEGER NOT NULL,
  total_amount INTEGER NOT NULL,
  total_covered INTEGER NOT NULL,
  total_retentions INTEGER DEFAULT 0,
  total_net_payable INTEGER NOT NULL,
  pdf_path TEXT,                   -- Chemin R2
  status TEXT DEFAULT 'generated' CHECK (status IN ('generated', 'sent', 'paid')),
  created_at TEXT DEFAULT (datetime('now')),
  paid_at TEXT
);
CREATE INDEX idx_reconciliations_insurer ON reconciliations(insurer_id);

-- 0009_create_audit_logs.sql
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,            -- Ex: "claim.create", "claim.approve"
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  changes_json TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_date ON audit_logs(created_at);

-- 0010_create_conventions.sql
CREATE TABLE conventions (
  id TEXT PRIMARY KEY,
  insurer_id TEXT NOT NULL REFERENCES insurers(id),
  provider_id TEXT NOT NULL REFERENCES providers(id),
  bareme_json TEXT NOT NULL,       -- Barèmes et taux spécifiques
  start_date TEXT NOT NULL,
  end_date TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(insurer_id, provider_id)
);
CREATE INDEX idx_conventions_provider ON conventions(provider_id);
```

## 3. Authentification

### Flux login

```
POST /api/v1/auth/login { email, password }
  → Vérifier password (bcrypt via Web Crypto API)
  → Si MFA activé: retourner { requiresMfa: true, mfaToken }
  → Si pas MFA: retourner { accessToken, refreshToken }

POST /api/v1/auth/mfa/verify { mfaToken, otpCode }
  → Vérifier OTP (TOTP ou SMS)
  → Retourner { accessToken, refreshToken }

POST /api/v1/auth/refresh { refreshToken }
  → Vérifier refresh token (KV lookup)
  → Retourner nouveau { accessToken, refreshToken }

POST /api/v1/auth/logout
  → Supprimer session KV
```

### JWT payload

```typescript
interface JWTPayload {
  sub: string;          // user.id
  role: string;         // RBAC role
  providerId?: string;  // Si prestataire
  insurerId?: string;   // Si assureur
  iat: number;
  exp: number;
  iss: 'dhamen';
}
```

### RBAC middleware

```typescript
// middleware/auth.ts
export function requireRole(...roles: Role[]) {
  return async (c: Context, next: Next) => {
    const user = c.get('user'); // Set by JWT middleware
    if (!roles.includes(user.role)) {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } }, 403);
    }
    await next();
  };
}

// Usage dans routes
app.post('/api/v1/claims/pharmacy', requireRole('PHARMACIST'), createPharmacyClaim);
app.get('/api/v1/reconciliation', requireRole('INSURER_ADMIN', 'INSURER_AGENT'), listReconciliations);
```

## 4. CI/CD

### GitHub Actions

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:unit
      - run: pnpm test:integration

  deploy-staging:
    if: github.ref == 'refs/heads/staging'
    needs: [lint, test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm db:migrate --env staging
      - run: pnpm deploy:staging

  deploy-prod:
    if: github.ref == 'refs/heads/main'
    needs: [lint, test]
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm db:migrate --env production
      - run: pnpm deploy:prod
```

## 5. Health check

```
GET /api/v1/health
→ {
    status: "healthy",
    version: "1.0.0",
    environment: "production",
    checks: {
      database: { status: "ok", latencyMs: 2 },
      cache: { status: "ok", latencyMs: 1 },
      storage: { status: "ok" }
    },
    uptime: "3d 12h 45m"
  }
```
