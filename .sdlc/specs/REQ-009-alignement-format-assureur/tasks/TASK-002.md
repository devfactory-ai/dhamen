---
id: TASK-002
parent: REQ-009
status: todo
dependencies: [TASK-001]
files:
  - packages/db/migrations/0078_create_contrat_periodes_baremes.sql
  - packages/shared/src/types/contrat.ts
  - packages/shared/src/schemas/contrat.ts
---

## Objective

Creer les tables `contrat_periodes` et `contrat_baremes` pour modeliser les contrats d'assurance groupe avec periodes d'application et baremes par famille d'actes.

## Context

Les contrats d'assurance groupe en Tunisie ont des periodes d'application (ex: 01/01/2025 - 31/12/2026) avec des baremes specifiques par famille d'actes et par code acte. Chaque bareme definit un type de calcul (taux ou forfait), une valeur, et des plafonds. Le systeme actuel stocke les taux dans `coverage_json` de facon simplifiee, ce qui ne permet pas de modeliser la structure reelle des contrats.

## Acceptance Criteria

- AC1 : table `contrat_periodes` creee avec id, contract_id, numero, date_debut, date_fin, ref_periode, is_active
- AC2 : table `contrat_baremes` creee avec id, periode_id, acte_ref_id, famille_id, type_calcul, valeur, plafond_acte, plafond_famille_annuel, limite, contre_visite
- AC3 : contrainte UNIQUE sur (contract_id, numero) pour les periodes
- AC4 : un contrat type assurance groupe est modelisable (C1=45DT forfait, PH1=90% taux, plafond pharma 1000DT/an)
- AC5 : les types et schemas Zod sont crees dans packages/shared

## Implementation Steps

1. Creer migration 0078 : CREATE TABLE `contrat_periodes` et `contrat_baremes` avec index et foreign keys
2. Creer les types TypeScript (ContratPeriode, ContratBareme) dans packages/shared
3. Creer les schemas Zod de validation

## Tests

- Insertion d'un contrat avec 3 periodes et baremes par famille
- La contrainte UNIQUE empeche les doublons de periodes
- Un bareme taux a une valeur entre 0 et 1
- Un bareme forfait a une valeur en millimes
- Les foreign keys vers contrat_periodes et actes_referentiel sont valides
