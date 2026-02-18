/**
 * Contract types
 */

export const CONTRACT_STATUSES = ['active', 'suspended', 'expired', 'cancelled'] as const;

export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const PLAN_TYPES = ['individual', 'family', 'corporate'] as const;

export type PlanType = (typeof PLAN_TYPES)[number];

export interface CoverageConfig {
  pharmacy: {
    enabled: boolean;
    reimbursementRate: number;
    annualLimit: number | null;
    genericOnly: boolean;
  };
  consultation: {
    enabled: boolean;
    reimbursementRate: number;
    annualLimit: number | null;
    specialities: string[];
  };
  hospitalization: {
    enabled: boolean;
    reimbursementRate: number;
    annualLimit: number | null;
    roomType: 'standard' | 'private' | 'any';
  };
  lab: {
    enabled: boolean;
    reimbursementRate: number;
    annualLimit: number | null;
  };
}

export interface Contract {
  id: string;
  insurerId: string;
  adherentId: string;
  contractNumber: string;
  planType: PlanType;
  startDate: string;
  endDate: string;
  carenceDays: number;
  annualLimit: number | null;
  coverageJson: CoverageConfig;
  exclusionsJson: string[];
  status: ContractStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ContractCreate {
  insurerId: string;
  adherentId: string;
  contractNumber: string;
  planType: PlanType;
  startDate: string;
  endDate: string;
  carenceDays?: number;
  annualLimit?: number;
  coverage: CoverageConfig;
  exclusions?: string[];
}

export interface ContractUpdate {
  planType?: PlanType;
  endDate?: string;
  annualLimit?: number;
  coverage?: Partial<CoverageConfig>;
  exclusions?: string[];
  status?: ContractStatus;
}

export interface ContractFilters {
  insurerId?: string;
  adherentId?: string;
  status?: ContractStatus;
  planType?: PlanType;
}

export interface ContractWithRelations extends Contract {
  insurer?: {
    id: string;
    name: string;
    code: string;
  };
  adherent?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}
