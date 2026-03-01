/**
 * Virtual Card Service
 *
 * Handles digital adherent card generation, verification, and management
 */

import type { Bindings } from '../types';
import type {
  VirtualCard,
  VirtualCardWithAdherent,
  CardVerification,
  CardVerificationResult,
  QRCodeData,
  CardEventType,
} from '@dhamen/shared/types/virtual-card';

// Generate a cryptographically secure random string
function generateSecureToken(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Generate card number in format: DHM-XXXX-XXXX-XXXX
function generateCardNumber(): string {
  const segments = [];
  for (let i = 0; i < 3; i++) {
    const array = new Uint8Array(2);
    crypto.getRandomValues(array);
    segments.push(
      Array.from(array, (byte) => byte.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase()
    );
  }
  return `DHM-${segments.join('-')}`;
}

// Generate ULID-like ID
function generateId(): string {
  const timestamp = Date.now().toString(36).padStart(10, '0');
  const random = generateSecureToken(10);
  return `${timestamp}${random}`.toUpperCase().slice(0, 26);
}

export class VirtualCardService {
  constructor(private env: Bindings) {}

  /**
   * Generate a new virtual card for an adherent
   */
  async generateCard(
    adherentId: string,
    validityMonths: number = 12,
    deviceFingerprint?: string,
    performedBy?: string
  ): Promise<VirtualCard> {
    // Check if adherent exists and has active contract
    const adherent = await this.env.DB.prepare(`
      SELECT a.id, a.adherent_number, c.id as contract_id, c.end_date
      FROM adherents a
      JOIN contracts c ON a.contract_id = c.id
      WHERE a.id = ? AND a.deleted_at IS NULL AND c.status = 'active'
    `)
      .bind(adherentId)
      .first();

    if (!adherent) {
      throw new Error('ADHERENT_NOT_FOUND');
    }

    // Check if active card already exists
    const existingCard = await this.env.DB.prepare(`
      SELECT id FROM virtual_cards
      WHERE adherent_id = ? AND status = 'active' AND expires_at > datetime('now')
    `)
      .bind(adherentId)
      .first();

    if (existingCard) {
      throw new Error('ACTIVE_CARD_EXISTS');
    }

    const cardId = generateId();
    const cardNumber = generateCardNumber();
    const qrCodeToken = generateSecureToken(32);
    const qrCodeSecret = generateSecureToken(64);

    // Calculate expiry date (minimum of card validity or contract end date)
    const cardExpiry = new Date();
    cardExpiry.setMonth(cardExpiry.getMonth() + validityMonths);

    const contractEndDate = new Date(adherent.end_date as string);
    const expiresAt = cardExpiry < contractEndDate ? cardExpiry : contractEndDate;

    await this.env.DB.prepare(`
      INSERT INTO virtual_cards (
        id, adherent_id, card_number, qr_code_token, qr_code_secret,
        status, expires_at, device_fingerprint
      ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
    `)
      .bind(
        cardId,
        adherentId,
        cardNumber,
        qrCodeToken,
        qrCodeSecret,
        expiresAt.toISOString(),
        deviceFingerprint || null
      )
      .run();

    // Log card issued event
    await this.logCardEvent(cardId, 'issued', null, performedBy);

    // Cache the card for fast verification
    await this.cacheCard(qrCodeToken, cardId);

    return {
      id: cardId,
      adherentId,
      cardNumber,
      qrCodeToken,
      status: 'active',
      issuedAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      lastUsedAt: null,
      usageCount: 0,
      deviceFingerprint: deviceFingerprint || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Generate QR code data for a card
   */
  async generateQRCodeData(cardId: string): Promise<QRCodeData> {
    const card = await this.env.DB.prepare(`
      SELECT qr_code_token, qr_code_secret, status, expires_at
      FROM virtual_cards WHERE id = ?
    `)
      .bind(cardId)
      .first();

    if (!card) {
      throw new Error('CARD_NOT_FOUND');
    }

    if (card.status !== 'active') {
      throw new Error('CARD_NOT_ACTIVE');
    }

    if (new Date(card.expires_at as string) < new Date()) {
      throw new Error('CARD_EXPIRED');
    }

    const timestamp = Date.now();
    const dataToSign = `${card.qr_code_token}:${timestamp}`;

    // Create HMAC signature using Web Crypto API
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(card.qr_code_secret as string),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(dataToSign));
    const signature = Array.from(new Uint8Array(signatureBuffer), (b) =>
      b.toString(16).padStart(2, '0')
    ).join('');

    return {
      token: card.qr_code_token as string,
      timestamp,
      signature,
    };
  }

  /**
   * Verify a card via QR code scan or card number
   */
  async verifyCard(
    input: { qrCodeData?: string; cardNumber?: string },
    providerId?: string,
    ipAddress?: string,
    userAgent?: string,
    location?: { lat: number; lng: number }
  ): Promise<CardVerificationResult> {
    const verificationId = generateId();
    let card: VirtualCardWithAdherent | null = null;
    let verificationType: 'qr_scan' | 'card_number' = 'card_number';
    let verificationStatus: 'success' | 'failed' | 'expired' | 'revoked' = 'failed';
    let reason: string | undefined;

    try {
      if (input.qrCodeData) {
        verificationType = 'qr_scan';
        const result = await this.verifyQRCode(input.qrCodeData);
        if (result.valid && result.card) {
          card = result.card;
          verificationStatus = 'success';
        } else {
          reason = result.reason;
          if (reason === 'CARD_EXPIRED') verificationStatus = 'expired';
          else if (reason === 'CARD_REVOKED') verificationStatus = 'revoked';
        }
      } else if (input.cardNumber) {
        verificationType = 'card_number';
        const result = await this.verifyByCardNumber(input.cardNumber);
        if (result.valid && result.card) {
          card = result.card;
          verificationStatus = 'success';
        } else {
          reason = result.reason;
          if (reason === 'CARD_EXPIRED') verificationStatus = 'expired';
          else if (reason === 'CARD_REVOKED') verificationStatus = 'revoked';
        }
      } else {
        reason = 'NO_VERIFICATION_DATA';
      }

      // Log verification attempt
      await this.logVerification(
        verificationId,
        card?.id || null,
        providerId,
        verificationType,
        verificationStatus,
        ipAddress,
        userAgent,
        location
      );

      // Update card usage if successful
      if (verificationStatus === 'success' && card) {
        await this.updateCardUsage(card.id);
      }

      return {
        valid: verificationStatus === 'success',
        card,
        reason,
        verificationId,
      };
    } catch (error) {
      reason = error instanceof Error ? error.message : 'VERIFICATION_ERROR';
      return { valid: false, card: null, reason };
    }
  }

  /**
   * Verify QR code data
   */
  private async verifyQRCode(qrCodeDataString: string): Promise<CardVerificationResult> {
    try {
      const qrData: QRCodeData = JSON.parse(qrCodeDataString);
      const { token, timestamp, signature } = qrData;

      // Check timestamp (valid for 5 minutes)
      const now = Date.now();
      if (now - timestamp > 5 * 60 * 1000) {
        return { valid: false, card: null, reason: 'QR_CODE_EXPIRED' };
      }

      // Get card by token
      const cardData = await this.env.DB.prepare(`
        SELECT id, qr_code_secret, status, expires_at
        FROM virtual_cards WHERE qr_code_token = ?
      `)
        .bind(token)
        .first();

      if (!cardData) {
        return { valid: false, card: null, reason: 'CARD_NOT_FOUND' };
      }

      // Verify signature
      const dataToSign = `${token}:${timestamp}`;
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(cardData.qr_code_secret as string),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      );

      const signatureBytes = new Uint8Array(
        (signature.match(/.{2}/g) || []).map((byte) => parseInt(byte, 16))
      );

      const isValid = await crypto.subtle.verify(
        'HMAC',
        key,
        signatureBytes,
        encoder.encode(dataToSign)
      );

      if (!isValid) {
        return { valid: false, card: null, reason: 'INVALID_SIGNATURE' };
      }

      // Check card status
      if (cardData.status === 'revoked') {
        return { valid: false, card: null, reason: 'CARD_REVOKED' };
      }
      if (cardData.status === 'suspended') {
        return { valid: false, card: null, reason: 'CARD_SUSPENDED' };
      }
      if (new Date(cardData.expires_at as string) < new Date()) {
        return { valid: false, card: null, reason: 'CARD_EXPIRED' };
      }

      // Get full card details
      const card = await this.getCardWithAdherent(cardData.id as string);
      return { valid: true, card };
    } catch {
      return { valid: false, card: null, reason: 'INVALID_QR_DATA' };
    }
  }

  /**
   * Verify by card number
   */
  private async verifyByCardNumber(cardNumber: string): Promise<CardVerificationResult> {
    const cardData = await this.env.DB.prepare(`
      SELECT id, status, expires_at
      FROM virtual_cards WHERE card_number = ?
    `)
      .bind(cardNumber.toUpperCase())
      .first();

    if (!cardData) {
      return { valid: false, card: null, reason: 'CARD_NOT_FOUND' };
    }

    if (cardData.status === 'revoked') {
      return { valid: false, card: null, reason: 'CARD_REVOKED' };
    }
    if (cardData.status === 'suspended') {
      return { valid: false, card: null, reason: 'CARD_SUSPENDED' };
    }
    if (new Date(cardData.expires_at as string) < new Date()) {
      return { valid: false, card: null, reason: 'CARD_EXPIRED' };
    }

    const card = await this.getCardWithAdherent(cardData.id as string);
    return { valid: true, card };
  }

  /**
   * Get card with full adherent and contract details
   */
  async getCardWithAdherent(cardId: string): Promise<VirtualCardWithAdherent | null> {
    const result = await this.env.DB.prepare(`
      SELECT
        vc.id, vc.adherent_id, vc.card_number, vc.qr_code_token, vc.status,
        vc.issued_at, vc.expires_at, vc.last_used_at, vc.usage_count,
        vc.device_fingerprint, vc.created_at, vc.updated_at,
        a.adherent_number, a.first_name, a.last_name, a.cin, a.date_of_birth, a.photo_url,
        c.id as contract_id, c.contract_number, c.start_date as contract_start,
        c.end_date as contract_end, c.status as contract_status,
        i.name as insurer_name, i.logo_url as insurer_logo,
        cov.consultation_percent, cov.pharmacy_percent, cov.lab_percent,
        cov.imaging_percent, cov.hospitalization_percent, cov.dental_percent, cov.optical_percent
      FROM virtual_cards vc
      JOIN adherents a ON vc.adherent_id = a.id
      JOIN contracts c ON a.contract_id = c.id
      JOIN insurers i ON c.insurer_id = i.id
      LEFT JOIN coverage_rules cov ON c.id = cov.contract_id
      WHERE vc.id = ?
    `)
      .bind(cardId)
      .first();

    if (!result) return null;

    return {
      id: result.id as string,
      adherentId: result.adherent_id as string,
      cardNumber: result.card_number as string,
      qrCodeToken: result.qr_code_token as string,
      status: result.status as VirtualCardWithAdherent['status'],
      issuedAt: result.issued_at as string,
      expiresAt: result.expires_at as string,
      lastUsedAt: result.last_used_at as string | null,
      usageCount: result.usage_count as number,
      deviceFingerprint: result.device_fingerprint as string | null,
      createdAt: result.created_at as string,
      updatedAt: result.updated_at as string,
      adherent: {
        id: result.adherent_id as string,
        adherentNumber: result.adherent_number as string,
        firstName: result.first_name as string,
        lastName: result.last_name as string,
        cin: result.cin as string,
        dateOfBirth: result.date_of_birth as string,
        photoUrl: result.photo_url as string | null,
      },
      contract: {
        id: result.contract_id as string,
        contractNumber: result.contract_number as string,
        insurerName: result.insurer_name as string,
        insurerLogo: result.insurer_logo as string | null,
        startDate: result.contract_start as string,
        endDate: result.contract_end as string,
        status: result.contract_status as string,
      },
      coverage: {
        consultation: (result.consultation_percent as number) || 80,
        pharmacy: (result.pharmacy_percent as number) || 80,
        lab: (result.lab_percent as number) || 70,
        imaging: (result.imaging_percent as number) || 70,
        hospitalization: (result.hospitalization_percent as number) || 90,
        dental: (result.dental_percent as number) || 60,
        optical: (result.optical_percent as number) || 60,
      },
    };
  }

  /**
   * Suspend a card
   */
  async suspendCard(cardId: string, reason: string, performedBy?: string): Promise<void> {
    await this.env.DB.prepare(`
      UPDATE virtual_cards SET status = 'suspended', updated_at = datetime('now')
      WHERE id = ? AND status = 'active'
    `)
      .bind(cardId)
      .run();

    await this.logCardEvent(cardId, 'suspended', reason, performedBy);
    await this.invalidateCardCache(cardId);
  }

  /**
   * Reactivate a suspended card
   */
  async reactivateCard(cardId: string, reason?: string, performedBy?: string): Promise<void> {
    const card = await this.env.DB.prepare(`
      SELECT status, expires_at FROM virtual_cards WHERE id = ?
    `)
      .bind(cardId)
      .first();

    if (!card) throw new Error('CARD_NOT_FOUND');
    if (card.status !== 'suspended') throw new Error('CARD_NOT_SUSPENDED');
    if (new Date(card.expires_at as string) < new Date()) throw new Error('CARD_EXPIRED');

    await this.env.DB.prepare(`
      UPDATE virtual_cards SET status = 'active', updated_at = datetime('now')
      WHERE id = ?
    `)
      .bind(cardId)
      .run();

    await this.logCardEvent(cardId, 'reactivated', reason ?? null, performedBy);
  }

  /**
   * Revoke a card permanently
   */
  async revokeCard(cardId: string, reason: string, performedBy?: string): Promise<void> {
    await this.env.DB.prepare(`
      UPDATE virtual_cards SET status = 'revoked', updated_at = datetime('now')
      WHERE id = ?
    `)
      .bind(cardId)
      .run();

    await this.logCardEvent(cardId, 'revoked', reason, performedBy);
    await this.invalidateCardCache(cardId);
  }

  /**
   * Renew a card
   */
  async renewCard(
    cardId: string,
    validityMonths: number = 12,
    performedBy?: string
  ): Promise<VirtualCard> {
    const oldCard = await this.env.DB.prepare(`
      SELECT adherent_id, device_fingerprint FROM virtual_cards WHERE id = ?
    `)
      .bind(cardId)
      .first();

    if (!oldCard) throw new Error('CARD_NOT_FOUND');

    // Revoke old card
    await this.revokeCard(cardId, 'Renouvelée', performedBy);

    // Generate new card
    return this.generateCard(
      oldCard.adherent_id as string,
      validityMonths,
      oldCard.device_fingerprint as string | undefined,
      performedBy
    );
  }

  /**
   * List cards with filters
   */
  async listCards(
    filters: { adherentId?: string; status?: string },
    page: number = 1,
    limit: number = 20
  ): Promise<{ cards: VirtualCard[]; total: number }> {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filters.adherentId) {
      conditions.push('adherent_id = ?');
      params.push(filters.adherentId);
    }
    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const countResult = await this.env.DB.prepare(
      `SELECT COUNT(*) as total FROM virtual_cards ${whereClause}`
    )
      .bind(...params)
      .first();

    const result = await this.env.DB.prepare(`
      SELECT * FROM virtual_cards ${whereClause}
      ORDER BY created_at DESC LIMIT ? OFFSET ?
    `)
      .bind(...params, limit, offset)
      .all();

    return {
      cards: (result.results || []).map((row) => ({
        id: row.id as string,
        adherentId: row.adherent_id as string,
        cardNumber: row.card_number as string,
        qrCodeToken: row.qr_code_token as string,
        status: row.status as VirtualCard['status'],
        issuedAt: row.issued_at as string,
        expiresAt: row.expires_at as string,
        lastUsedAt: row.last_used_at as string | null,
        usageCount: row.usage_count as number,
        deviceFingerprint: row.device_fingerprint as string | null,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
      })),
      total: (countResult?.total as number) || 0,
    };
  }

  /**
   * Get verification history for a card
   */
  async getVerificationHistory(
    cardId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{ verifications: CardVerification[]; total: number }> {
    const offset = (page - 1) * limit;

    const countResult = await this.env.DB.prepare(
      `SELECT COUNT(*) as total FROM card_verifications WHERE card_id = ?`
    )
      .bind(cardId)
      .first();

    const result = await this.env.DB.prepare(`
      SELECT * FROM card_verifications WHERE card_id = ?
      ORDER BY created_at DESC LIMIT ? OFFSET ?
    `)
      .bind(cardId, limit, offset)
      .all();

    return {
      verifications: (result.results || []).map((row) => ({
        id: row.id as string,
        cardId: row.card_id as string,
        providerId: row.provider_id as string | null,
        verificationType: row.verification_type as CardVerification['verificationType'],
        status: row.status as CardVerification['status'],
        ipAddress: row.ip_address as string | null,
        userAgent: row.user_agent as string | null,
        locationLat: row.location_lat as number | null,
        locationLng: row.location_lng as number | null,
        metadata: JSON.parse((row.metadata as string) || '{}'),
        createdAt: row.created_at as string,
      })),
      total: (countResult?.total as number) || 0,
    };
  }

  // ============== PRIVATE HELPERS ==============

  private async logCardEvent(
    cardId: string,
    eventType: CardEventType,
    reason: string | null,
    performedBy?: string
  ): Promise<void> {
    await this.env.DB.prepare(`
      INSERT INTO card_events (id, card_id, event_type, reason, performed_by)
      VALUES (?, ?, ?, ?, ?)
    `)
      .bind(generateId(), cardId, eventType, reason, performedBy || null)
      .run();
  }

  private async logVerification(
    id: string,
    cardId: string | null,
    providerId: string | undefined,
    verificationType: string,
    status: string,
    ipAddress?: string,
    userAgent?: string,
    location?: { lat: number; lng: number }
  ): Promise<void> {
    if (!cardId) return;

    await this.env.DB.prepare(`
      INSERT INTO card_verifications (
        id, card_id, provider_id, verification_type, status,
        ip_address, user_agent, location_lat, location_lng
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        id,
        cardId,
        providerId || null,
        verificationType,
        status,
        ipAddress || null,
        userAgent || null,
        location?.lat || null,
        location?.lng || null
      )
      .run();
  }

  private async updateCardUsage(cardId: string): Promise<void> {
    await this.env.DB.prepare(`
      UPDATE virtual_cards
      SET usage_count = usage_count + 1, last_used_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `)
      .bind(cardId)
      .run();
  }

  private async cacheCard(token: string, cardId: string): Promise<void> {
    await this.env.CACHE.put(`card:${token}`, cardId, { expirationTtl: 3600 });
  }

  private async invalidateCardCache(cardId: string): Promise<void> {
    const card = await this.env.DB.prepare(`SELECT qr_code_token FROM virtual_cards WHERE id = ?`)
      .bind(cardId)
      .first();
    if (card) {
      await this.env.CACHE.delete(`card:${card.qr_code_token}`);
    }
  }
}
