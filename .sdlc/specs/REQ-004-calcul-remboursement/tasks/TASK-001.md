---
id: TASK-001
parent: REQ-004
status: done
dependencies: []
files:
  - packages/db/migrations/0070_create_actes_referentiel.sql
---

## Objective

Créer la table référentiel des actes médicaux avec leur taux de remboursement.

## Context

Le domaine définit un **acte médical** comme une prestation remboursable possédant un code, un libellé et un taux de remboursement (REQ-000 architecture.md). La table `actes_bulletin` (migration 0068) stocke les actes déclarés dans un bulletin mais ne contient pas le taux. Il faut un référentiel central pour résoudre le taux à partir du code acte.

## Acceptance Criteria

- AC1 : migration crée la table `actes_referentiel` avec : `id TEXT PK`, `code TEXT UNIQUE NOT NULL`, `label TEXT NOT NULL`, `taux_remboursement REAL NOT NULL CHECK(taux_remboursement >= 0 AND taux_remboursement <= 1)`, `plafond_acte REAL` (nullable, limite par acte), `is_active INTEGER DEFAULT 1`, `created_at`, `updated_at`
- AC2 : index sur `code` et `is_active`
- AC3 : seed avec des actes médicaux réalistes (consultation générale, consultation spécialiste, radiologie, analyses biologiques, soins dentaires, hospitalisation)

## Implementation Steps

1. Créer `packages/db/migrations/0070_create_actes_referentiel.sql`
2. INSERT seed data avec taux réalistes (ex: consultation 0.70, analyses 0.80)
3. Appliquer sur les tenant DBs locaux (DB_STAR, DB_GAT, DB_COMAR, DB_AMI)
