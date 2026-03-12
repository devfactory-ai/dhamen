---
id: TASK-010
parent: REQ-004
status: done
dependencies: [TASK-008]
files:
  - apps/web/src/features/bulletins/pages/BulletinsSaisiePage.tsx
---

## Objective

Améliorer la section plafond pour afficher l'impact du bulletin sur le plafond annuel de l'**adhérent**.

## Context

Le workflow du domaine (REQ-000) : Calcul remboursement → Vérification plafond → Validation. L'**agent assurance** doit voir clairement comment le bulletin impacte le plafond de l'adhérent pour valider le traitement.

## Acceptance Criteria

- AC1 : afficher "Plafond global" = plafond annuel total
- AC2 : afficher "Consommé avant ce bulletin" = plafond_consomme - reimbursed_amount du bulletin
- AC3 : afficher "Remboursement ce bulletin" = reimbursed_amount
- AC4 : afficher "Restant après traitement" = plafond_global - plafond_consomme
- AC5 : barre de progression avec 3 segments visuels : consommé avant (gris), ce bulletin (vert/orange), restant (vide)

## Implementation Steps

1. Utiliser `plafond_consomme_avant` retourné par l'API (TASK-008)
2. Restructurer la section plafond avec les 4 lignes
3. Implémenter la barre de progression segmentée
4. Couleur orange si le bulletin consomme > 50% du restant

## Tests

- Bulletin sur adhérent avec plafond vierge : avant = 0, restant = plafond - bulletin
- Bulletin sur adhérent avec plafond déjà consommé : affiche les 3 segments
- Plafond atteint : barre pleine, badge "Plafond atteint"
