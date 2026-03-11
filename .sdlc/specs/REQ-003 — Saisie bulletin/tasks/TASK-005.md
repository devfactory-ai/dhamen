---
id: TASK-005
parent: REQ-003
status: todo
dependencies: [TASK-001]
files:
  - packages/db/migrations/0068_create_actes_bulletin.sql
---

## Objective

Créer la table `actes_bulletin` pour stocker les actes médicaux associés à chaque bulletin.

## Acceptance Criteria

- AC1 : table `actes_bulletin` créée avec colonnes id, bulletin_id (FK), code, label, amount, created_at
- AC2 : index sur bulletin_id pour les requêtes de listing
- AC3 : migration appliquée sur les tenant DBs locaux

## Implementation Steps

1. Créer `packages/db/migrations/0068_create_actes_bulletin.sql`
2. Appliquer sur chaque tenant DB local
