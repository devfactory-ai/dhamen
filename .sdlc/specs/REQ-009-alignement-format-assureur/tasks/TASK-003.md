---
id: TASK-003
parent: REQ-009
status: done
dependencies: []
files:
  - packages/db/migrations/0079_add_famille_fields_adherents.sql
  - packages/shared/src/types/adherent.ts
  - packages/shared/src/schemas/adherent.ts
  - apps/api/src/routes/adherents.ts
---

## Objective

Ajouter les champs famille sur la table `adherents` pour supporter le modele prestataire standard : type (A/C/E), rang (00/01-98/99), lien parent, et situation familiale.

## Context

En assurance sante groupe en Tunisie, un adherent principal (rang 00, type A) a des ayants-droit : conjoint (rang 99, type C) et enfants (rang 01 a 98, type E). Chaque prestataire a ses propres plafonds de remboursement. Le systeme actuel stocke les ayants-droit en JSON (`ayants_droit_json`) ce qui ne permet pas un suivi individuel des plafonds ni un rattachement correct des bulletins par prestataire.

## Acceptance Criteria

- AC1 : colonnes ajoutees : `code_type` (A/C/E), `parent_adherent_id` (ref adherents), `rang_pres` (0-99), `code_situation_fam` (C/M/D/V)
- AC2 : un adherent principal a code_type='A', rang_pres=0, parent_adherent_id=NULL
- AC3 : un conjoint a code_type='C', rang_pres=99, parent_adherent_id=id de l'adherent
- AC4 : un enfant a code_type='E', rang_pres=01+, parent_adherent_id=id de l'adherent
- AC5 : endpoint GET `/adherents/:id/famille` retourne l'adherent + tous ses ayants-droit
- AC6 : les types et schemas Zod sont mis a jour

## Implementation Steps

1. Creer migration 0079 : ALTER TABLE adherents avec les 4 colonnes + index sur parent_adherent_id
2. Mettre a jour les types TypeScript dans packages/shared
3. Mettre a jour les schemas Zod
4. Ajouter l'endpoint GET `/adherents/:id/famille` dans adherents.ts

## Tests

- Creation adherent principal avec code_type='A' et rang_pres=0
- Creation conjoint et enfants rattaches via parent_adherent_id
- GET /adherents/:id/famille retourne la famille complete
- Les valeurs invalides sont rejetees (code_type='X', rang_pres=100)
- Un adherent sans parent_adherent_id est considere comme principal
