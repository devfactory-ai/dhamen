import { z } from 'zod';

/**
 * Allowed MIME types for bulletin scans
 */
export const SCAN_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'application/pdf',
] as const;

/**
 * Max file size for scan uploads (10 MB)
 */
export const SCAN_MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Schema for validating a bulletin (agent confirms reimbursement)
 */
export const validateBulletinSchema = z.object({
  reimbursed_amount: z.number().nonnegative('Le montant remboursé ne peut pas être négatif'),
  notes: z.string().max(1000).optional(),
});

/**
 * Schema for validating scan upload metadata
 */
export const uploadScanSchema = z.object({
  mime_type: z.enum(SCAN_ALLOWED_MIME_TYPES, {
    errorMap: () => ({ message: 'Type de fichier non supporté. Formats acceptés : JPEG, PNG, PDF' }),
  }),
  file_size: z.number()
    .positive()
    .max(SCAN_MAX_FILE_SIZE, `La taille du fichier ne doit pas dépasser ${SCAN_MAX_FILE_SIZE / (1024 * 1024)} Mo`),
});

export type ValidateBulletinInput = z.infer<typeof validateBulletinSchema>;
export type UploadScanInput = z.infer<typeof uploadScanSchema>;
