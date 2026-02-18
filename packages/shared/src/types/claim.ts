/**
 * Claim types
 */

export const CLAIM_TYPES = ['pharmacy', 'consultation', 'hospitalization'] as const;

export type ClaimType = (typeof CLAIM_TYPES)[number];

export const CLAIM_STATUSES = [
  'pending',
  'eligible',
  'approved',
  'pending_review',
  'blocked',
  'rejected',
  'paid',
] as const;

export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export interface FraudFlag {
  rule: string;
  severity: number;
  description: string;
  evidence: Record<string, unknown>;
}

export interface Claim {
  id: string;
  type: ClaimType;
  contractId: string;
  providerId: string;
  adherentId: string;
  insurerId: string;
  totalAmount: number;
  coveredAmount: number;
  copayAmount: number;
  fraudScore: number;
  fraudFlagsJson: FraudFlag[];
  status: ClaimStatus;
  reconciliationId: string | null;
  baremeVersion: string | null;
  notes: string | null;
  createdAt: string;
  validatedAt: string | null;
  updatedAt: string;
}

export interface ClaimItem {
  id: string;
  claimId: string;
  code: string;
  label: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  coveredAmount: number;
  copayAmount: number;
  reimbursementRate: number | null;
  isGeneric: boolean;
  ruleApplied: string | null;
  createdAt: string;
}

export interface ClaimItemCreate {
  code: string;
  label: string;
  quantity: number;
  unitPrice: number;
  isGeneric?: boolean;
}

export interface ClaimCreate {
  type: ClaimType;
  contractId: string;
  providerId: string;
  items: ClaimItemCreate[];
  notes?: string;
}

export interface ClaimUpdate {
  status?: ClaimStatus;
  notes?: string;
}

export interface ClaimFilters {
  type?: ClaimType;
  status?: ClaimStatus;
  providerId?: string;
  adherentId?: string;
  insurerId?: string;
  dateFrom?: string;
  dateTo?: string;
  minFraudScore?: number;
}

export interface ClaimWithRelations extends Claim {
  items?: ClaimItem[];
  provider?: {
    id: string;
    name: string;
    type: string;
  };
  adherent?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  contract?: {
    id: string;
    contractNumber: string;
    planType: string;
  };
}
