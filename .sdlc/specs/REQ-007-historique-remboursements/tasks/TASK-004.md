---
id: TASK-004
parent: REQ-007
status: pending
dependencies: []
files:
  - apps/api/src/routes/bulletins-soins.ts
---

## Objective

Creer l'endpoint GET /bulletins-soins/history/export pour exporter l'historique en CSV.

## Context

L'agent doit pouvoir telecharger un fichier CSV de l'historique filtre. Le CSV utilise les memes filtres que la liste (adherentId, dateFrom, dateTo, careType, status). Le fichier est retourne directement en streaming avec Content-Type text/csv et Content-Disposition attachment. Limite a 10 000 lignes pour eviter les abus de performance.

## Acceptance Criteria

- AC1 : retourne un fichier CSV valide avec header Content-Type: text/csv
- AC2 : header Content-Disposition: attachment; filename="historique-remboursements-YYYY-MM-DD.csv"
- AC3 : colonnes CSV : Numero Bulletin, Date, Adherent Matricule, Adherent Nom, Type Soin, Montant Declare, Montant Rembourse, Statut, Date Validation
- AC4 : supporte les memes filtres que GET /history (adherentId, dateFrom, dateTo, careType, status)
- AC5 : separateur point-virgule (standard francophone pour Excel)
- AC6 : limite a 10 000 lignes maximum
- AC7 : encodage UTF-8 avec BOM pour compatibilite Excel
- AC8 : accessible aux roles INSURER_AGENT et INSURER_ADMIN

## Implementation Steps

1. Ajouter la route GET /history/export dans bulletins-soins.ts (avant /history/:id)
2. Reutiliser la logique de construction de requete de TASK-001 (filtres)
3. Limiter a 10 000 resultats (LIMIT 10000)
4. Construire le CSV avec BOM UTF-8 + header + lignes
5. Retourner la Response avec les bons headers

## Tests

- Retourne un fichier CSV valide avec le bon Content-Type
- Le CSV contient toutes les colonnes attendues
- Les filtres s'appliquent correctement au CSV
- Le CSV est limite a 10 000 lignes
- Le CSV est encode en UTF-8 avec BOM
- Le separateur est un point-virgule
- Le nom du fichier contient la date du jour
