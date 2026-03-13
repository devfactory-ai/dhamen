---
id: TASK-006
parent: REQ-006
status: done
dependencies:
  - TASK-003
files:
  - apps/web/src/features/bulletins/pages/BulletinsValidationPage.tsx
  - apps/web/src/hooks/use-bulletin-validation.ts
---

## Objective

Ajouter le bouton « Valider bulletin » et la modale de confirmation dans la page de validation agent.

## Context

`BulletinsValidationPage.tsx` existe déjà et affiche les bulletins en cours de traitement. Il faut ajouter un bouton de validation qui déclenche l'enregistrement définitif du remboursement. Une modale de confirmation affiche le récapitulatif (adhérent, actes, montant) avant validation.

## Acceptance Criteria

- AC1 : bouton « Valider le bulletin » visible sur chaque bulletin en statut `draft`, `in_batch`, ou `processing`
- AC2 : clic ouvre une modale de confirmation avec récapitulatif : adhérent, montant total, montant remboursé, nombre d'actes
- AC3 : champ `notes` optionnel dans la modale
- AC4 : confirmation appelle `POST /bulletins-soins/agent/:id/validate`
- AC5 : succès : toast de confirmation, bulletin disparaît de la liste ou passe en statut `approved`
- AC6 : erreur : toast d'erreur avec message explicite
- AC7 : bouton désactivé pendant le chargement (pas de double-clic)

## Implementation Steps

1. Créer le hook `use-bulletin-validation.ts` avec `useMutation` TanStack Query
2. Ajouter le bouton dans la ligne ou le détail du bulletin
3. Créer la modale `AlertDialog` de confirmation avec récapitulatif
4. Connecter la mutation au bouton de confirmation
5. Gérer les états loading/success/error
6. Invalider le cache de la liste des bulletins après validation

## Tests

- Le bouton apparaît uniquement pour les statuts éligibles
- La modale affiche les bonnes informations
- Après validation, le bulletin est retiré de la liste active
- En cas d'erreur API, un toast d'erreur s'affiche
- Le bouton est désactivé pendant le loading
