---
id: TASK-007
parent: REQ-004
status: done
dependencies: [TASK-006]
files:
  - apps/web/src/features/bulletins/**
---

## Objective

Afficher les montants de remboursement calculés dans l'interface web de saisie des bulletins de soins.

## Context

L'**agent assurance** doit voir le détail du remboursement par **acte médical** et le total remboursé lors de la consultation d'un **bulletin de soins**. L'interface doit aussi afficher le plafond restant de l'**adhérent** (AC5 du requirement : le système retourne le détail par acte).

## Acceptance Criteria

- AC1 : la vue détail du bulletin affiche `taux_remboursement` et `montant_rembourse` pour chaque acte
- AC2 : le total remboursé du bulletin (`reimbursed_amount`) est affiché
- AC3 : le plafond restant de l'adhérent est visible (`plafond_global - plafond_consomme`)
- AC4 : si le plafond a été atteint sur un acte, un indicateur visuel le signale

## Implementation Steps

1. Mettre à jour les types frontend pour inclure les champs de remboursement
2. Modifier le composant de détail bulletin pour afficher les montants calculés
3. Ajouter l'affichage du plafond restant adhérent
4. Ajouter un badge/alerte si plafond atteint
