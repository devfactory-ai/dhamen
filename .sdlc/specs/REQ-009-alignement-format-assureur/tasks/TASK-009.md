---
id: TASK-009
parent: REQ-009
status: todo
dependencies: [TASK-003, TASK-005]
files:
  - apps/web/src/features/agent/adherents/components/FamilleTable.tsx
  - apps/web/src/features/agent/adherents/components/PlafondsCard.tsx
  - apps/web/src/features/agent/hooks/use-adherent-famille.ts
  - apps/web/src/features/agent/hooks/use-adherent-plafonds.ts
---

## Objective

Ajouter la vue des ayants-droit (conjoint, enfants) avec leur rang dans la page adherent, et afficher la consommation des plafonds par prestataire et par famille d'acte.

## Context

Le modele famille est central dans l'assurance sante groupe en Tunisie. Chaque adherent a des ayants-droit (conjoint rang 99, enfants rang 01+) qui ont chacun leurs propres plafonds de remboursement. L'agent doit pouvoir consulter la composition familiale et les plafonds consommes pour chaque prestataire avant de saisir un bulletin.

## Acceptance Criteria

- AC1 : tableau famille avec rang, type (A/C/E), nom, date naissance, CIN, handicap, maladie chronique
- AC2 : clic sur un ayant-droit permet de consulter ses bulletins et plafonds
- AC3 : carte plafonds avec consommation par famille d'acte (barre de progression)
- AC4 : plafond global affiche en haut avec alerte visuelle si >80%
- AC5 : la recherche dans le formulaire bulletin affiche les ayants-droit avec leur rang

## Implementation Steps

1. Creer le hook use-adherent-famille (appel GET /adherents/:id/famille)
2. Creer le composant FamilleTable
3. Creer le hook use-adherent-plafonds (appel GET /adherents/:id/plafonds)
4. Creer le composant PlafondsCard avec barres de progression
5. Integrer dans la page adherent existante

## Tests

- La famille complete est affichee (adherent + conjoint + enfants)
- Les plafonds sont affiches avec le bon pourcentage consomme
- L'alerte >80% s'affiche correctement
- La navigation vers les bulletins d'un ayant-droit fonctionne
