---
id: TASK-002
parent: REQ-008
status: done
dependencies: []
files:
  - apps/api/src/routes/bulletins-agent.ts
---

## Objective

Ajouter la validation Zod sur les query params de l'endpoint d'export et gerer les cas limites : lot vide, lot deja exporte, bulletins sans matricule.

## Context

L'endpoint d'export actuel ne valide pas les entrees et ne gere pas les cas limites. Il faut ajouter une validation Zod pour le parametre id, gerer le cas d'un lot sans bulletins valides (retourner un CSV vide avec header), empecher le re-export d'un lot deja exporte (sauf avec un query param force=true), et gerer les bulletins dont le matricule adherent est manquant.

## Acceptance Criteria

- AC1 : le parametre :id est valide (non vide)
- AC2 : un lot sans bulletins valides retourne un CSV avec uniquement le header
- AC3 : un lot deja exporte (status='exported') retourne une erreur 409 sauf si ?force=true
- AC4 : les bulletins sans adherent_matricule utilisent la valeur 'INCONNU' dans le CSV
- AC5 : les bulletins sans reimbursed_amount utilisent 0 dans le CSV
- AC6 : le nombre maximum de bulletins exportes est limite a 5000

## Implementation Steps

1. Ajouter un schema Zod pour valider le parametre id et le query param force
2. Verifier le statut du lot avant l'export — retourner 409 si deja exporte sans force
3. Gerer le fallback matricule et montant pour les bulletins incomplets
4. Ajouter une limite LIMIT 5000 a la requete SQL
5. Retourner un CSV avec header seul si aucun bulletin valide

## Tests

- Lot vide genere un CSV avec header uniquement
- Lot deja exporte retourne 409 BATCH_ALREADY_EXPORTED
- Lot deja exporte avec force=true retourne le CSV normalement
- Bulletin sans matricule utilise 'INCONNU'
- Bulletin sans reimbursed_amount utilise 0
- Plus de 5000 bulletins sont tronques a 5000
