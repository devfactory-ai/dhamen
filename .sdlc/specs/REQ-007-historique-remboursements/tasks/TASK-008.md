---
id: TASK-008
parent: REQ-007
status: pending
dependencies:
  - TASK-005
files:
  - apps/web/src/App.tsx
  - apps/web/src/components/layout/Sidebar.tsx
---

## Objective

Ajouter la route /bulletins/history et l'entree dans la sidebar pour la page historique.

## Context

La page historique doit etre accessible via la navigation de l'application. Il faut ajouter une route dans App.tsx et un lien dans la sidebar entre "Validation bulletins" et "Paiements adherents". La page est accessible uniquement aux roles INSURER_AGENT et INSURER_ADMIN.

## Acceptance Criteria

- AC1 : route /bulletins/history pointe vers BulletinsHistoryPage (lazy loaded)
- AC2 : entree "Historique remboursements" dans la sidebar avec icone History/Clock
- AC3 : position dans la sidebar : apres "Validation bulletins" et avant "Paiements adherents"
- AC4 : visible uniquement pour les roles INSURER_AGENT et INSURER_ADMIN
- AC5 : le lien est actif (surligne) quand on est sur la page /bulletins/history

## Implementation Steps

1. Ajouter le lazy import de BulletinsHistoryPage dans App.tsx
2. Ajouter la Route /bulletins/history dans le bon emplacement
3. Ajouter l'entree dans Sidebar.tsx avec roles et icone
4. Verifier que la navigation fonctionne

## Tests

- La page se charge correctement via /bulletins/history
- Le lien apparait dans la sidebar pour INSURER_ADMIN
- Le lien apparait dans la sidebar pour INSURER_AGENT
- Le lien n'apparait pas pour PHARMACIST ou ADHERENT
- Le lien est actif quand on est sur la page
