---
id: TASK-008
parent: REQ-006
status: done
dependencies:
  - TASK-003
  - TASK-004
  - TASK-005
files:
  - apps/api/tests/integration/bulletin-validation.test.ts
---

## Objective

Écrire les tests d'intégration couvrant le workflow complet de validation de bulletin et upload de scan.

## Context

Les tests d'intégration doivent vérifier le workflow de bout en bout : création d'un bulletin par l'agent, validation avec enregistrement du remboursement, upload optionnel d'un scan, et consultation du scan. Ils doivent couvrir les cas nominaux et les cas d'erreur (droits, statuts invalides, fichiers rejetés).

## Acceptance Criteria

- AC1 : test du workflow complet : saisie → validation → scan → consultation
- AC2 : tests des contrôles d'accès (agent d'un autre assureur rejeté)
- AC3 : tests des transitions de statut invalides
- AC4 : tests de l'upload de fichiers invalides (taille, type)
- AC5 : test de la mise à jour du plafond consommé
- AC6 : test de l'audit trail (entrées créées pour chaque action)
- AC7 : coverage > 80% sur les nouveaux endpoints

## Implementation Steps

1. Créer le fichier de test avec setup/teardown (seed données : assureur, agent, adhérent, bulletin)
2. Tests du endpoint validate : cas nominal, double validation, mauvais statut, mauvais assureur
3. Tests du endpoint upload-scan : cas nominal, fichier invalide, remplacement
4. Tests du endpoint get-scan : cas nominal, scan inexistant
5. Test du workflow complet enchaîné

## Tests

- Validation enregistre le bon montant et met à jour le statut
- Double validation retourne 409
- Upload de scan met à jour scan_url et scan_filename
- Téléchargement retourne le bon Content-Type
- Agent non autorisé reçoit 403
- Bulletin inexistant retourne 404
- Plafond adhérent incrémenté du montant remboursé
- Audit logs contiennent les bonnes actions
