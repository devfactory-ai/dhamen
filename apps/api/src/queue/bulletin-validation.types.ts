/**
 * Queue message types for async bulletin validation
 */

export interface BulletinValidationMessage {
  type: 'VALIDATE_BULLETIN';
  bulletinId: string;
  /** Database binding name (DB_BH, DB_STAR, etc.) */
  dbBinding: string;
  userId: string;
  companyId: string;
  ocrJobId: string;
}

/**
 * Queue message for OCR analysis + validation of a single bulletin.
 * Files are stored in R2 under the ocrJobId prefix.
 */
export interface OcrAnalyseMessage {
  type: 'OCR_ANALYSE_BULLETIN';
  bulletinId: string;
  dbBinding: string;
  userId: string;
  companyId: string;
  batchId: string | null;
  ocrJobId: string;
  /** R2 keys of the files belonging to this bulletin */
  r2FileKeys: string[];
}

export type QueueMessage = BulletinValidationMessage | OcrAnalyseMessage;

export interface ValidationError {
  field: string;
  code: string;
  message: string;
  /** The value that failed validation */
  value?: string;
}

export type ValidationStatus =
  | 'pending_validation'
  | 'pending_ocr'
  | 'processing_ocr'
  | 'validating'
  | 'ready_for_validation'
  | 'pending_correction';
