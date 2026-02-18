# Spec — Agent Anti-Fraude v1

## Résumé

Agent de scoring de risque sur chaque transaction. V1 utilise des règles déterministes. Score 0-100 avec 3 niveaux d'action.

## Localisation

`apps/api/src/agents/fraud/`

## Interface

```typescript
// Input
interface FraudCheckInput {
  claim: {
    id: string;
    type: 'pharmacy' | 'consultation' | 'hospitalization';
    providerId: string;
    adherentId: string;
    items: { code: string; quantity: number; unitPrice: number }[];
    totalAmount: number;
    date: string;
  };
  provider: {
    id: string;
    type: string;
    registrationDate: string;
  };
  adherent: {
    id: string;
    contractId: string;
  };
}

// Output
interface FraudCheckResult {
  score: number;              // 0-100
  level: 'ok' | 'review' | 'block';
  flags: FraudFlag[];
  recommendation: string;
  details: Record<string, unknown>;
  processingTimeMs: number;
}

interface FraudFlag {
  rule: string;               // Ex: "DUPLICATE_CLAIM"
  severity: number;           // Points ajoutés au score
  description: string;
  evidence: Record<string, unknown>;
}
```

## Niveaux de score

| Score | Niveau | Action |
|---|---|---|
| 0-30 | `ok` | Auto-approve, pas d'intervention |
| 31-70 | `review` | Claim créée mais flaggée pour revue manuelle assureur |
| 71-100 | `block` | Claim bloquée, alerte immédiate assureur |

Les seuils sont configurables par assureur dans `insurer.config_json.fraud_thresholds`.

## Règles v1

| # | Règle | Détection | Points |
|---|---|---|---|
| F1 | Doublon | Même adhérent + même prestataire + même type + même jour | +40 |
| F2 | Incompatibilité médicamenteuse | 2+ médicaments incompatibles dans la même ordonnance (base de règles) | +25 |
| F3 | Surfacturation | Prix unitaire > 150% du prix de référence barème | +30 |
| F4 | Fréquence anormale | > 3 claims du même type dans les 7 derniers jours | +20 |
| F5 | Hors zone | Distance prestataire ↔ adresse adhérent > 100km | +15 |

Le score final = min(100, somme des points des règles déclenchées).

## Données nécessaires (requêtes D1)

```sql
-- F1: Vérifier doublons
SELECT COUNT(*) FROM claims
WHERE adherent_id = ? AND provider_id = ? AND type = ?
AND DATE(created_at) = DATE(?)
AND status != 'rejected';

-- F4: Fréquence
SELECT COUNT(*) FROM claims
WHERE adherent_id = ? AND type = ?
AND created_at > datetime('now', '-7 days')
AND status != 'rejected';
```

## Intégration orchestrateur

L'anti-fraude est appelé APRÈS éligibilité et tarification, AVANT la validation finale :

```
Si score >= block_threshold:
  claim.status = 'blocked'
  → Notification assureur (queue)
  → Réponse API: { approved: false, reason: "fraud_detected" }

Si score >= review_threshold:
  claim.status = 'pending_review'
  claim.fraud_score = score
  claim.fraud_flags = flags
  → Notification assureur (queue)
  → Réponse API: { approved: true, warning: "under_review" }

Si score < review_threshold:
  claim.status = 'approved'
  claim.fraud_score = score
```

## Fichiers

```
fraud/
├── fraud.agent.ts            # Classe FraudAgent
├── fraud.rules.ts            # Règles F1-F5 (fonctions pures)
├── fraud.scoring.ts          # Calcul score composite
├── fraud.types.ts            # Types
├── fraud.test.ts             # Tests (20+ scénarios)
├── data/
│   └── drug-interactions.ts  # Base incompatibilités médicamenteuses
└── index.ts
```

## Cas de test requis

1. Claim normale, aucune règle déclenchée → score 0, ok
2. Doublon exact (même jour, même prestataire) → F1, score ≥ 40
3. 2 médicaments incompatibles → F2, score ≥ 25
4. Prix 200% du référence → F3, score ≥ 30
5. 4ème claim en 7 jours → F4, score ≥ 20
6. Prestataire à 150km de l'adhérent → F5, score ≥ 15
7. Combinaison F1 + F3 → score ≥ 70 → block
8. Combinaison F4 + F5 → score ≥ 35 → review
9. Claim avec score = 31 → review (seuil exact)
10. Claim avec score = 30 → ok (seuil exact)
11. Seuils personnalisés par assureur → respectés
12. Claim rejetée précédemment ne compte pas dans F4
13. Première claim du prestataire (nouveau) → score 0
14. Input invalide → erreur 400
15. Performance : < 200ms sur claim avec historique
