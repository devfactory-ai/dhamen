/**
 * Queue event types for Cloudflare Queues (dhamen-events)
 */

export interface OcrCompletedEvent {
  type: 'OCR_COMPLETED';
  documentId: string;
  demandeId: string;
  confidence: number;
  careType: string;
  montantTotal: number;
  timestamp: string;
}

export interface OcrFailedEvent {
  type: 'OCR_FAILED';
  documentId: string;
  demandeId: string;
  errorCode: string;
  attempt: number;
  timestamp: string;
}

export type OcrEvent = OcrCompletedEvent | OcrFailedEvent;
