---
id: TASK-008
parent: REQ-004
status: done
dependencies: [TASK-006]
files:
  - packages/db/migrations/0073_add_remboursement_brut_to_actes_bulletin.sql
  - apps/api/src/routes/bulletins-agent.ts
  - packages/shared/src/types/remboursement.ts
---

## Objective

Persister le remboursement brut et le flag plafond dépassé par acte, et retourner le plafond consommé avant le bulletin dans la réponse API.

## Context

Le service de calcul (TASK-004) produit `remboursementBrut` et `plafondDepasse` par **acte médical**, mais seuls `taux_remboursement` et `montant_rembourse` (final) sont persistés en DB. Pour afficher le détail du calcul côté UI, il faut stocker et retourner ces données supplémentaires.

De même, la section plafond doit distinguer le plafond consommé **avant** le bulletin vs **après** pour montrer l'impact.

## Acceptance Criteria

- AC1 : migration ajoute `remboursement_brut REAL` et `plafond_depasse INTEGER DEFAULT 0` à `actes_bulletin`
- AC2 : la route POST `/create` persiste `remboursement_brut` et `plafond_depasse` pour chaque acte
- AC3 : la route GET `/:id` retourne `plafond_consomme_avant` (plafond_consomme - reimbursed_amount du bulletin) en plus de `plafond_global` et `plafond_consomme`
- AC4 : le type `RemboursementActeResult` dans shared est cohérent avec les colonnes DB

## Implementation Steps

1. Créer `packages/db/migrations/0073_add_remboursement_brut_to_actes_bulletin.sql`
2. Modifier l'INSERT dans `bulletins-agent.ts` POST `/create` pour inclure `remboursement_brut` et `plafond_depasse`
3. Modifier le GET `/:id` pour calculer et retourner `plafond_consomme_avant`
4. Appliquer migration sur les tenant DBs

## Tests

- Vérifier qu'un bulletin créé a `remboursement_brut` et `plafond_depasse` non null dans `actes_bulletin`
- Vérifier que GET `/:id` retourne `plafond_consomme_avant` = `plafond_consomme` - `reimbursed_amount`
