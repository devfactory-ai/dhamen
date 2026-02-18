# Spec — Agent Tarification

## Résumé

Agent responsable du calcul de la prise en charge (PEC) et du ticket modérateur pour chaque demande de soin. Gère les barèmes multi-assureurs, franchises, plafonds par catégorie.

## Localisation

`apps/api/src/agents/tarification/`

## Interface

```typescript
// Input
interface TarificationInput {
  contractId: string;
  insurerId: string;
  providerType: 'pharmacist' | 'doctor' | 'lab' | 'clinic';
  items: TarificationItem[];
}

interface TarificationItem {
  code: string;           // Code médicament, acte, ou prestation
  label: string;          // Libellé
  quantity: number;
  unitPrice: number;      // Prix unitaire en millimes TND
  isGeneric?: boolean;    // Pour médicaments: générique ou princeps
  category?: string;      // Catégorie de soin (optique, dentaire, etc.)
}

// Output
interface TarificationResult {
  totalAmount: number;          // Total facture en millimes
  coveredAmount: number;        // PEC assureur en millimes
  copayAmount: number;          // Ticket modérateur adhérent en millimes
  items: TarificationItemResult[];
  baremeVersion: string;        // Version du barème appliqué
  warnings: string[];           // Ex: "princeps_surcharge_applied"
  processingTimeMs: number;
}

interface TarificationItemResult {
  code: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  coveredAmount: number;
  copayAmount: number;
  reimbursementRate: number;    // 0.0 - 1.0
  ruleApplied: string;         // Quelle règle barème
  capped: boolean;             // Plafonné?
  cappedAt?: number;           // Montant plafond appliqué
}
```

## Route API

```
POST /api/v1/tarification/calculate
Authorization: Bearer <jwt>
Roles: PHARMACIST, DOCTOR, LAB_MANAGER, CLINIC_ADMIN, INSURER_AGENT
```

## Règles de calcul

### 1. Chargement du barème

```
Barème = baremes[insurerId][providerType][baremeVersion]
Cache KV: tariff:{insurerId}:{providerType} → TTL 1h
```

Chaque assureur a son propre barème avec :
- Taux de remboursement par catégorie de soin
- Prix de référence par code médicament/acte
- Plafonds par catégorie et par événement
- Règles génériques vs princeps

### 2. Calcul par item

```
Pour chaque item:
  1. Trouver le taux de remboursement: barème[item.category] || barème.default
  2. Prix de référence: min(item.unitPrice, barème.refPrice[item.code] || item.unitPrice)  
  3. Si princeps et générique existe: appliquer surcharge (ex: rembourser au prix générique)
  4. Montant remboursable = prixRef * quantity * taux
  5. Vérifier plafond catégorie: min(montant, plafondCategorie - dejaConsomme)
  6. Vérifier plafond événement: min(montant, plafondEvenement)
  7. Copay = lineTotal - coveredAmount
```

### 3. Franchise

```
Si franchise configurée:
  Les N premiers dinars sont à la charge de l'adhérent
  franchise = min(franchise_amount, totalCovered)
  totalCovered -= franchise
  totalCopay += franchise
```

### 4. Gestion génériques vs princeps

```
Si item.isGeneric === false ET générique existe dans le barème:
  prixRef = barème.genericPrice[item.code]  // Rembourser au prix du générique
  warning: "princeps_surcharge_applied"
```

## Fichiers

```
tarification/
├── tarification.agent.ts      # Classe TarificationAgent
├── tarification.rules.ts      # Moteur de calcul
├── tarification.bareme.ts     # Chargement et cache des barèmes
├── tarification.types.ts      # Types input/output
├── tarification.test.ts       # Tests unitaires (15+ cas)
└── index.ts
```

## Cas de test requis

1. Calcul simple : 1 médicament, taux 80% → PEC correcte
2. Multi-items : 5 médicaments, taux variés
3. Plafond catégorie atteint → montant cappé
4. Plafond événement atteint
5. Franchise appliquée (premiers 10 TND à charge adhérent)
6. Princeps avec générique disponible → remboursement au prix générique
7. Générique → remboursement normal
8. Code inconnu dans le barème → taux par défaut
9. Quantité 0 → erreur validation
10. Prix unitaire 0 → erreur validation
11. Barème v1 vs v2 → résultats différents correctement
12. Cache barème KV hit vs miss
13. Adhérent avec consommation annuelle partielle → plafond résiduel correct
14. Items mixtes (médicaments + dispositifs médicaux) → taux différents
15. Montant total = somme des items (vérification arrondi)
