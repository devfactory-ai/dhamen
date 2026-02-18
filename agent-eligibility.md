# Spec — Agent Éligibilité

## Résumé

Agent responsable de la vérification en temps réel de l'éligibilité d'un adhérent à une prise en charge. SLA cible : < 100ms (p99).

## Localisation

`apps/api/src/agents/eligibility/`

## Interface

```typescript
// Input
interface EligibilityCheckInput {
  adherentId: string;
  providerId: string;
  claimType: 'pharmacy' | 'consultation' | 'hospitalization';
  date: string; // ISO 8601
  items?: { code: string; quantity: number }[]; // Optionnel pour pré-check
}

// Output
interface EligibilityCheckResult {
  eligible: boolean;
  reason?: string;                // Si non éligible
  contractId: string;
  planType: string;
  remainingCoverage: {
    annual: { used: number; limit: number; remaining: number };
    perEvent?: { limit: number };
  };
  restrictions: string[];         // Ex: "generic_only", "network_only"
  expiresAt: string;              // Expiration du contrat
  cacheHit: boolean;
  processingTimeMs: number;
}
```

## Route API

```
POST /api/v1/eligibility/check
Authorization: Bearer <jwt>
Roles: PHARMACIST, DOCTOR, LAB_MANAGER, CLINIC_ADMIN, INSURER_AGENT
```

## Règles métier

| # | Règle | Condition de rejet | Priorité |
|---|---|---|---|
| R1 | Contrat actif | `contract.status !== 'active'` ou `date > contract.end_date` | P0 |
| R2 | Période de carence | `date < contract.start_date + carence_days` | P0 |
| R3 | Plafond annuel | `total_claims_year >= contract.annual_limit` | P0 |
| R4 | Exclusions | `claimType in contract.exclusions` | P0 |
| R5 | Conventionnement | `provider.insurer_convention[insurerId].active !== true` | P0 |
| R6 | Type de soin couvert | `claimType not in contract.covered_types` | P0 |

Les règles sont évaluées séquentiellement. Le premier rejet arrête l'évaluation.

## Stratégie de cache

```
Clé: elig:{contractId}:{claimType}:{YYYY-MM-DD}
TTL: 5 minutes
Invalidation: 
  - Modification du contrat → purge elig:{contractId}:*
  - Nouvelle claim validée → purge elig:{contractId}:{claimType}:*
```

## Fichiers

```
eligibility/
├── eligibility.agent.ts       # Classe EligibilityAgent
├── eligibility.rules.ts       # Règles R1-R6 (fonctions pures)
├── eligibility.types.ts       # Types input/output
├── eligibility.cache.ts       # Logique cache KV
├── eligibility.test.ts        # Tests unitaires (20+ cas)
└── index.ts                   # Export
```

## Cas de test requis

1. Adhérent avec contrat actif, tous droits → éligible
2. Contrat expiré → rejet R1
3. Contrat pas encore démarré (carence) → rejet R2
4. Plafond annuel atteint → rejet R3
5. Plafond annuel à 90% → éligible avec warning
6. Type de soin exclu → rejet R4
7. Prestataire non conventionné → rejet R5
8. Type de soin non couvert → rejet R6
9. Cache hit → résultat identique, < 5ms
10. Cache miss → résultat correct, < 100ms
11. Contrat avec restrictions (génériques only)
12. Multiple contrats pour même adhérent → prendre le plus récent actif
13. Adhérent inexistant → erreur 404
14. Prestataire inexistant → erreur 404
15. Input invalide (Zod) → erreur 400
