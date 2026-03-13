---
id: TASK-003
parent: REQ-006
status: done
dependencies:
  - TASK-001
  - TASK-002
files:
  - apps/api/src/routes/bulletins-agent.ts
---

## Objective

Créer l'endpoint `POST /bulletins-soins/agent/:id/validate` pour permettre à l'agent de valider définitivement un bulletin et enregistrer le remboursement.

## Context

L'agent termine la saisie d'un bulletin (REQ-003) et le calcul du remboursement (REQ-004). Il doit ensuite valider le bulletin pour enregistrer le remboursement et passer au suivant. Le status passe à `approved`. Le `reimbursed_amount` final est enregistré. Un audit trail est créé. La route existante `POST /manage/:id/approve` dans `bulletins-soins.ts` gère le cas côté gestionnaire ; ici c'est la validation agent après saisie.

## Acceptance Criteria

- AC1 : endpoint accessible aux rôles `INSURER_AGENT` et `INSURER_ADMIN`
- AC2 : le bulletin passe au statut `approved` (ou `reimbursed` si paiement immédiat configuré)
- AC3 : `reimbursed_amount` est enregistré en base
- AC4 : `validated_at` et `validated_by` sont renseignés
- AC5 : une entrée audit_logs est créée avec action `bulletin_validated`
- AC6 : si le bulletin est déjà validé ou dans un statut final, retourne une erreur `BULLETIN_ALREADY_VALIDATED`
- AC7 : le plafond consommé de l'adhérent est mis à jour

## Implementation Steps

1. Ajouter la route POST `/:id/validate` dans `bulletins-agent.ts`
2. Valider le body avec `validateBulletinSchema`
3. Vérifier que le bulletin existe et appartient à l'agent (même assureur)
4. Vérifier que le status actuel permet la validation (draft, in_batch, processing)
5. UPDATE du bulletin : status, reimbursed_amount, validated_at, validated_by
6. UPDATE du plafond consommé de l'adhérent
7. INSERT dans audit_logs
8. Retourner le bulletin mis à jour

## Tests

- Validation réussie : status passe à approved, reimbursed_amount enregistré
- Bulletin déjà validé : erreur 409 BULLETIN_ALREADY_VALIDATED
- Bulletin inexistant : erreur 404
- Agent d'un autre assureur : erreur 403
- Montant négatif : erreur 400 validation Zod
- Audit log créé avec les bonnes informations
- Plafond consommé mis à jour correctement
