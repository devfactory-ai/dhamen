/**
 * Reconciliation Agent Types
 *
 * Types for reconciling claims between providers and insurers
 * and generating bordereaux (payment statements)
 */

export interface ReconciliationRequest {
  insurerId: string;
  providerId?: string; // Optional: reconcile specific provider or all
  periodStart: string; // ISO date
  periodEnd: string;
  cycleType: 'weekly' | 'monthly' | 'custom';
}

export interface ReconciliationResult {
  reconciliationId: string;
  insurerId: string;
  providerId: string | null;
  periodStart: string;
  periodEnd: string;
  status: 'pending' | 'validated' | 'disputed' | 'paid';
  summary: ReconciliationSummary;
  providers: ProviderReconciliation[];
  discrepancies: Discrepancy[];
  bordereau: BordereauInfo | null;
  processTime: number;
}

export interface ReconciliationSummary {
  totalClaims: number;
  approvedClaims: number;
  rejectedClaims: number;
  pendingClaims: number;
  totalRequestedAmount: number;
  totalApprovedAmount: number;
  totalRejectedAmount: number;
  totalNetPayable: number;
  discrepancyCount: number;
}

export interface ProviderReconciliation {
  providerId: string;
  providerName: string;
  providerType: 'PHARMACY' | 'DOCTOR' | 'LAB' | 'CLINIC';
  claimsCount: number;
  approvedCount: number;
  rejectedCount: number;
  requestedAmount: number;
  approvedAmount: number;
  netPayable: number;
  adjustments: Adjustment[];
}

export interface Adjustment {
  type: 'deduction' | 'credit';
  reason: string;
  amount: number;
  claimId?: string;
}

export interface Discrepancy {
  id: string;
  claimId: string;
  type: DiscrepancyType;
  severity: 'low' | 'medium' | 'high';
  description: string;
  providerAmount: number;
  insurerAmount: number;
  difference: number;
  status: 'open' | 'resolved' | 'escalated';
  resolution?: string;
}

export type DiscrepancyType =
  | 'AMOUNT_MISMATCH'
  | 'DUPLICATE_CLAIM'
  | 'MISSING_CLAIM'
  | 'STATUS_MISMATCH'
  | 'DATE_MISMATCH'
  | 'CARE_TYPE_MISMATCH';

export interface BordereauInfo {
  id: string;
  number: string;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  totalAmount: number;
  claimsCount: number;
  status: 'draft' | 'sent' | 'acknowledged' | 'paid';
  pdfUrl?: string;
}

export interface Claim {
  id: string;
  adherentId: string;
  providerId: string;
  insurerId: string;
  careType: string;
  amount: number;
  approvedAmount: number;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  serviceDate: string;
  submittedAt: string;
}

export interface Provider {
  id: string;
  name: string;
  type: 'PHARMACY' | 'DOCTOR' | 'LAB' | 'CLINIC';
  isActive: boolean;
}

/**
 * Generate bordereau number
 */
export function generateBordereauNumber(
  insurerId: string,
  providerId: string,
  date: string
): string {
  const dateStr = date.replace(/-/g, '');
  const shortInsurer = insurerId.slice(0, 4).toUpperCase();
  const shortProvider = providerId.slice(0, 4).toUpperCase();
  return `BRD-${shortInsurer}-${shortProvider}-${dateStr}`;
}

/**
 * Generate reconciliation ID
 */
export function generateReconciliationId(
  insurerId: string,
  periodStart: string,
  periodEnd: string
): string {
  const start = periodStart.replace(/-/g, '');
  const end = periodEnd.replace(/-/g, '');
  return `REC-${insurerId.slice(0, 8)}-${start}-${end}`;
}
