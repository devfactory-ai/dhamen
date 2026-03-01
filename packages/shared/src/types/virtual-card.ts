/**
 * Virtual Card Types
 *
 * Types for digital adherent cards
 */

export type CardStatus = 'active' | 'suspended' | 'revoked' | 'expired';
export type VerificationType = 'qr_scan' | 'card_number' | 'nfc' | 'api';
export type VerificationStatus = 'success' | 'failed' | 'expired' | 'revoked';
export type CardEventType = 'issued' | 'renewed' | 'suspended' | 'reactivated' | 'revoked' | 'expired' | 'used';

export interface VirtualCard {
  id: string;
  adherentId: string;
  cardNumber: string;
  qrCodeToken: string;
  status: CardStatus;
  issuedAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  usageCount: number;
  deviceFingerprint: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VirtualCardWithAdherent extends VirtualCard {
  adherent: {
    id: string;
    adherentNumber: string;
    firstName: string;
    lastName: string;
    cin: string;
    dateOfBirth: string;
    photoUrl: string | null;
  };
  contract: {
    id: string;
    contractNumber: string;
    insurerName: string;
    insurerLogo: string | null;
    startDate: string;
    endDate: string;
    status: string;
  };
  coverage: {
    consultation: number;
    pharmacy: number;
    lab: number;
    imaging: number;
    hospitalization: number;
    dental: number;
    optical: number;
  };
}

export interface CardVerification {
  id: string;
  cardId: string;
  providerId: string | null;
  verificationType: VerificationType;
  status: VerificationStatus;
  ipAddress: string | null;
  userAgent: string | null;
  locationLat: number | null;
  locationLng: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CardEvent {
  id: string;
  cardId: string;
  eventType: CardEventType;
  reason: string | null;
  performedBy: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface QRCodeData {
  token: string;
  timestamp: number;
  signature: string;
}

export interface CardVerificationResult {
  valid: boolean;
  card: VirtualCardWithAdherent | null;
  reason?: string;
  verificationId?: string;
}

export interface GenerateCardRequest {
  adherentId: string;
  validityMonths?: number;
  deviceFingerprint?: string;
}

export interface VerifyCardRequest {
  qrCodeData?: string;
  cardNumber?: string;
  providerId?: string;
  location?: {
    lat: number;
    lng: number;
  };
}
