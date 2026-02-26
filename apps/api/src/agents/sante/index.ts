/**
 * SoinFlow Agents Module
 *
 * Specialized agents for health reimbursement claims processing.
 * Uses formules de garantie, types de soins, and praticiens conventionnés.
 */

// SoinFlow Eligibility Agent - Verifies adherent eligibility using formules
export { checkSanteEligibility, invalidateSanteCache } from './sante-eligibility.agent';
export type { SanteEligibilityRequest, SanteEligibilityResult } from './sante-eligibility.types';

// SoinFlow Tarification Agent - Calculates coverage using formule rates
export { calculateSanteTarification } from './sante-tarification.agent';
export type { SanteTarificationRequest, SanteTarificationResult } from './sante-tarification.types';

// SoinFlow Fraud Agent - Detects fraudulent reimbursement claims
export { detectSanteFraud } from './sante-fraud.agent';
export type { SanteFraudRequest, SanteFraudResult } from './sante-fraud.types';
