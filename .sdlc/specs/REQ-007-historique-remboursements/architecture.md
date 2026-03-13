---
id: REQ-007
title: Historique des remboursements
status: draft
priority: must
---

# Architecture
# Historique remboursements

## Source des données

Les remboursements proviennent des bulletins validés.

Tables utilisées :

bulletins

bulletin_actes

remboursements

---

## Requête principale

SELECT *
FROM remboursements
WHERE adherent_id = ?

ORDER BY date DESC

---

## Calcul consommation plafond

plafond_consomme =
SUM(remboursements)

plafond_restant =
plafond_annuel - plafond_consomme
## Endpoints API

### GET /api/v1/bulletins-soins/history
Liste paginee des bulletins avec statut final (approved, reimbursed, rejected).
Query params : adherentId, dateFrom, dateTo, careType, status, page, limit, sortBy, sortOrder.
Jointures : adherents (nom, matricule), actes_bulletin (count, total).

### GET /api/v1/bulletins-soins/history/:id
Detail complet d'un bulletin : informations adherent, liste des actes avec
taux/montant/plafond, scan attache (lien), dates de traitement, agent validateur.

### GET /api/v1/bulletins-soins/history/stats
Statistiques agregees : total rembourse, nombre par statut, repartition par type de soin,
evolution mensuelle. Filtrable par periode.

### GET /api/v1/bulletins-soins/history/export
Export CSV de l'historique avec les memes filtres que la liste.
Colonnes : numero bulletin, date, adherent, type soin, montant declare,
montant rembourse, statut, date validation.

## Frontend

### Page BulletinsHistoryPage
- Route : /bulletins/history
- Barre de filtres (adherent autocomplete, date range, type soin, statut)
- Cards statistiques en haut (total rembourse, nb bulletins, repartition)
- DataTable paginee avec colonnes : numero, date, adherent, type, declare, rembourse, statut, actions
- Bouton export CSV
- Dialog detail bulletin au clic

### Composants
- HistoryFilters : barre de filtres avec reset
- HistoryStats : cards statistiques avec sparklines
- BulletinDetailDialog : detail complet avec onglets (infos, actes, scan)

## Donnees

Pas de nouvelle table ni migration necessaire.
Toutes les donnees existent deja dans : bulletins_soins, actes_bulletin, adherents.
Les colonnes validated_at, validated_by, approved_date, reimbursed_amount sont deja presentes.

## Securite

- Accessible uniquement aux roles INSURER_AGENT et INSURER_ADMIN
- L'agent ne voit que les bulletins de son assureur (filtre par insurer_id via JWT)
- Export CSV limite a 10 000 lignes pour eviter les abus
