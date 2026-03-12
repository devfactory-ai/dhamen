---
id: TASK-011
parent: REQ-004
status: done
dependencies: [TASK-007]
files:
  - apps/web/src/features/bulletins/pages/BulletinsSaisiePage.tsx
---

## Objective

Enrichir le badge de statut du **bulletin de soins** avec les statuts métier complets du workflow.

## Context

Le workflow du domaine (REQ-000) : Bulletin de soins → Calcul remboursement → Vérification plafond → Validation → Paiement. Le statut actuel ne couvre que `draft`, `in_batch`, `exported`. Il faut ajouter les statuts du cycle de vie complet.

## Acceptance Criteria

- AC1 : badge avec couleur et libellé pour chaque statut :
  - `draft` → gris "Brouillon"
  - `in_batch` → bleu "Dans un lot"
  - `exported` → outline "Exporté"
  - `soumis` → bleu "Soumis"
  - `en_examen` → jaune "En examen"
  - `approuve` → vert "Approuvé"
  - `rejete` → rouge "Rejeté"
  - `paye` → vert foncé "Payé"
- AC2 : le badge est visible dans la vue détail et dans la liste des bulletins

## Implementation Steps

1. Créer un mapping `statusConfig` avec libellé, variante Badge, et icône pour chaque statut
2. Remplacer les conditions ternaires actuelles par le mapping
3. Appliquer dans la vue détail et dans la DataTable

## Tests

- Chaque statut affiche le bon libellé et la bonne couleur
- Statut inconnu affiche un fallback lisible
