/**
 * Virtual Card Schemas
 *
 * Zod validation schemas for digital adherent cards
 */

import { z } from 'zod';

export const cardStatusSchema = z.enum(['active', 'suspended', 'revoked', 'expired']);
export const verificationTypeSchema = z.enum(['qr_scan', 'card_number', 'nfc', 'api']);
export const verificationStatusSchema = z.enum(['success', 'failed', 'expired', 'revoked']);
export const cardEventTypeSchema = z.enum(['issued', 'renewed', 'suspended', 'reactivated', 'revoked', 'expired', 'used']);

export const generateCardSchema = z.object({
  adherentId: z.string().min(1, 'ID adhérent requis'),
  validityMonths: z.number().int().min(1).max(36).optional().default(12),
  deviceFingerprint: z.string().optional(),
});

export const verifyCardSchema = z.object({
  qrCodeData: z.string().optional(),
  cardNumber: z.string().optional(),
  providerId: z.string().optional(),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }).optional(),
}).refine(
  (data) => data.qrCodeData || data.cardNumber,
  { message: 'QR code ou numéro de carte requis' }
);

export const suspendCardSchema = z.object({
  cardId: z.string().min(1, 'ID carte requis'),
  reason: z.string().min(1, 'Raison requise'),
});

export const reactivateCardSchema = z.object({
  cardId: z.string().min(1, 'ID carte requis'),
  reason: z.string().optional(),
});

export const revokeCardSchema = z.object({
  cardId: z.string().min(1, 'ID carte requis'),
  reason: z.string().min(1, 'Raison de révocation requise'),
});

export const renewCardSchema = z.object({
  cardId: z.string().min(1, 'ID carte requis'),
  validityMonths: z.number().int().min(1).max(36).optional().default(12),
});

export const listCardsQuerySchema = z.object({
  adherentId: z.string().optional(),
  status: cardStatusSchema.optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const cardVerificationHistorySchema = z.object({
  cardId: z.string().min(1),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export type GenerateCardInput = z.infer<typeof generateCardSchema>;
export type VerifyCardInput = z.infer<typeof verifyCardSchema>;
export type SuspendCardInput = z.infer<typeof suspendCardSchema>;
export type ReactivateCardInput = z.infer<typeof reactivateCardSchema>;
export type RevokeCardInput = z.infer<typeof revokeCardSchema>;
export type RenewCardInput = z.infer<typeof renewCardSchema>;
export type ListCardsQuery = z.infer<typeof listCardsQuerySchema>;
