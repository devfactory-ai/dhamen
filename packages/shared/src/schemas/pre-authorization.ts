/**
 * Pre-Authorization Schemas
 * Validation schemas for the prior authorization workflow (accord préalable)
 */

import { z } from 'zod';

// Care type enum - types of care requiring pre-authorization
export const preAuthCareTypeSchema = z.enum([
  'hospitalization',
  'surgery',
  'mri',
  'scanner',
  'specialized_exam',
  'dental_prosthesis',
  'optical',
  'physical_therapy',
  'chronic_treatment',
  'expensive_medication',
  'other',
]);

// Pre-authorization status enum
export const preAuthStatusSchema = z.enum([
  'draft',
  'pending',
  'under_review',
  'additional_info',
  'medical_review',
  'approved',
  'partially_approved',
  'rejected',
  'expired',
  'cancelled',
  'used',
]);

// Priority enum
export const preAuthPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);

// History action enum
export const preAuthActionSchema = z.enum([
  'created',
  'submitted',
  'status_changed',
  'info_requested',
  'info_provided',
  'assigned',
  'reviewed',
  'approved',
  'rejected',
  'modified',
  'cancelled',
  'expired',
  'used',
  'comment',
]);

// Create pre-authorization schema (provider submits)
export const createPreAuthSchema = z.object({
  adherentId: z.string().min(1, 'Adhérent requis'),
  providerId: z.string().min(1, 'Prestataire requis'),
  contractId: z.string().optional(),

  // Care details
  careType: preAuthCareTypeSchema,
  procedureCode: z.string().optional(),
  procedureDescription: z.string().min(5, 'Description de l\'acte requise').max(500),

  // Medical justification
  diagnosisCode: z.string().optional(),
  diagnosisDescription: z.string().optional(),
  medicalJustification: z.string().min(10, 'Justification médicale requise').max(2000),
  prescribingDoctor: z.string().optional(),
  prescriptionDate: z.string().optional(),

  // Financial
  estimatedAmount: z.number().min(0, 'Montant estimé requis'),

  // Dates
  requestedCareDate: z.string().optional(),

  // Documents
  documents: z.array(z.string().url()).optional(),

  // Priority
  priority: preAuthPrioritySchema.default('normal'),
  isEmergency: z.boolean().default(false),
});

// Update pre-authorization (provider)
export const updatePreAuthSchema = z.object({
  procedureCode: z.string().optional(),
  procedureDescription: z.string().min(5).max(500).optional(),
  diagnosisCode: z.string().optional(),
  diagnosisDescription: z.string().optional(),
  medicalJustification: z.string().min(10).max(2000).optional(),
  prescribingDoctor: z.string().optional(),
  prescriptionDate: z.string().optional(),
  estimatedAmount: z.number().min(0).optional(),
  requestedCareDate: z.string().optional(),
  documents: z.array(z.string().url()).optional(),
  priority: preAuthPrioritySchema.optional(),
  isEmergency: z.boolean().optional(),
});

// Submit pre-authorization (move from draft to pending)
export const submitPreAuthSchema = z.object({
  id: z.string().min(1),
});

// Review pre-authorization (agent)
export const reviewPreAuthSchema = z.object({
  status: z.enum(['under_review', 'additional_info', 'medical_review']),
  notes: z.string().optional(),
});

// Request additional info
export const requestInfoPreAuthSchema = z.object({
  requestedInfo: z.string().min(1, 'Information demandée requise'),
});

// Provide additional info (provider)
export const provideInfoPreAuthSchema = z.object({
  additionalInfo: z.string().min(1, 'Information requise'),
  documents: z.array(z.string().url()).optional(),
});

// Approve pre-authorization (agent/medical reviewer)
export const approvePreAuthSchema = z.object({
  approvedAmount: z.number().min(0, 'Montant approuvé requis'),
  coverageRate: z.number().min(0).max(100).optional(),
  validityStartDate: z.string().min(1, 'Date de début de validité requise'),
  validityEndDate: z.string().min(1, 'Date de fin de validité requise'),
  decisionNotes: z.string().optional(),
  isPartial: z.boolean().default(false),
});

// Reject pre-authorization
export const rejectPreAuthSchema = z.object({
  decisionReason: z.string().min(1, 'Motif de rejet requis'),
  decisionNotes: z.string().optional(),
});

// Cancel pre-authorization (provider)
export const cancelPreAuthSchema = z.object({
  reason: z.string().min(1, 'Motif d\'annulation requis'),
});

// Assign reviewer
export const assignPreAuthReviewerSchema = z.object({
  reviewerId: z.string().min(1),
  isMedicalReviewer: z.boolean().default(false),
});

// Use pre-authorization (link to claim)
export const usePreAuthSchema = z.object({
  claimId: z.string().min(1, 'ID du sinistre requis'),
});

// Add comment/history
export const addPreAuthCommentSchema = z.object({
  comment: z.string().min(1, 'Commentaire requis').max(2000),
  isInternal: z.boolean().default(false),
});

// Pre-authorization rules (insurer configuration)
export const preAuthRuleSchema = z.object({
  careType: preAuthCareTypeSchema,
  procedureCode: z.string().optional(),
  maxAutoApproveAmount: z.number().min(0).optional(),
  requiresMedicalReview: z.boolean().default(false),
  requiresDocuments: z.boolean().default(true),
  minDaysAdvance: z.number().min(0).default(3),
  defaultValidityDays: z.number().min(1).default(30),
  isActive: z.boolean().default(true),
});

// Filter pre-authorizations
export const preAuthFiltersSchema = z.object({
  status: preAuthStatusSchema.optional(),
  careType: preAuthCareTypeSchema.optional(),
  priority: preAuthPrioritySchema.optional(),
  adherentId: z.string().optional(),
  providerId: z.string().optional(),
  reviewerId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().optional(),
  isEmergency: z.boolean().optional(),
});

// Types
export type PreAuthCareType = z.infer<typeof preAuthCareTypeSchema>;
export type PreAuthStatus = z.infer<typeof preAuthStatusSchema>;
export type PreAuthPriority = z.infer<typeof preAuthPrioritySchema>;
export type PreAuthAction = z.infer<typeof preAuthActionSchema>;
export type CreatePreAuthInput = z.infer<typeof createPreAuthSchema>;
export type UpdatePreAuthInput = z.infer<typeof updatePreAuthSchema>;
export type ApprovePreAuthInput = z.infer<typeof approvePreAuthSchema>;
export type RejectPreAuthInput = z.infer<typeof rejectPreAuthSchema>;
export type PreAuthRule = z.infer<typeof preAuthRuleSchema>;
export type PreAuthFilters = z.infer<typeof preAuthFiltersSchema>;
