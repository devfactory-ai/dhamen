---
id: TASK-005
parent: REQ-007
status: pending
dependencies:
  - TASK-001
  - TASK-003
files:
  - apps/web/src/features/bulletins/pages/BulletinsHistoryPage.tsx
  - apps/web/src/hooks/use-bulletin-history.ts
---

## Objective

Creer la page BulletinsHistoryPage avec le tableau pagine, les filtres et les statistiques.

## Context

La page principale de l'historique affiche en haut des cards statistiques (total rembourse, nombre par statut) et en dessous un tableau pagine des bulletins. Une barre de filtres permet de filtrer par adherent, periode, type de soin et statut. Le hook use-bulletin-history.ts encapsule les appels API avec TanStack Query.

## Acceptance Criteria

- AC1 : cards statistiques affichent : total rembourse, nb bulletins approuves, nb rembourses, nb rejetes
- AC2 : tableau avec colonnes : Numero, Date, Adherent, Type Soin, Montant Declare, Montant Rembourse, Statut, Actions
- AC3 : filtre adherent par champ texte (recherche par nom ou matricule)
- AC4 : filtre periode avec deux champs date (debut, fin)
- AC5 : filtre type de soin en dropdown (consultation, pharmacie, hospitalisation, laboratoire, radio, optique, dentaire)
- AC6 : filtre statut en dropdown (approved, reimbursed, rejected)
- AC7 : bouton "Reinitialiser" pour effacer tous les filtres
- AC8 : pagination fonctionnelle (precedent, suivant, numero de page)
- AC9 : badge couleur pour le statut (vert=approved, bleu=reimbursed, rouge=rejected)
- AC10 : bouton "Voir details" sur chaque ligne

## Implementation Steps

1. Creer le hook use-bulletin-history.ts avec useQuery pour /history, /history/stats
2. Creer BulletinsHistoryPage.tsx avec layout : stats cards + filtres + table
3. Implementer les filtres avec state local et debounce pour la recherche adherent
4. Connecter les filtres aux query params du hook
5. Afficher les stats cards avec les donnees de /history/stats
6. Implementer la pagination avec les meta de la reponse
7. Formatter les montants en TND et les dates en format local

## Tests

- Les statistiques s'affichent correctement
- Le tableau affiche les bulletins pagines
- Les filtres modifient les resultats affiches
- Le bouton reinitialiser efface tous les filtres
- La pagination fonctionne (changement de page)
- Les badges statut ont les bonnes couleurs
- Les montants sont formates en TND (3 decimales)
