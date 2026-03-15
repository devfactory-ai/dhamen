---
id: TASK-001
parent: REQ-008
status: done
dependencies: []
files:
  - apps/api/src/routes/bulletins-agent.ts
---

## Objective

Modifier l'endpoint GET /bulletins-soins/batches/:id/export pour generer un CSV conforme au format REQ-008 : deux colonnes (matricule_adherent, montant_remboursement), encodage UTF-8 BOM, nom de fichier `dhamen_lot_{lot_id}_{date}.csv`.

## Context

L'endpoint existe deja dans bulletins-agent.ts (ligne 167) mais exporte 13 colonnes. Le requirement REQ-008 demande un format simplifie a 2 colonnes pour le traitement comptable par l'assureur. L'export doit filtrer uniquement les bulletins valides (status approved/reimbursed) du lot et utiliser le reimbursed_amount comme montant_remboursement. L'endpoint doit aussi creer un audit trail et marquer le lot comme exporte.

## Acceptance Criteria

- AC1 : le CSV contient exactement deux colonnes : matricule_adherent, montant_remboursement
- AC2 : seuls les bulletins avec statut IN ('approved', 'reimbursed') sont inclus
- AC3 : le fichier est encode en UTF-8 avec BOM (\uFEFF)
- AC4 : le separateur est la virgule (,) conformement au format defini dans architecture.md
- AC5 : le nom du fichier suit le pattern dhamen_lot_{lot_id}_{YYYY-MM-DD}.csv
- AC6 : le lot est marque comme 'exported' apres l'export (status + exported_at)
- AC7 : les bulletins du lot sont marques comme 'exported'
- AC8 : un audit trail est cree (action: 'batch_csv_export', entity: bulletin_batches)
- AC9 : les roles INSURER_AGENT et INSURER_ADMIN peuvent exporter
- AC10 : INSURER_ADMIN peut exporter tout lot de son assureur (pas seulement ses propres lots)

## Implementation Steps

1. Modifier la requete SQL pour selectionner uniquement adherent_matricule et reimbursed_amount des bulletins valides
2. Changer le format CSV pour 2 colonnes avec header matricule_adherent,montant_remboursement
3. Mettre a jour le nom de fichier au format dhamen_lot_{id}_{date}.csv
4. Ajouter la verification de ownership par insurer pour INSURER_ADMIN (JOIN companies)
5. Ajouter l'insertion dans audit_logs apres l'export

## Tests

- Export retourne un CSV avec exactement 2 colonnes + header
- Seuls les bulletins approved/reimbursed apparaissent (pas draft, in_batch, rejected)
- Le fichier commence par le BOM UTF-8
- Le nom du fichier suit le pattern attendu
- Le lot passe en statut 'exported' apres l'export
- Un audit log est cree avec l'action batch_csv_export
- INSURER_ADMIN peut exporter un lot cree par un autre agent du meme assureur
- INSURER_AGENT ne peut exporter que ses propres lots
- Retourne 404 si le lot n'existe pas ou n'appartient pas a l'utilisateur
- Retourne 403 si le role n'est pas autorise
