# ARCHITECTURE.md — Dhamen (ضامن)

## Vue d'ensemble

Dhamen est une plateforme 100% edge-native déployée sur Cloudflare, conçue autour d'agents IA spécialisés qui orchestrent le circuit tiers payant.

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENTS                                   │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │ Web App  │  │ Mobile App   │  │ API Partenaires     │    │
│  │ (React)  │  │ (React Native│  │ (REST)              │    │
│  └────┬─────┘  └──────┬───────┘  └─────────┬──────────┘    │
└───────┼────────────────┼───────────────────┼────────────────┘
        │                │                   │
        ▼                ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│              CLOUDFLARE EDGE NETWORK                         │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              API Gateway (Hono Worker)                  │  │
│  │  ┌─────────┐ ┌──────┐ ┌───────────┐ ┌─────────────┐  │  │
│  │  │  Auth   │ │ CORS │ │ Rate Limit│ │ Audit Trail │  │  │
│  │  │Middleware│ │      │ │ (DO)      │ │             │  │  │
│  │  └─────────┘ └──────┘ └───────────┘ └─────────────┘  │  │
│  │                                                        │  │
│  │  ┌─────────────────── ROUTES ────────────────────────┐ │  │
│  │  │ /providers  /adherents  /claims  /reconciliation  │ │  │
│  │  │ /contracts  /analytics  /admin   /onboarding      │ │  │
│  │  └───────────────────────────────────────────────────┘ │  │
│  └───────────────────────┬───────────────────────────────┘  │
│                          │                                   │
│  ┌───────────── AGENTS IA ──────────────────────────────┐   │
│  │                                                       │   │
│  │  ┌──────────┐ ┌────────────┐ ┌───────────────────┐   │   │
│  │  │Éligibilité│ │Tarification│ │  Anti-Fraude      │   │   │
│  │  │  Agent   │ │   Agent    │ │    Agent          │   │   │
│  │  │ <100ms   │ │            │ │  Score 0-100      │   │   │
│  │  └──────────┘ └────────────┘ └───────────────────┘   │   │
│  │                                                       │   │
│  │  ┌──────────────┐ ┌─────────────────────────────┐    │   │
│  │  │Réconciliation│ │  Orchestrateur              │    │   │
│  │  │    Agent     │ │  (coordonne les agents)      │    │   │
│  │  └──────────────┘ └─────────────────────────────┘    │   │
│  └───────────────────────────────────────────────────────┘   │
│                          │                                   │
│  ┌───────────── DATA LAYER ─────────────────────────────┐   │
│  │                                                       │   │
│  │  ┌────┐  ┌────┐  ┌────┐  ┌────────┐  ┌───────────┐  │   │
│  │  │ D1 │  │ KV │  │ R2 │  │ Queues │  │ Durable   │  │   │
│  │  │SQL │  │Cache│  │Files│ │ Async  │  │ Objects   │  │   │
│  │  └────┘  └────┘  └────┘  └────────┘  └───────────┘  │   │
│  │                                                       │   │
│  │  ┌─────────────────────────────────────────────────┐  │   │
│  │  │              Workers AI                          │  │   │
│  │  │  LLM · Embeddings · OCR · Classification        │  │   │
│  │  └─────────────────────────────────────────────────┘  │   │
│  └───────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Couche données

### D1 (base principale)

Schéma relationnel normalisé. Tables principales :

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│  insurers   │     │  contracts   │     │   adherents      │
│─────────────│     │──────────────│     │──────────────────│
│ id (ULID)   │◄────│ insurer_id   │     │ id (ULID)        │
│ name        │     │ adherent_id  │────►│ national_id      │
│ code        │     │ plan_type    │     │ first_name       │
│ config_json │     │ start_date   │     │ last_name        │
│ created_at  │     │ end_date     │     │ date_of_birth    │
│ updated_at  │     │ status       │     │ phone            │
└─────────────┘     │ coverage_json│     │ created_at       │
                    │ created_at   │     └──────────────────┘
                    └──────────────┘
                           │
┌─────────────┐     ┌──────┴───────┐     ┌──────────────────┐
│  providers  │     │   claims     │     │  claim_items     │
│─────────────│     │──────────────│     │──────────────────│
│ id (ULID)   │◄────│ provider_id  │     │ claim_id         │
│ type (enum) │     │ contract_id  │     │ medication_code  │
│ name        │     │ type (enum)  │     │ quantity         │
│ license_no  │     │ status       │     │ unit_price       │
│ speciality  │     │ total_amount │     │ covered_amount   │
│ address     │     │ covered_amt  │     │ copay_amount     │
│ lat/lng     │     │ copay_amount │     │ fraud_score      │
│ phone       │     │ fraud_score  │     │ created_at       │
│ is_active   │     │ created_at   │     └──────────────────┘
│ created_at  │     │ validated_at │
└─────────────┘     └──────────────┘

┌──────────────────┐     ┌──────────────────┐
│ reconciliations  │     │   audit_logs     │
│──────────────────│     │──────────────────│
│ id (ULID)        │     │ id (ULID)        │
│ insurer_id       │     │ user_id          │
│ provider_id      │     │ action           │
│ period_start     │     │ entity_type      │
│ period_end       │     │ entity_id        │
│ total_claims     │     │ changes_json     │
│ total_amount     │     │ ip_address       │
│ status           │     │ created_at       │
│ pdf_url (R2)     │     └──────────────────┘
│ created_at       │
└──────────────────┘

-- Enum provider.type: 'pharmacist' | 'doctor' | 'lab' | 'clinic'
-- Enum claim.type: 'pharmacy' | 'consultation' | 'hospitalization'
-- Enum claim.status: 'pending' | 'eligible' | 'approved' | 'rejected' | 'paid'
```

### KV (cache haute performance)

| Préfixe clé | Contenu | TTL |
|---|---|---|
| `elig:{contract_id}` | Résultat éligibilité | 5 min |
| `tariff:{insurer_id}:{code}` | Barème tarification | 1h |
| `provider:{id}:status` | Statut conventionnement | 15 min |
| `session:{token}` | Session utilisateur | 24h |
| `rate:{ip}:{route}` | Rate limiting fallback | 1 min |

### R2 (stockage fichiers)

| Bucket path | Contenu |
|---|---|
| `bordereaux/{year}/{month}/` | PDFs bordereaux de réconciliation |
| `documents/{provider_id}/` | Documents d'onboarding (licence, agrément) |
| `prescriptions/{claim_id}/` | Scans ordonnances |
| `exports/` | Exports CSV/Excel |

### Queues (traitement asynchrone)

| Queue | Producteur | Consommateur | Usage |
|---|---|---|---|
| `dhamen-events` | API (mutations) | Event Worker | Audit trail, notifications, analytics |
| `dhamen-reconciliation` | Cron trigger | Reconciliation Worker | Génération bordereaux périodiques |
| `dhamen-fraud-analysis` | Claim creation | Fraud Worker | Analyse anti-fraude approfondie |

### Durable Objects

| DO | Usage |
|---|---|
| `RateLimiter` | Rate limiting par IP/user avec sliding window |
| `ClaimSession` | Session de création de PEC (state machine) |

## Agents IA — Architecture détaillée

### Pattern commun

```typescript
// Chaque agent suit ce pattern
interface AgentInput<T> {
  data: T;
  context: {
    insurerId: string;
    providerId: string;
    timestamp: string;
  };
}

interface AgentResult<T> {
  success: boolean;
  data: T;
  confidence: number;    // 0-1
  processingTimeMs: number;
  reasoning?: string;    // Explication pour audit
}

// Agent abstrait
abstract class BaseAgent<TInput, TOutput> {
  abstract execute(input: AgentInput<TInput>): Promise<AgentResult<TOutput>>;
  abstract validate(input: TInput): ValidationResult;
}
```

### Agent Éligibilité

Vérifie en temps réel si un adhérent est éligible à une PEC.

```
Input: { adherentId, providerId, claimType, date }
                    │
                    ▼
         ┌──────────────────┐
         │  Cache KV Check  │◄── Hit? Return cached result
         └────────┬─────────┘
                  │ Miss
                  ▼
         ┌──────────────────┐
         │  Load Contract   │◄── D1 query
         └────────┬─────────┘
                  │
                  ▼
    ┌─────────────────────────────┐
    │      Rules Engine           │
    │  ✓ Contrat actif?           │
    │  ✓ Période de carence?      │
    │  ✓ Plafond atteint?         │
    │  ✓ Exclusions?              │
    │  ✓ Prestataire conventionné?│
    │  ✓ Type de soin couvert?    │
    └─────────────┬───────────────┘
                  │
                  ▼
         ┌──────────────────┐
         │  Cache Result KV │──► TTL 5 min
         └────────┬─────────┘
                  │
                  ▼
Output: { eligible: boolean, reason?, remainingCoverage, expiresAt }
```

SLA : < 100ms (p99)

### Agent Tarification

Calcule la PEC et le ticket modérateur.

```
Input: { contractId, items: [{ code, quantity, unitPrice }], providerType }
                    │
                    ▼
         ┌──────────────────┐
         │  Load Barème     │◄── KV cache ou D1
         │  (par assureur)  │
         └────────┬─────────┘
                  │
                  ▼
    ┌─────────────────────────────┐
    │     Calcul par item         │
    │  - Taux de remboursement    │
    │  - Plafond par catégorie    │
    │  - Franchise                │
    │  - Générique vs princeps   │
    │  - Ticket modérateur        │
    └─────────────┬───────────────┘
                  │
                  ▼
Output: {
  totalAmount, coveredAmount, copayAmount,
  items: [{ code, covered, copay, rule_applied }],
  baremeVersion
}
```

### Agent Anti-Fraude

Scoring de risque sur chaque transaction.

```
Input: { claim, provider, adherent, historique }
                    │
                    ▼
    ┌─────────────────────────────┐
    │   Règles déterministes      │
    │  - Doublon (même jour/soin) │
    │  - Incompatibilité méd.     │
    │  - Surfacturation (>barème) │
    │  - Fréquence anormale       │
    │  - Hors zone géographique   │
    └─────────────┬───────────────┘
                  │
                  ▼
    ┌─────────────────────────────┐
    │   Score composite           │
    │   0-30 : OK (auto-approve)  │
    │   31-70 : Review            │
    │   71-100 : Block + Alert    │
    └─────────────┬───────────────┘
                  │
                  ▼
Output: { score, flags: string[], recommendation, details }
```

### Agent Réconciliation

Génère les bordereaux de paiement assureur → prestataire.

```
Trigger: Cron (configurable par assureur) ou manuel
                    │
                    ▼
    ┌─────────────────────────────┐
    │   Collecter claims validées │
    │   (période + assureur +     │
    │    prestataire)             │
    └─────────────┬───────────────┘
                  │
                  ▼
    ┌─────────────────────────────┐
    │   Rapprochement             │
    │   - Totaliser par presta.   │
    │   - Vérifier cohérence      │
    │   - Appliquer retenues      │
    └─────────────┬───────────────┘
                  │
                  ▼
    ┌─────────────────────────────┐
    │   Génération PDF            │
    │   - Bordereau détaillé      │
    │   - Stockage R2             │
    │   - Notification assureur   │
    └─────────────────────────────┘
```

### Orchestrateur

Coordonne les agents pour un flux de PEC complet :

```
Demande PEC
    │
    ├──► Agent Éligibilité ──► Eligible? ──► Non → Rejet
    │                                         │
    │                                        Oui
    │                                         │
    ├──► Agent Tarification ──► Calcul PEC ───┤
    │                                         │
    ├──► Agent Anti-Fraude ──► Score ──────────┤
    │                                         │
    ▼                                         ▼
  Résultat agrégé: { eligible, pec, fraudScore, recommendation }
```

## Sécurité

### Authentification
- JWT signé (HS256) avec refresh token
- MFA obligatoire pour prestataires (OTP SMS via worker externe)
- Session KV avec TTL 24h
- Rotation des tokens toutes les 15 min

### Autorisation (RBAC)
- Middleware Hono vérifie le rôle sur chaque route
- Permissions granulaires par rôle dans `packages/shared/src/permissions.ts`
- Row-level security : un prestataire ne voit que ses propres données

### Chiffrement
- Données sensibles (national_id, phone) : chiffrées AES-256-GCM en D1
- Clé de chiffrement dans Worker secrets (pas dans le code)
- TLS 1.3 en transit (Cloudflare default)

### Audit
- Chaque mutation génère un événement dans `audit_logs`
- Format : `{ userId, action, entityType, entityId, changes, ip, timestamp }`
- Rétention : 2 ans minimum

## Performance

| Métrique | Cible | Moyen |
|---|---|---|
| Éligibilité API | < 100ms p99 | Cache KV + règles in-memory |
| Tarification API | < 200ms p99 | Cache barèmes KV |
| Création PEC (full flow) | < 500ms p99 | Orchestrateur parallélisé |
| Dashboard loading | < 2s | React lazy loading + API pagination |
| Cold start Worker | < 50ms | Bundle size < 1MB, pas de deps lourdes |

## Environnements

| Env | D1 | KV | URL |
|---|---|---|---|
| `development` | dhamen-db-dev | dhamen-cache-dev | localhost:8787 |
| `staging` | dhamen-db-staging | dhamen-cache-staging | staging.dhamen.tn |
| `production` | dhamen-db-prod | dhamen-cache-prod | app.dhamen.tn |

## Monitoring

- **Logs** : Cloudflare Logpush → (futur: Grafana/Loki)
- **Métriques** : Workers Analytics + custom metrics dans KV
- **Alertes** : Cloudflare Notifications (error rate, latency p99)
- **Health check** : `GET /api/v1/health` → `{ status, version, db, cache, uptime }`
