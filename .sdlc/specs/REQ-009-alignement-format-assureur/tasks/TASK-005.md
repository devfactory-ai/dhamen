---
id: TASK-005
parent: REQ-009
status: done
dependencies: [TASK-001, TASK-003]
files:
  - packages/db/migrations/0081_create_plafonds_prestataire.sql
  - packages/shared/src/types/plafond.ts
  - packages/shared/src/schemas/plafond.ts
  - apps/api/src/routes/adherents.ts
---

## Objective

Creer la table `plafonds_prestataire` pour suivre la consommation des plafonds de remboursement par prestataire (chaque membre de la famille), par famille d'acte, par annee, avec distinction maladie ordinaire/chronique.

## Context

En assurance sante groupe en Tunisie, les plafonds de remboursement s'appliquent a 3 niveaux : par acte, par famille d'actes par an et par prestataire (ex: pharmacie ordinaire max 1000 DT/an), et un plafond global par prestataire par an (ex: 6000 DT). Chaque membre de la famille (adherent, conjoint, enfant) a ses propres compteurs. La pharmacie a des plafonds differents pour maladies ordinaires vs chroniques.

## Acceptance Criteria

- AC1 : table `plafonds_prestataire` creee avec adherent_id, contract_id, annee, famille_acte_id (NULL=global), montant_plafond, montant_consomme, type_maladie
- AC2 : contrainte UNIQUE sur (adherent_id, contract_id, annee, famille_acte_id, type_maladie)
- AC3 : le plafond global est une ligne avec famille_acte_id=NULL
- AC4 : endpoint GET `/adherents/:id/plafonds` retourne la consommation par famille avec pourcentage consomme
- AC5 : les types et schemas Zod sont crees

## Implementation Steps

1. Creer migration 0081 : CREATE TABLE plafonds_prestataire avec index et contraintes
2. Creer les types TypeScript (PlafondPrestataire) dans packages/shared
3. Creer les schemas Zod
4. Ajouter l'endpoint GET `/adherents/:id/plafonds` dans adherents.ts

## Tests

- Insertion plafonds par famille et global pour un prestataire
- La contrainte UNIQUE empeche les doublons
- GET /adherents/:id/plafonds retourne les plafonds avec % consomme
- Distinction ordinaire/chronique pour la pharmacie (2 lignes distinctes)
- Le plafond global (famille_acte_id=NULL) est bien retourne
