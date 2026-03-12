---
id: TASK-012
parent: REQ-004
status: done
dependencies: [TASK-009]
files:
  - apps/web/src/features/bulletins/pages/BulletinsSaisiePage.tsx
---

## Objective

Afficher des messages d'alerte pour les cas limites du calcul de remboursement.

## Context

Le calcul de remboursement peut produire des résultats particuliers que l'**agent assurance** doit identifier rapidement :
- Plafond annuel épuisé avant le bulletin → aucun remboursement possible
- Plafond partiellement consommé → remboursement limité
- Acte non référencé → taux 0%, pas de remboursement

## Acceptance Criteria

- AC1 : si `plafond_restant = 0` avant le bulletin, afficher une alerte rouge "Plafond annuel épuisé — aucun remboursement possible"
- AC2 : si au moins un acte a `plafond_depasse = true`, afficher une alerte orange "Remboursement limité par le plafond sur X acte(s)"
- AC3 : si au moins un acte a `taux_remboursement = 0`, afficher une alerte grise "X acte(s) non référencé(s) — taux 0%"
- AC4 : les alertes s'affichent entre le tableau des actes et la section plafond
- AC5 : si aucun cas limite, aucune alerte affichée

## Implementation Steps

1. Calculer les flags depuis les données actes retournées par l'API
2. Créer un composant d'alerte conditionnel (utiliser les variantes de Alert existantes)
3. Insérer entre la table actes et la section plafond
4. Afficher le nombre d'actes concernés dans le message

## Tests

- Bulletin sans cas limite : aucune alerte visible
- Bulletin avec plafond épuisé : alerte rouge
- Bulletin avec 1 acte limité sur 3 : alerte orange "1 acte"
- Bulletin avec 2 actes non référencés : alerte grise "2 actes"
- Combinaison de cas : plusieurs alertes affichées
