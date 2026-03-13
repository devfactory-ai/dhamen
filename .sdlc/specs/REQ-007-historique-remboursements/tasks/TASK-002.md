---
id: TASK-002
parent: REQ-007
status: pending
dependencies: []
files:
  - apps/api/src/routes/bulletins-soins.ts
---

## Objective

Creer l'endpoint GET /bulletins-soins/history/:id pour afficher le detail complet d'un bulletin avec ses actes, informations adherent et scan.

## Context

L'agent doit pouvoir cliquer sur un bulletin dans l'historique pour voir son detail complet. Cela inclut les informations de l'adherent, la liste des actes avec taux et montant rembourse, le lien vers le scan attache, et les dates de traitement (validation, paiement). Les donnees proviennent de bulletins_soins, actes_bulletin et adherents.

## Acceptance Criteria

- AC1 : retourne les informations completes du bulletin (toutes les colonnes pertinentes)
- AC2 : inclut les informations adherent (nom, prenom, matricule, national_id, plafond_global, plafond_consomme)
- AC3 : inclut la liste des actes avec code, label, amount, taux_remboursement, montant_rembourse, plafond_depasse
- AC4 : inclut les informations de scan (scan_url, scan_filename) si present
- AC5 : inclut les dates de workflow (validated_at, validated_by, approved_date, payment_date)
- AC6 : retourne 404 si le bulletin n'existe pas ou n'a pas un statut final
- AC7 : accessible aux roles INSURER_AGENT et INSURER_ADMIN

## Implementation Steps

1. Ajouter la route GET /history/:id dans bulletins-soins.ts (apres /history et avant les autres :id)
2. Requete principale sur bulletins_soins avec LEFT JOIN adherents
3. Requete secondaire sur actes_bulletin WHERE bulletin_id = ?
4. Assembler la reponse avec informations bulletin + adherent + actes + scan
5. Calculer le plafond restant (plafond_global - plafond_consomme)
6. Retourner 404 si bulletin inexistant ou statut non final

## Tests

- Retourne le detail complet pour un bulletin approved
- Retourne le detail complet pour un bulletin reimbursed
- Retourne le detail complet pour un bulletin rejected
- Inclut la liste des actes avec tous les champs
- Inclut les informations adherent avec plafond
- Inclut le scan si present, null sinon
- Retourne 404 pour un bulletin draft (statut non final)
- Retourne 404 pour un id inexistant
