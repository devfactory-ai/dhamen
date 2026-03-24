/**
 * Routes index
 */

export { health } from './health';
export { auth } from './auth';
export { users } from './users';
export { providers } from './providers';
export { adherents } from './adherents';
export { contracts } from './contracts';
export { insurers } from './insurers';
export { claims } from './claims';
export { notifications } from './notifications';
export { bordereaux } from './bordereaux';

// Agent routes
export { default as eligibility } from './eligibility';
export { default as tarification } from './tarification';
export { default as fraud } from './fraud';
export { reconciliation } from './reconciliation';

// SoinFlow routes
export { sante } from './sante';

// Webhooks and Public API
export { webhooks } from './webhooks';
export { publicApi } from './public-api';

// Realtime, Exports, and Compliance
export { realtime } from './realtime';
export { exports } from './exports';
export { compliance } from './compliance';

// OCR
export { ocr } from './ocr';

// CNAM Integration
export { cnam } from './cnam';

// Analytics
export { default as analytics } from './analytics';

// Documents (R2)
export { default as documents } from './documents';

// Audit
export { default as audit } from './audit';

// Webhooks Outbound
export { default as webhooksOutbound } from './webhooks-outbound';

// Public API V2
export { default as publicApiV2 } from './public-api-v2';

// Batch Processing
export { default as batch } from './batch';

// Payments
export { default as payments } from './payments';

// Sprint 14: Dashboard Realtime
export { dashboardRealtime } from './dashboard-realtime';

// Sprint 14: Contract Management
export { contractManagement } from './contract-management';

// Sprint 14: AI Reconciliation
export { aiReconciliation } from './ai-reconciliation';

// Sprint 14: Mobile Backend
export { mobile } from './mobile';

// Sprint 15: Monitoring
export { monitoring } from './monitoring';

// Sprint 15: API Documentation
export { docs } from './docs';

// Virtual Cards (Digital Adherent Cards)
export { virtualCards } from './virtual-cards';

// SMS Gateway
export { sms } from './sms';

// MF Verification (Matricule Fiscal)
export { mfVerification } from './mf-verification';

// Medications (Pharmacie Centrale Tunisie)
export { medications } from './medications';

// Bulletins de soins (adherent paper forms)
export { bulletinsSoins } from './bulletins-soins';
export { bulletinTemplates } from './bulletin-templates';
export { bulletinsAgent } from './bulletins-agent';
export { bulletinsArchive } from './bulletins-archive';

// Consommation garanties (adherent coverage tracking)
export { consommation } from './consommation';

// Companies (entreprises with HR)
export { companies } from './companies';

// Claims Appeals (recours/contestation)
export { appeals } from './appeals';

// Pre-Authorizations (accord préalable)
export { preAuthorizations } from './pre-authorizations';

// Group Contracts (contrats d'assurance groupe)
export { groupContracts } from './group-contracts';

// Medication Family Baremes (taux remboursement par famille médicament)
export { medicationFamilyBaremes } from './medication-family-baremes';
