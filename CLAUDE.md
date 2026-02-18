# CLAUDE.md — Dhamen (ضامن)

## Projet

Dhamen est une plateforme IA-native de tiers payant santé pour la Tunisie. Elle digitalise le circuit de prise en charge (pharmacie, consultation, hospitalisation) entre assureurs, prestataires de santé et adhérents.

## Stack technique

- **Runtime** : Cloudflare Workers (TypeScript)
- **Framework API** : Hono v4
- **Base de données** : Cloudflare D1 (SQLite distribué)
- **Cache** : Cloudflare KV
- **Files** : Cloudflare R2
- **Queues** : Cloudflare Queues
- **State** : Durable Objects (sessions, rate limiting)
- **IA** : Workers AI (LLM, embeddings, OCR)
- **Frontend web** : React 19 + TypeScript + Vite + TailwindCSS v4
- **Frontend mobile** : React Native / Expo
- **Monorepo** : Turborepo + pnpm
- **Tests** : Vitest (unit/integration), Playwright (E2E)
- **CI/CD** : GitHub Actions → Cloudflare Wrangler
- **Linting** : Biome (format + lint)

## Structure monorepo

```
dhamen/
├── apps/
│   ├── api/                  # Worker API principal (Hono)
│   │   ├── src/
│   │   │   ├── routes/       # Routes Hono par domaine
│   │   │   ├── agents/       # Agents IA (éligibilité, tarification, fraude, réconciliation)
│   │   │   ├── middleware/    # Auth, CORS, rate-limit, audit
│   │   │   ├── db/           # Schemas D1, migrations, queries
│   │   │   └── index.ts      # Entry point Worker
│   │   ├── wrangler.toml
│   │   └── vitest.config.ts
│   ├── web/                  # Portail prestataire unifié + assureur (React)
│   │   ├── src/
│   │   │   ├── features/     # Feature-based: pharmacy/, doctor/, lab/, clinic/, insurer/
│   │   │   ├── components/   # Design system partagé
│   │   │   ├── hooks/        # Hooks métier
│   │   │   ├── lib/          # API client, auth, utils
│   │   │   └── App.tsx
│   │   └── vite.config.ts
│   └── mobile/               # App adhérent (Phase 2)
├── packages/
│   ├── shared/               # Types, constantes, validations Zod partagés
│   ├── db/                   # Schéma D1, migrations, helpers queries
│   └── ui/                   # Composants UI partagés (web + potentiellement mobile)
├── scripts/                  # Scripts de seed, migration, déploiement
├── turbo.json
├── pnpm-workspace.yaml
└── CLAUDE.md
```

## Conventions de code

### TypeScript
- Strict mode activé partout
- Pas de `any` — utiliser `unknown` + type guards
- Types partagés dans `packages/shared/src/types/`
- Validation avec Zod pour toutes les entrées API
- Schemas Zod dans `packages/shared/src/schemas/`

### Nommage
- Fichiers : `kebab-case.ts`
- Types/Interfaces : `PascalCase` (préfixe `I` interdit)
- Variables/fonctions : `camelCase`
- Constantes : `UPPER_SNAKE_CASE`
- Tables D1 : `snake_case`
- Routes API : `kebab-case` (ex: `/api/v1/health-providers`)

### API
- REST, versionné `/api/v1/`
- Réponses standardisées : `{ success: boolean, data?: T, error?: { code: string, message: string } }`
- Pagination : `?page=1&limit=20` → `{ data: T[], meta: { page, limit, total } }`
- Codes erreur métier : `ELIGIBILITY_EXPIRED`, `TARIFF_NOT_FOUND`, etc.
- Middleware d'audit sur toutes les mutations

### Agents IA
Les agents sont des modules autonomes dans `apps/api/src/agents/`.
Chaque agent a :
- `{agent-name}.agent.ts` — logique principale
- `{agent-name}.rules.ts` — règles métier configurables
- `{agent-name}.types.ts` — types entrée/sortie
- `{agent-name}.test.ts` — tests unitaires
- Pattern : entrée validée → traitement → résultat typé + score de confiance

### Frontend
- Feature-based architecture dans `src/features/`
- Chaque feature contient ses composants, hooks, types, et routes
- État serveur : TanStack Query v5 (pas de store global pour les données API)
- État local : Zustand uniquement pour l'UI (sidebar, modals, theme)
- Formulaires : React Hook Form + Zod resolver
- Pas de CSS-in-JS — TailwindCSS uniquement
- Composants UI dans `packages/ui/` (inspirés shadcn/ui)

### Base de données (D1)
- Migrations numérotées : `0001_create_users.sql`, `0002_create_providers.sql`
- Foreign keys activées : `PRAGMA foreign_keys = ON`
- Soft delete avec `deleted_at` sur les entités principales
- Timestamps UTC : `created_at`, `updated_at` sur chaque table
- IDs : ULID (préféré aux UUIDs pour le tri chronologique en D1)

### Tests
- Tests unitaires colocalisés : `*.test.ts` à côté du fichier source
- Tests d'intégration API dans `apps/api/tests/integration/`
- Tests E2E dans `apps/web/tests/e2e/`
- Coverage minimum : 80% sur le code métier (agents, routes)
- Fixtures dans `tests/fixtures/` avec des données réalistes tunisiennes

### Git
- Conventional commits : `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
- Scope par domaine : `feat(eligibility):`, `fix(portal):`, `test(tarification):`
- Branches : `main` (prod), `staging`, `feat/*`, `fix/*`
- PR obligatoire, revue requise avant merge

## Commandes

```bash
pnpm install              # Install dependencies
pnpm dev                  # Dev all apps (turbo)
pnpm dev --filter api     # Dev API only
pnpm dev --filter web     # Dev web only
pnpm build                # Build all
pnpm test                 # Run all tests
pnpm test:unit            # Unit tests only
pnpm test:e2e             # E2E tests only
pnpm lint                 # Biome lint + format check
pnpm lint:fix             # Auto-fix
pnpm db:migrate           # Run D1 migrations
pnpm db:seed              # Seed dev data
pnpm deploy:staging       # Deploy to staging
pnpm deploy:prod          # Deploy to production
```

## Variables d'environnement (wrangler.toml)

```toml
[vars]
ENVIRONMENT = "development"
API_VERSION = "v1"
JWT_ISSUER = "dhamen"
MFA_ENABLED = "true"

[[d1_databases]]
binding = "DB"
database_name = "dhamen-db"
database_id = "<id>"

[[kv_namespaces]]
binding = "CACHE"
id = "<id>"

[[r2_buckets]]
binding = "STORAGE"
bucket_name = "dhamen-files"

[[queues.producers]]
binding = "QUEUE"
queue = "dhamen-events"
```

## Contexte métier important

### Tiers payant en Tunisie
- **Adhérent** : personne couverte par un contrat d'assurance santé
- **Prestataire** : professionnel de santé (pharmacien, médecin, labo, clinique)
- **Assureur** : compagnie d'assurance ou mutuelle
- **PEC** : Prise En Charge — montant couvert par l'assureur
- **Ticket modérateur** : part restant à la charge de l'adhérent
- **Bordereau** : relevé périodique des PEC pour paiement assureur → prestataire
- **Conventionnement** : accord entre assureur et prestataire (barèmes, conditions)

### Rôles RBAC
- `ADMIN` : administrateur plateforme
- `INSURER_ADMIN` : administrateur assureur
- `INSURER_AGENT` : agent assureur
- `PHARMACIST` : pharmacien
- `DOCTOR` : médecin
- `LAB_MANAGER` : responsable laboratoire
- `CLINIC_ADMIN` : administrateur clinique
- `ADHERENT` : adhérent (mobile uniquement)

### Règles métier critiques
- Vérification d'éligibilité < 100ms (cache KV obligatoire)
- Score anti-fraude sur chaque transaction (0-100, seuil configurable)
- Bordereaux générés automatiquement selon cycle assureur (hebdo/mensuel)
- Audit trail complet sur toutes les mutations (qui, quand, quoi)
- Données sensibles chiffrées au repos (AES-256)

## Ce que Claude doit faire

1. Respecter strictement cette architecture et ces conventions
2. Toujours valider les entrées avec Zod avant traitement
3. Écrire les tests en même temps que le code (TDD encouragé)
4. Logger les actions métier (audit trail) sur chaque mutation
5. Gérer les erreurs avec des codes métier explicites
6. Optimiser pour les edge (Workers) : pas de dépendances Node.js lourdes
7. Documenter les décisions d'architecture en commentaires JSDoc
8. Utiliser les types partagés de `packages/shared` — ne pas dupliquer

## Ce que Claude ne doit PAS faire

1. Utiliser `any` ou désactiver TypeScript strict
2. Installer des dépendances incompatibles Cloudflare Workers (pas de `fs`, `path`, `crypto` natif Node)
3. Stocker des secrets en dur dans le code
4. Ignorer la validation Zod sur les endpoints API
5. Créer des composants frontend hors du pattern feature-based
6. Skip les tests sur le code métier
7. Utiliser `console.log` en production — utiliser le logger structuré
