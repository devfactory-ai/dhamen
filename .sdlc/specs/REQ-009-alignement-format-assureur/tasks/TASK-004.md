---
id: TASK-004
parent: REQ-009
status: done
dependencies: []
files:
  - packages/db/migrations/0080_add_bulletin_fields.sql
  - packages/shared/src/types/bulletin.ts
  - packages/shared/src/schemas/bulletin-soins.ts
---

## Objective

Ajouter les champs metier sur `bulletins_soins` et `actes_bulletin` pour supporter le format standard des bordereaux assureur : references physiques, rang prestataire, observations, et professionnel de sante.

## Context

Les bordereaux d'assurance sante en Tunisie contiennent des champs specifiques par bulletin (references physiques, rang prestataire) et par acte (nombre cle, montant revise, code message, professionnel de sante). Ces champs sont necessaires pour l'export du bordereau detaille et pour le suivi des observations/rejets par l'assureur.

## Acceptance Criteria

- AC1 : colonnes ajoutees a `bulletins_soins` : ref_bs_phys_ass, ref_bs_phys_clt, rang_bs, rang_pres, nom_adherent
- AC2 : colonnes ajoutees a `actes_bulletin` : nbr_cle, mnt_revise, mnt_red_if_avanc, mnt_act_a_regl, cod_msgr, lib_msgr, ref_prof_sant, nom_prof_sant
- AC3 : tous les nouveaux champs sont optionnels (NULL par defaut) pour retrocompatibilite
- AC4 : les schemas Zod acceptent ces champs a la creation et mise a jour
- AC5 : les bulletins existants restent valides apres migration

## Implementation Steps

1. Creer migration 0080 : ALTER TABLE bulletins_soins + ALTER TABLE actes_bulletin
2. Mettre a jour les types TypeScript dans packages/shared
3. Mettre a jour les schemas Zod

## Tests

- Creation bulletin avec tous les nouveaux champs remplis
- Creation bulletin sans les nouveaux champs (retrocompatibilite)
- Les champs observations (cod_msgr, lib_msgr) acceptent du texte libre
- Le champ ref_prof_sant accepte un identifiant alphanumerique
