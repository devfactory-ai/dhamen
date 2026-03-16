---
id: TASK-007
parent: REQ-009
status: done
dependencies: [TASK-004]
files:
  - apps/api/src/routes/bulletins-agent.ts
  - apps/web/src/features/agent/hooks/use-batches.ts
  - apps/web/src/features/agent/bulletins/pages/BulletinsSaisiePage.tsx
---

## Objective

Enrichir l'export CSV recap avec les colonnes du format CTRL standard (9 colonnes) et ajouter un export bordereau detaille avec toutes les lignes d'actes.

## Context

L'export CSV actuel (REQ-008) ne contient que 2 colonnes (matricule, montant). Le format standard d'echange avec les assureurs tunisiens comprend : un fichier CTRL recap par adherent (9 colonnes : numero contrat, souscripteur, numero bordereau, matricule, nom, prenom, RIB, montant) et un fichier bordereau detaille avec toutes les lignes d'actes (num contrat, matricule, rang, nom, date, code acte, frais engages, montant rembourse, observations, professionnel de sante, etc.).

## Acceptance Criteria

- AC1 : export recap (CTRL) contient : Numero_De_Contrat, Souscripteur, Numero_De_Bordereau, Matricule_Isante, Matricule_Assureur, Nom, Prenom, Rib, Remb
- AC2 : export detaille contient toutes les lignes d'actes avec Num_Cont, Mat, Rang_Pres, Nom_Pren_Prest, Dat_Bs, Cod_Act, Frais_Engag, Mnt_Act_Remb, Cod_Msgr, Lib_Msgr, Ref_Prof_Sant, Nom_Prof_Sant
- AC3 : deux boutons distincts dans la vue lot : "Export recap" et "Export detaille"
- AC4 : les deux exports sont en UTF-8 BOM avec separateur virgule
- AC5 : les roles INSURER_AGENT et INSURER_ADMIN peuvent exporter les deux formats

## Implementation Steps

1. Modifier l'endpoint export recap dans bulletins-agent.ts pour inclure les 9 colonnes CTRL
2. Ajouter un endpoint GET `/lots/:id/export-detail.csv` pour le bordereau detaille
3. Ajouter le hook frontend pour le second export
4. Ajouter le bouton "Export detaille" dans la page

## Tests

- Export recap contient exactement 9 colonnes + header
- Export detaille contient toutes les lignes d'actes du lot
- Les deux exports commencent par le BOM UTF-8
- Les roles autorises peuvent acceder aux deux exports
- Retourne 404 si lot inexistant, 403 si role non autorise
