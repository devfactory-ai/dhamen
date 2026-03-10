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

/**
 * Sante notification types for demande status transitions
 */
export type SanteNotificationType =
  | 'SANTE_DEMANDE_SOUMISE'
  | 'SANTE_DEMANDE_APPROUVEE'
  | 'SANTE_DEMANDE_REJETEE'
  | 'SANTE_DEMANDE_EN_EXAMEN'
  | 'SANTE_INFO_REQUISE'
  | 'SANTE_DEMANDE_EN_PAIEMENT'
  | 'SANTE_PAIEMENT_EFFECTUE';

/**
 * Payload for demande status change notifications
 */
export interface DemandeNotificationPayload {
  demandeId: string;
  numeroDemande: string;
  adherentId: string;
  typeSoin: string;
  dateSoin: string;
  statut: string;
  montantDemande: number;
  montantRembourse?: number;
  motifRejet?: string;
  notes?: string;
}

/**
 * Demande notification event (push + in-app + realtime)
 */
export interface DemandeNotificationEvent {
  type: SanteNotificationType;
  payload: DemandeNotificationPayload;
  timestamp: string;
}

/**
 * Status-to-notification type mapping
 */
export const STATUT_TO_NOTIFICATION: Record<string, SanteNotificationType> = {
  soumise: 'SANTE_DEMANDE_SOUMISE',
  approuvee: 'SANTE_DEMANDE_APPROUVEE',
  rejetee: 'SANTE_DEMANDE_REJETEE',
  en_examen: 'SANTE_DEMANDE_EN_EXAMEN',
  info_requise: 'SANTE_INFO_REQUISE',
  en_paiement: 'SANTE_DEMANDE_EN_PAIEMENT',
  payee: 'SANTE_PAIEMENT_EFFECTUE',
};

/**
 * Statuses that should trigger push notifications (important transitions)
 */
export const PUSH_ENABLED_STATUSES: SanteNotificationType[] = [
  'SANTE_DEMANDE_APPROUVEE',
  'SANTE_DEMANDE_REJETEE',
  'SANTE_INFO_REQUISE',
  'SANTE_PAIEMENT_EFFECTUE',
];
