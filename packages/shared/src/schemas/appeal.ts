/**
 * Claim Appeal Schemas
 * Validation schemas for the claims appeal/contestation workflow
 */

import { z } from 'zod';

// Appeal reason enum
export const appealReasonSchema = z.enum([
  'coverage_dispute',
  'amount_dispute',
  'rejection_dispute',
  'document_missing',
  'calculation_error',
  'medical_necessity',
  'other',
]);

// Appeal status enum
export const appealStatusSchema = z.enum([
  'submitted',
  'under_review',
  'additional_info_requested',
  'escalated',
  'approved',
  'partially_approved',
  'rejected',
  'withdrawn',
]);

// Resolution type enum
export const resolutionTypeSchema = z.enum([
  'full_reversal',
  'partial_reversal',
  'amount_adjustment',
  'coverage_clarification',
  'no_change',
  'other',
]);

// Priority enum
export const appealPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);

// Comment type enum
export const appealCommentTypeSchema = z.enum([
  'status_change',
  'internal_note',
  'adherent_message',
  'agent_message',
  'document_added',
  'escalation',
  'resolution',
]);

// Create appeal schema (adherent submits)
export const createAppealSchema = z.object({
  claimId: z.string().min(1, 'Claim ID requis'),
  reason: appealReasonSchema,
  description: z.string().min(10, 'Description trop courte (min 10 caractères)').max(2000),
  documents: z.array(z.string().url()).optional(),
});

// Update appeal status (agent/admin)
export const updateAppealStatusSchema = z.object({
  status: appealStatusSchema,
  internalNotes: z.string().optional(),
  priority: appealPrioritySchema.optional(),
});

// Resolve appeal (agent/admin)
export const resolveAppealSchema = z.object({
  resolutionType: resolutionTypeSchema,
  resolutionNotes: z.string().min(1, 'Notes de résolution requises'),
  resolutionAmount: z.number().min(0).optional(),
  status: z.enum(['approved', 'partially_approved', 'rejected']),
});

// Assign reviewer
export const assignReviewerSchema = z.object({
  reviewerId: z.string().min(1),
});

// Escalate appeal
export const escalateAppealSchema = z.object({
  escalatedTo: z.string().min(1),
  reason: z.string().min(1, 'Raison d\'escalade requise'),
});

// Add comment
export const addAppealCommentSchema = z.object({
  content: z.string().min(1, 'Commentaire requis').max(2000),
  commentType: appealCommentTypeSchema,
  isVisibleToAdherent: z.boolean().default(false),
});

// Adherent response
export const adherentResponseSchema = z.object({
  response: z.string().min(1, 'Réponse requise').max(2000),
  documents: z.array(z.string().url()).optional(),
});

// Filter appeals
export const appealFiltersSchema = z.object({
  status: appealStatusSchema.optional(),
  reason: appealReasonSchema.optional(),
  priority: appealPrioritySchema.optional(),
  reviewerId: z.string().optional(),
  adherentId: z.string().optional(),
  claimId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().optional(),
});

// Types
export type AppealReason = z.infer<typeof appealReasonSchema>;
export type AppealStatus = z.infer<typeof appealStatusSchema>;
export type ResolutionType = z.infer<typeof resolutionTypeSchema>;
export type AppealPriority = z.infer<typeof appealPrioritySchema>;
export type AppealCommentType = z.infer<typeof appealCommentTypeSchema>;
export type CreateAppealInput = z.infer<typeof createAppealSchema>;
export type UpdateAppealStatusInput = z.infer<typeof updateAppealStatusSchema>;
export type ResolveAppealInput = z.infer<typeof resolveAppealSchema>;
export type AppealFilters = z.infer<typeof appealFiltersSchema>;
