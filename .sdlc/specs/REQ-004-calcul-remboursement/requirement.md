---
id: REQ-004
title: Calcul automatique des remboursements
status: draft
priority: must
---

# Description

Le système doit calculer automatiquement le montant remboursé pour
chaque acte médical déclaré dans un bulletin de soins.

Le calcul dépend :

- du montant déclaré
- du taux de remboursement de l’acte
- du plafond annuel restant de l’adhérent

Le calcul doit être exécuté automatiquement lors de la validation
d’un bulletin.

---

# Acteurs

Agent assurance

---

# User Story

En tant qu’agent,
je veux que le système calcule automatiquement le remboursement
afin d’éviter les erreurs manuelles et accélérer le traitement
des bulletins.

---

# Règle de calcul

remboursement_brut = montant_acte × taux_remboursement

remboursement_final = min(remboursement_brut, plafond_restant)

---

# Acceptance Criteria

AC1 : le remboursement est calculé pour chaque acte

AC2 : le plafond annuel est respecté

AC3 : le total du bulletin est calculé automatiquement

AC4 : le calcul est déterministe et reproductible

AC5 : le système retourne le détail par acte