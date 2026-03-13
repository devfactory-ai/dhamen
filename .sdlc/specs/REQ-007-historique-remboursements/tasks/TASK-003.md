---
id: TASK-003
parent: REQ-007
status: pending
dependencies: []
files:
  - apps/api/src/routes/bulletins-soins.ts
---

## Objective

Creer l'endpoint GET /bulletins-soins/history/stats pour afficher les statistiques agregees des remboursements.

## Context

L'agent doit voir un resume chiffre en haut de la page historique : total rembourse, nombre de bulletins par statut, repartition par type de soin, et evolution mensuelle. Les statistiques sont filtrables par periode (dateFrom, dateTo) pour permettre des analyses sur des periodes specifiques.

## Acceptance Criteria

- AC1 : retourne le nombre total de bulletins par statut (approved, reimbursed, rejected)
- AC2 : retourne le montant total rembourse (SUM reimbursed_amount des bulletins reimbursed)
- AC3 : retourne le montant total declare (SUM total_amount)
- AC4 : retourne la repartition par type de soin (care_type) avec count et montant
- AC5 : retourne l'evolution mensuelle (count et montant par mois) sur les 12 derniers mois
- AC6 : filtrable par periode (dateFrom, dateTo)
- AC7 : accessible aux roles INSURER_AGENT et INSURER_ADMIN

## Implementation Steps

1. Ajouter la route GET /history/stats dans bulletins-soins.ts (avant /history/:id)
2. Requete COUNT + SUM groupee par status
3. Requete COUNT + SUM groupee par care_type
4. Requete COUNT + SUM groupee par mois (strftime('%Y-%m', bulletin_date))
5. Appliquer les filtres de periode si fournis
6. Assembler et retourner la reponse

## Tests

- Retourne les totaux corrects par statut
- Retourne le montant total rembourse correct
- Repartition par type de soin avec count et montant
- Evolution mensuelle sur 12 mois
- Filtre par periode fonctionne (exclut les bulletins hors periode)
- Retourne des zeros si aucun bulletin
