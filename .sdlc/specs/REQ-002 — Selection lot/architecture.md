# Sélection lot — Architecture

## Modèle de données existant

### Table `companies` (migration 0047)

| Colonne          | Type    | Notes                          |
|------------------|---------|--------------------------------|
| id               | TEXT    | ULID, primary key              |
| name             | TEXT    | Nom de l'entreprise            |
| matricule_fiscal | TEXT    | UNIQUE, identifiant fiscal TN  |
| insurer_id       | TEXT    | FK → insurers                  |
| is_active        | INTEGER | 1 = active                     |
| created_at       | TEXT    | ISO 8601                       |

### Table `bulletin_batches` (migration 0042)

| Colonne    | Type    | Notes                              |
|------------|---------|------------------------------------|
| id         | TEXT    | ULID, primary key                  |
| name       | TEXT    | Nom du lot                         |
| status     | TEXT    | open, closed, exported             |
| created_by | TEXT    | FK → users (agent)                 |
| created_at | TEXT    | ISO 8601                           |

**Modification nécessaire** : ajouter `company_id` (FK → companies) à `bulletin_batches` pour lier un lot à une entreprise.

## Endpoints API

### GET /api/v1/companies

Déjà existant. Filtre automatique par `insurer_id` de l'agent connecté.

**Response** :
```json
{
  "success": true,
  "data": [
    { "id": "...", "name": "Société ABC", "matriculeFiscal": "1234567A", "isActive": true }
  ],
  "meta": { "page": 1, "limit": 20, "total": 5 }
}
```

### GET /api/v1/bulletin-batches?companyId={id}&status=open

Liste les lots ouverts pour une entreprise donnée.

**Response** :
```json
{
  "success": true,
  "data": [
    { "id": "...", "name": "Lot Mars 2026", "status": "open", "createdAt": "..." }
  ]
}
```

### POST /api/v1/bulletin-batches

Crée un nouveau lot pour une entreprise.

**Request** :
```json
{
  "name": "Lot Mars 2026",
  "companyId": "company-id"
}
```

**Response** :
```json
{
  "success": true,
  "data": { "id": "...", "name": "Lot Mars 2026", "status": "open", "companyId": "..." }
}
```

## Frontend

### Page de sélection (après login)

Route : `/select-context`

**Étape 1 — Sélection entreprise**
- Liste des entreprises (cards ou table)
- Recherche par nom / matricule fiscal
- Filtre automatique par assureur de l'agent

**Étape 2 — Sélection lot**
- Liste des lots ouverts pour l'entreprise sélectionnée
- Bouton "Créer un nouveau lot"
- Modal de création avec champ nom

**Stockage du contexte**
- Zustand store : `{ selectedCompany, selectedBatch }`
- Persisté dans sessionStorage pour la durée de la session

## Fichiers existants

- `apps/api/src/routes/companies.ts` — routes entreprises (existant)
- `apps/api/src/routes/batch.ts` — routes batch jobs (existant, à adapter)
- `packages/db/migrations/0042_create_bulletin_batches.sql` — table lots (existante)
- `packages/db/migrations/0047_create_companies_hr.sql` — table companies (existante)
- `apps/web/src/features/companies/pages/CompaniesPage.tsx` — page entreprises (existante)
