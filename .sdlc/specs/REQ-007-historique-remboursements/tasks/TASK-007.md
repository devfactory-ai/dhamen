---
id: TASK-007
parent: REQ-007
status: pending
dependencies:
  - TASK-004
  - TASK-005
files:
  - apps/web/src/features/bulletins/pages/BulletinsHistoryPage.tsx
  - apps/web/src/hooks/use-bulletin-history.ts
---

## Objective

Ajouter le bouton et la logique d'export CSV dans la page historique.

## Context

L'agent doit pouvoir telecharger un fichier CSV de l'historique en cours (avec les filtres appliques). Le bouton "Exporter CSV" declenche un telechargement du fichier. Les filtres actifs sont envoyes a l'endpoint /history/export. Le fichier est telecharge directement dans le navigateur.

## Acceptance Criteria

- AC1 : bouton "Exporter CSV" visible en haut de page a cote des filtres
- AC2 : le clic declenche un appel GET /history/export avec les filtres actifs en query params
- AC3 : le fichier CSV se telecharge automatiquement dans le navigateur
- AC4 : le bouton affiche un spinner pendant le telechargement
- AC5 : toast de succes apres telechargement ("Export CSV telecharge")
- AC6 : toast d'erreur en cas d'echec
- AC7 : le bouton est desactive si aucun bulletin dans l'historique (total = 0)

## Implementation Steps

1. Ajouter la fonction exportCSV dans use-bulletin-history.ts (fetch blob + download)
2. Ajouter le bouton "Exporter CSV" dans BulletinsHistoryPage avec icone Download
3. Passer les filtres actifs en query params a l'appel API
4. Creer un lien temporaire pour declencher le telechargement du blob
5. Gerer les etats loading/success/error

## Tests

- Le bouton est visible et cliquable
- Le clic declenche le telechargement d'un fichier .csv
- Les filtres sont passes a l'API
- Le bouton affiche un spinner pendant le telechargement
- Le bouton est desactive si total = 0
- Toast de succes apres telechargement
