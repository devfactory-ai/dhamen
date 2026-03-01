/**
 * AI-Powered Reconciliation Service
 *
 * Intelligent matching of payments to bordereaux using ML/AI
 */

import type { Bindings } from '../types';

export interface ReconciliationCandidate {
  id: string;
  type: 'payment' | 'bordereau' | 'claim';
  reference: string;
  amount: number;
  date: string;
  providerId?: string;
  providerName?: string;
  insurerId?: string;
  insurerName?: string;
  status: string;
  metadata: Record<string, unknown>;
}

export interface MatchResult {
  id: string;
  sourceId: string;
  targetId: string;
  sourceType: 'payment' | 'claim';
  targetType: 'bordereau' | 'payment';
  confidence: number;
  matchReasons: MatchReason[];
  discrepancies: Discrepancy[];
  suggestedAction: 'auto_reconcile' | 'manual_review' | 'reject';
  createdAt: string;
}

export interface MatchReason {
  factor: string;
  weight: number;
  score: number;
  details: string;
}

export interface Discrepancy {
  field: string;
  expected: unknown;
  actual: unknown;
  severity: 'low' | 'medium' | 'high';
  resolution?: string;
}

export interface ReconciliationSuggestion {
  paymentId: string;
  bordereauId: string;
  confidence: number;
  matchReasons: MatchReason[];
  discrepancies: Discrepancy[];
  estimatedSavings?: number;
}

export interface AnomalyDetection {
  id: string;
  type: 'duplicate' | 'amount_mismatch' | 'date_anomaly' | 'pattern_deviation' | 'missing_reference';
  severity: 'low' | 'medium' | 'high' | 'critical';
  entityType: 'payment' | 'bordereau' | 'claim';
  entityId: string;
  description: string;
  details: Record<string, unknown>;
  suggestedAction: string;
  createdAt: string;
}

export class AIReconciliationService {
  constructor(private env: Bindings) {}

  /**
   * Find best matches for unreconciled payments
   */
  async findPaymentMatches(options: {
    insurerId?: string;
    minConfidence?: number;
    limit?: number;
  }): Promise<ReconciliationSuggestion[]> {
    const minConfidence = options.minConfidence || 0.7;
    const limit = options.limit || 50;
    const insurerFilter = options.insurerId ? `AND p.insurer_id = '${options.insurerId}'` : '';

    // Get unreconciled payments
    const payments = await this.env.DB.prepare(`
      SELECT
        p.id,
        p.reference,
        p.amount,
        p.initiated_at,
        p.provider_id,
        p.beneficiary,
        p.metadata,
        pr.name as provider_name
      FROM payment_orders p
      LEFT JOIN providers pr ON p.provider_id = pr.id
      WHERE p.status = 'completed'
        AND p.id NOT IN (SELECT payment_id FROM reconciliation_items WHERE payment_id IS NOT NULL)
        ${insurerFilter}
      ORDER BY p.initiated_at DESC
      LIMIT ?
    `).bind(limit).all<{
      id: string;
      reference: string;
      amount: number;
      initiated_at: string;
      provider_id: string;
      beneficiary: string;
      metadata: string;
      provider_name: string;
    }>();

    // Get unreconciled bordereaux
    const bordereaux = await this.env.DB.prepare(`
      SELECT
        b.id,
        b.reference,
        b.total_amount,
        b.provider_id,
        b.period_start,
        b.period_end,
        b.claims_count,
        pr.name as provider_name
      FROM bordereaux b
      LEFT JOIN providers pr ON b.provider_id = pr.id
      WHERE b.status IN ('validated', 'pending_payment')
        AND b.id NOT IN (SELECT bordereau_id FROM reconciliation_items WHERE bordereau_id IS NOT NULL)
        ${insurerFilter}
    `).all<{
      id: string;
      reference: string;
      total_amount: number;
      provider_id: string;
      period_start: string;
      period_end: string;
      claims_count: number;
      provider_name: string;
    }>();

    const suggestions: ReconciliationSuggestion[] = [];

    for (const payment of payments.results || []) {
      const matches = await this.matchPaymentToBordereaux(payment, bordereaux.results || []);
      const bestMatch = matches.sort((a, b) => b.confidence - a.confidence)[0];

      if (bestMatch && bestMatch.confidence >= minConfidence) {
        suggestions.push(bestMatch);
      }
    }

    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Match a payment to bordereaux candidates
   */
  private async matchPaymentToBordereaux(
    payment: {
      id: string;
      reference: string;
      amount: number;
      initiated_at: string;
      provider_id: string;
      beneficiary: string;
      metadata: string;
      provider_name: string;
    },
    bordereaux: Array<{
      id: string;
      reference: string;
      total_amount: number;
      provider_id: string;
      period_start: string;
      period_end: string;
      claims_count: number;
      provider_name: string;
    }>
  ): Promise<ReconciliationSuggestion[]> {
    const suggestions: ReconciliationSuggestion[] = [];
    const paymentMeta = payment.metadata ? JSON.parse(payment.metadata) : {};
    const beneficiary = payment.beneficiary ? JSON.parse(payment.beneficiary) : {};

    for (const bordereau of bordereaux) {
      const matchReasons: MatchReason[] = [];
      const discrepancies: Discrepancy[] = [];
      let totalScore = 0;
      let totalWeight = 0;

      // Factor 1: Provider match (weight: 0.3)
      const providerWeight = 0.3;
      if (payment.provider_id === bordereau.provider_id) {
        matchReasons.push({
          factor: 'provider_match',
          weight: providerWeight,
          score: 1.0,
          details: `Prestataire correspondant: ${bordereau.provider_name}`,
        });
        totalScore += providerWeight * 1.0;
      } else {
        matchReasons.push({
          factor: 'provider_match',
          weight: providerWeight,
          score: 0,
          details: 'Prestataires différents',
        });
        discrepancies.push({
          field: 'provider_id',
          expected: bordereau.provider_id,
          actual: payment.provider_id,
          severity: 'high',
        });
      }
      totalWeight += providerWeight;

      // Factor 2: Amount match (weight: 0.35)
      const amountWeight = 0.35;
      const amountDiff = Math.abs(payment.amount - bordereau.total_amount);
      const amountTolerance = bordereau.total_amount * 0.01; // 1% tolerance

      if (amountDiff === 0) {
        matchReasons.push({
          factor: 'amount_exact',
          weight: amountWeight,
          score: 1.0,
          details: `Montant exact: ${(payment.amount / 1000).toFixed(3)} TND`,
        });
        totalScore += amountWeight * 1.0;
      } else if (amountDiff <= amountTolerance) {
        const score = 1 - (amountDiff / amountTolerance) * 0.2;
        matchReasons.push({
          factor: 'amount_close',
          weight: amountWeight,
          score,
          details: `Montant proche: écart de ${(amountDiff / 1000).toFixed(3)} TND`,
        });
        totalScore += amountWeight * score;
        discrepancies.push({
          field: 'amount',
          expected: bordereau.total_amount,
          actual: payment.amount,
          severity: 'low',
          resolution: 'Différence de frais bancaires probable',
        });
      } else {
        const ratio = Math.min(payment.amount, bordereau.total_amount) /
                     Math.max(payment.amount, bordereau.total_amount);
        const score = ratio > 0.9 ? ratio - 0.9 : 0;
        matchReasons.push({
          factor: 'amount_mismatch',
          weight: amountWeight,
          score,
          details: `Écart montant: ${((amountDiff / bordereau.total_amount) * 100).toFixed(1)}%`,
        });
        totalScore += amountWeight * score;
        discrepancies.push({
          field: 'amount',
          expected: bordereau.total_amount,
          actual: payment.amount,
          severity: ratio > 0.95 ? 'medium' : 'high',
        });
      }
      totalWeight += amountWeight;

      // Factor 3: Reference similarity (weight: 0.2)
      const refWeight = 0.2;
      const refSimilarity = this.calculateStringSimilarity(
        payment.reference.toLowerCase(),
        bordereau.reference.toLowerCase()
      );

      if (refSimilarity > 0.8) {
        matchReasons.push({
          factor: 'reference_match',
          weight: refWeight,
          score: refSimilarity,
          details: `Référence similaire: ${bordereau.reference}`,
        });
        totalScore += refWeight * refSimilarity;
      } else if (paymentMeta.bordereauRef === bordereau.reference) {
        matchReasons.push({
          factor: 'reference_in_metadata',
          weight: refWeight,
          score: 1.0,
          details: 'Référence bordereau trouvée dans métadonnées',
        });
        totalScore += refWeight * 1.0;
      }
      totalWeight += refWeight;

      // Factor 4: Date proximity (weight: 0.15)
      const dateWeight = 0.15;
      const paymentDate = new Date(payment.initiated_at);
      const periodEnd = new Date(bordereau.period_end);
      const daysDiff = Math.abs(
        (paymentDate.getTime() - periodEnd.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysDiff <= 7) {
        const score = 1 - (daysDiff / 7) * 0.3;
        matchReasons.push({
          factor: 'date_proximity',
          weight: dateWeight,
          score,
          details: `Paiement ${daysDiff} jours après fin période`,
        });
        totalScore += dateWeight * score;
      } else if (daysDiff <= 30) {
        const score = 0.7 - ((daysDiff - 7) / 23) * 0.4;
        matchReasons.push({
          factor: 'date_reasonable',
          weight: dateWeight,
          score,
          details: `Paiement ${daysDiff} jours après fin période`,
        });
        totalScore += dateWeight * score;
      }
      totalWeight += dateWeight;

      // Calculate final confidence
      const confidence = totalWeight > 0 ? totalScore / totalWeight : 0;

      if (confidence > 0.3) {
        suggestions.push({
          paymentId: payment.id,
          bordereauId: bordereau.id,
          confidence,
          matchReasons,
          discrepancies,
          estimatedSavings: this.estimateReconciliationSavings(payment.amount),
        });
      }
    }

    return suggestions;
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1;
    if (!str1 || !str2) return 0;

    const len1 = str1.length;
    const len2 = str2.length;

    if (len1 === 0 || len2 === 0) return 0;

    // Use simplified Levenshtein for performance
    const matrix: number[][] = [];

    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0]![j] = j;
    }

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j]! + 1,
          matrix[i]![j - 1]! + 1,
          matrix[i - 1]![j - 1]! + cost
        );
      }
    }

    const distance = matrix[len1]![len2]!;
    const maxLen = Math.max(len1, len2);
    return 1 - distance / maxLen;
  }

  /**
   * Estimate savings from automated reconciliation
   */
  private estimateReconciliationSavings(amount: number): number {
    // Estimate 2-5 minutes of manual work saved at 30 TND/hour
    const minutesSaved = 3.5;
    const hourlyRate = 30000; // millimes
    return Math.round((minutesSaved / 60) * hourlyRate);
  }

  /**
   * Detect anomalies in financial data
   */
  async detectAnomalies(options: {
    insurerId?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<AnomalyDetection[]> {
    const anomalies: AnomalyDetection[] = [];
    const insurerFilter = options.insurerId ? `AND insurer_id = '${options.insurerId}'` : '';
    const dateFilter = options.dateFrom
      ? `AND created_at >= '${options.dateFrom}'`
      : '';

    // 1. Detect duplicate payments
    const duplicates = await this.env.DB.prepare(`
      SELECT
        p1.id as id1,
        p2.id as id2,
        p1.amount,
        p1.reference,
        p1.provider_id
      FROM payment_orders p1
      JOIN payment_orders p2 ON
        p1.id < p2.id AND
        p1.amount = p2.amount AND
        p1.provider_id = p2.provider_id AND
        ABS(julianday(p1.initiated_at) - julianday(p2.initiated_at)) < 1
      WHERE p1.status = 'completed'
        AND p2.status = 'completed'
        ${insurerFilter.replace('insurer_id', 'p1.insurer_id')}
      LIMIT 20
    `).all<{
      id1: string;
      id2: string;
      amount: number;
      reference: string;
      provider_id: string;
    }>();

    for (const dup of duplicates.results || []) {
      anomalies.push({
        id: crypto.randomUUID(),
        type: 'duplicate',
        severity: 'high',
        entityType: 'payment',
        entityId: dup.id2,
        description: `Paiement potentiellement en double`,
        details: {
          originalPaymentId: dup.id1,
          duplicatePaymentId: dup.id2,
          amount: dup.amount,
          reference: dup.reference,
        },
        suggestedAction: 'Vérifier et annuler le doublon si confirmé',
        createdAt: new Date().toISOString(),
      });
    }

    // 2. Detect amount mismatches (claims vs bordereaux)
    const amountMismatches = await this.env.DB.prepare(`
      SELECT
        b.id,
        b.reference,
        b.total_amount as declared_amount,
        SUM(c.approved_amount) as actual_amount
      FROM bordereaux b
      JOIN claims c ON b.id = c.bordereau_id
      WHERE b.status IN ('validated', 'pending_payment')
        ${insurerFilter.replace('insurer_id', 'b.insurer_id')}
      GROUP BY b.id
      HAVING ABS(declared_amount - actual_amount) > declared_amount * 0.01
      LIMIT 20
    `).all<{
      id: string;
      reference: string;
      declared_amount: number;
      actual_amount: number;
    }>();

    for (const mismatch of amountMismatches.results || []) {
      const diff = Math.abs(mismatch.declared_amount - mismatch.actual_amount);
      const percentDiff = (diff / mismatch.declared_amount) * 100;

      anomalies.push({
        id: crypto.randomUUID(),
        type: 'amount_mismatch',
        severity: percentDiff > 5 ? 'high' : percentDiff > 2 ? 'medium' : 'low',
        entityType: 'bordereau',
        entityId: mismatch.id,
        description: `Écart de ${percentDiff.toFixed(1)}% entre montant déclaré et calculé`,
        details: {
          bordereauRef: mismatch.reference,
          declaredAmount: mismatch.declared_amount,
          calculatedAmount: mismatch.actual_amount,
          difference: diff,
        },
        suggestedAction: 'Vérifier les sinistres inclus dans le bordereau',
        createdAt: new Date().toISOString(),
      });
    }

    // 3. Detect unusual patterns using statistical analysis
    const patterns = await this.detectPatternAnomalies(options.insurerId);
    anomalies.push(...patterns);

    // 4. Detect missing references
    const missingRefs = await this.env.DB.prepare(`
      SELECT
        p.id,
        p.reference,
        p.amount,
        p.provider_id
      FROM payment_orders p
      WHERE p.status = 'completed'
        AND (p.bordereau_id IS NULL OR p.bordereau_id = '')
        AND p.amount > 100000
        ${insurerFilter}
      ORDER BY p.amount DESC
      LIMIT 20
    `).all<{
      id: string;
      reference: string;
      amount: number;
      provider_id: string;
    }>();

    for (const payment of missingRefs.results || []) {
      anomalies.push({
        id: crypto.randomUUID(),
        type: 'missing_reference',
        severity: payment.amount > 1000000 ? 'high' : 'medium',
        entityType: 'payment',
        entityId: payment.id,
        description: 'Paiement important sans bordereau associé',
        details: {
          paymentRef: payment.reference,
          amount: payment.amount,
          providerId: payment.provider_id,
        },
        suggestedAction: 'Associer ce paiement à un bordereau existant',
        createdAt: new Date().toISOString(),
      });
    }

    return anomalies.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  /**
   * Detect pattern-based anomalies
   */
  private async detectPatternAnomalies(insurerId?: string): Promise<AnomalyDetection[]> {
    const anomalies: AnomalyDetection[] = [];
    const insurerFilter = insurerId ? `WHERE insurer_id = '${insurerId}'` : '';

    // Get statistical baseline for claims
    const baseline = await this.env.DB.prepare(`
      SELECT
        AVG(amount) as avg_amount,
        AVG(amount) + 2 * (
          SELECT AVG((amount - sub.avg) * (amount - sub.avg))
          FROM claims, (SELECT AVG(amount) as avg FROM claims) sub
        ) as upper_threshold
      FROM claims
      ${insurerFilter}
    `).first<{ avg_amount: number; upper_threshold: number }>();

    if (baseline?.upper_threshold) {
      // Find claims significantly above average
      const outliers = await this.env.DB.prepare(`
        SELECT
          id,
          reference,
          amount,
          adherent_id,
          provider_id
        FROM claims
        ${insurerFilter ? insurerFilter + ' AND' : 'WHERE'} amount > ?
        ORDER BY amount DESC
        LIMIT 10
      `).bind(baseline.upper_threshold).all<{
        id: string;
        reference: string;
        amount: number;
        adherent_id: string;
        provider_id: string;
      }>();

      for (const outlier of outliers.results || []) {
        const deviation = ((outlier.amount - baseline.avg_amount) / baseline.avg_amount) * 100;

        anomalies.push({
          id: crypto.randomUUID(),
          type: 'pattern_deviation',
          severity: deviation > 500 ? 'critical' : deviation > 200 ? 'high' : 'medium',
          entityType: 'claim',
          entityId: outlier.id,
          description: `Sinistre ${deviation.toFixed(0)}% au-dessus de la moyenne`,
          details: {
            claimRef: outlier.reference,
            amount: outlier.amount,
            averageAmount: baseline.avg_amount,
            deviationPercent: deviation,
          },
          suggestedAction: 'Vérifier la légitimité de ce sinistre',
          createdAt: new Date().toISOString(),
        });
      }
    }

    return anomalies;
  }

  /**
   * Auto-reconcile high-confidence matches
   */
  async autoReconcile(options: {
    insurerId?: string;
    minConfidence?: number;
    dryRun?: boolean;
  }): Promise<{
    processed: number;
    reconciled: number;
    skipped: number;
    details: Array<{ paymentId: string; bordereauId: string; status: string }>;
  }> {
    const minConfidence = options.minConfidence || 0.95;
    const suggestions = await this.findPaymentMatches({
      insurerId: options.insurerId,
      minConfidence,
      limit: 100,
    });

    const results = {
      processed: 0,
      reconciled: 0,
      skipped: 0,
      details: [] as Array<{ paymentId: string; bordereauId: string; status: string }>,
    };

    for (const suggestion of suggestions) {
      results.processed++;

      // Only auto-reconcile if confidence is very high and no major discrepancies
      const hasHighSeverityDiscrepancy = suggestion.discrepancies.some(
        (d) => d.severity === 'high'
      );

      if (suggestion.confidence >= minConfidence && !hasHighSeverityDiscrepancy) {
        if (!options.dryRun) {
          try {
            await this.createReconciliationItem(suggestion);
            results.reconciled++;
            results.details.push({
              paymentId: suggestion.paymentId,
              bordereauId: suggestion.bordereauId,
              status: 'reconciled',
            });
          } catch (error) {
            results.skipped++;
            results.details.push({
              paymentId: suggestion.paymentId,
              bordereauId: suggestion.bordereauId,
              status: 'error',
            });
          }
        } else {
          results.reconciled++;
          results.details.push({
            paymentId: suggestion.paymentId,
            bordereauId: suggestion.bordereauId,
            status: 'would_reconcile',
          });
        }
      } else {
        results.skipped++;
        results.details.push({
          paymentId: suggestion.paymentId,
          bordereauId: suggestion.bordereauId,
          status: hasHighSeverityDiscrepancy ? 'needs_review' : 'low_confidence',
        });
      }
    }

    return results;
  }

  /**
   * Create reconciliation item
   */
  private async createReconciliationItem(suggestion: ReconciliationSuggestion): Promise<void> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.env.DB.prepare(`
      INSERT INTO reconciliation_items (
        id, payment_id, bordereau_id, match_confidence,
        match_details, status, created_at
      ) VALUES (?, ?, ?, ?, ?, 'reconciled', ?)
    `).bind(
      id,
      suggestion.paymentId,
      suggestion.bordereauId,
      suggestion.confidence,
      JSON.stringify({
        reasons: suggestion.matchReasons,
        discrepancies: suggestion.discrepancies,
      }),
      now
    ).run();

    // Update bordereau status
    await this.env.DB.prepare(`
      UPDATE bordereaux SET status = 'paid', updated_at = ? WHERE id = ?
    `).bind(now, suggestion.bordereauId).run();
  }

  /**
   * Get reconciliation statistics
   */
  async getReconciliationStats(insurerId?: string): Promise<{
    totalUnreconciled: number;
    totalReconciled: number;
    autoReconciledThisMonth: number;
    averageConfidence: number;
    pendingReview: number;
    anomaliesDetected: number;
  }> {
    const insurerFilter = insurerId ? `AND insurer_id = '${insurerId}'` : '';

    const [unreconciled, reconciled, autoReconciled, pendingReview] = await Promise.all([
      this.env.DB.prepare(`
        SELECT COUNT(*) as count
        FROM payment_orders
        WHERE status = 'completed'
          AND id NOT IN (SELECT payment_id FROM reconciliation_items WHERE payment_id IS NOT NULL)
          ${insurerFilter}
      `).first<{ count: number }>(),

      this.env.DB.prepare(`
        SELECT COUNT(*) as count, AVG(match_confidence) as avg_confidence
        FROM reconciliation_items ri
        JOIN payment_orders p ON ri.payment_id = p.id
        WHERE ri.status = 'reconciled'
          ${insurerFilter}
      `).first<{ count: number; avg_confidence: number }>(),

      this.env.DB.prepare(`
        SELECT COUNT(*) as count
        FROM reconciliation_items ri
        JOIN payment_orders p ON ri.payment_id = p.id
        WHERE ri.status = 'reconciled'
          AND ri.match_confidence >= 0.95
          AND ri.created_at >= date('now', 'start of month')
          ${insurerFilter}
      `).first<{ count: number }>(),

      this.env.DB.prepare(`
        SELECT COUNT(*) as count
        FROM reconciliation_items ri
        JOIN payment_orders p ON ri.payment_id = p.id
        WHERE ri.status = 'pending_review'
          ${insurerFilter}
      `).first<{ count: number }>(),
    ]);

    const anomalies = await this.detectAnomalies({ insurerId });

    return {
      totalUnreconciled: unreconciled?.count || 0,
      totalReconciled: reconciled?.count || 0,
      autoReconciledThisMonth: autoReconciled?.count || 0,
      averageConfidence: reconciled?.avg_confidence || 0,
      pendingReview: pendingReview?.count || 0,
      anomaliesDetected: anomalies.length,
    };
  }
}
