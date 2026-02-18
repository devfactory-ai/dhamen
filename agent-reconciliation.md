# Spec — Agent Réconciliation

## Résumé

Agent de génération des bordereaux de paiement (assureur → prestataire). Collecte les claims validées sur une période, totalise par prestataire, génère un PDF et le stocke dans R2.

## Localisation

`apps/api/src/agents/reconciliation/`

## Interface

```typescript
// Input
interface ReconciliationInput {
  insurerId: string;
  providerId?: string;        // Optionnel: si absent, tous les prestataires
  periodStart: string;        // ISO date
  periodEnd: string;          // ISO date
  trigger: 'cron' | 'manual';
}

// Output
interface ReconciliationResult {
  reconciliationId: string;
  insurerId: string;
  providers: ReconciliationProvider[];
  totalClaims: number;
  totalAmount: number;        // Millimes TND
  totalCovered: number;       // Millimes TND
  pdfUrl: string;             // URL R2
  status: 'generated' | 'sent' | 'paid';
  processingTimeMs: number;
}

interface ReconciliationProvider {
  providerId: string;
  providerName: string;
  providerType: string;
  claimCount: number;
  totalAmount: number;
  coveredAmount: number;
  retentions: number;         // Retenues éventuelles
  netPayable: number;
}
```

## Routes API

```
POST /api/v1/reconciliation/generate    # Génération manuelle
GET  /api/v1/reconciliation             # Liste des bordereaux
GET  /api/v1/reconciliation/:id         # Détail d'un bordereau
GET  /api/v1/reconciliation/:id/pdf     # Download PDF
Roles: INSURER_ADMIN, INSURER_AGENT, ADMIN
```

## Processus

1. **Collecte** : `SELECT * FROM claims WHERE insurer_id = ? AND status = 'approved' AND validated_at BETWEEN ? AND ? AND reconciliation_id IS NULL`
2. **Groupement** : Grouper par `provider_id`, totaliser `covered_amount`
3. **Retenues** : Appliquer retenues configurées (ex: frais de gestion 2%)
4. **Vérification** : `SUM(items) == total` (cohérence)
5. **PDF** : Générer bordereau avec en-tête assureur, détail par prestataire, total
6. **Stockage** : Upload PDF vers R2 `bordereaux/{year}/{month}/{reconciliation_id}.pdf`
7. **Mise à jour** : Marquer les claims comme réconciliées `UPDATE claims SET reconciliation_id = ?`
8. **Notification** : Envoyer événement dans la queue pour notification assureur

## Configuration par assureur

```typescript
// Dans insurer.config_json
{
  reconciliation: {
    cycle: 'weekly' | 'biweekly' | 'monthly',
    dayOfWeek?: number,       // 0-6 pour weekly
    dayOfMonth?: number,      // 1-28 pour monthly
    retentionRate: 0.02,      // 2% frais de gestion
    autoGenerate: true,       // Cron auto ou manuel uniquement
    pdfTemplate: 'standard',  // Template PDF
  }
}
```

## Cron trigger

```
// Cloudflare Cron Trigger - scheduled worker
// Vérifie chaque jour quels assureurs ont un bordereau à générer
export default {
  async scheduled(event, env) {
    // Charger tous les assureurs avec autoGenerate = true
    // Vérifier si c'est le jour du cycle
    // Si oui, envoyer un message dans la queue de réconciliation
  }
}
```

## Fichiers

```
reconciliation/
├── reconciliation.agent.ts    # Classe ReconciliationAgent
├── reconciliation.pdf.ts      # Génération PDF (jsPDF ou @react-pdf/renderer worker-compatible)
├── reconciliation.types.ts    # Types
├── reconciliation.test.ts     # Tests
└── index.ts
```

## Cas de test requis

1. 10 claims de 3 prestataires → bordereau correct, totaux cohérents
2. Retenue 2% appliquée → netPayable = covered - retention
3. Aucune claim sur la période → bordereau vide (pas de génération)
4. Claim déjà réconciliée → non incluse (pas de doublon)
5. Claim en status 'pending_review' → non incluse
6. PDF généré et uploadé dans R2 → URL accessible
7. Cycle weekly : génération uniquement le jour configuré
8. Cycle monthly : génération le 1er du mois
9. Claims de prestataires multiples → bien groupées
10. Cohérence : sum(provider.coveredAmount) == totalCovered
