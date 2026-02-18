/**
 * Convention (agreement between insurer and provider) types
 */

export interface BaremeItem {
  code: string;
  label: string;
  refPrice: number;
  genericPrice?: number;
  reimbursementRate: number;
  category: string;
}

export interface BaremeConfig {
  version: string;
  defaultRate: number;
  categoryRates: Record<string, number>;
  items: BaremeItem[];
  caps: {
    perCategory: Record<string, number>;
    perEvent: number | null;
    annual: number | null;
  };
  franchise: number;
}

export interface Convention {
  id: string;
  insurerId: string;
  providerId: string;
  baremeJson: BaremeConfig;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConventionCreate {
  insurerId: string;
  providerId: string;
  bareme: BaremeConfig;
  startDate: string;
  endDate?: string;
}

export interface ConventionUpdate {
  bareme?: Partial<BaremeConfig>;
  endDate?: string;
  isActive?: boolean;
}

export interface ConventionFilters {
  insurerId?: string;
  providerId?: string;
  isActive?: boolean;
}
