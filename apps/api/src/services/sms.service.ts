/**
 * SMS Gateway Service
 *
 * Multi-provider SMS service for Tunisia with support for:
 * - Ooredoo Tunisia Business
 * - Tunisie Telecom (TopNet SMS)
 * - Orange Tunisia
 * - International providers (Twilio, Vonage)
 *
 * Features:
 * - Provider failover
 * - Rate limiting
 * - Template support
 * - Delivery tracking
 * - Cost optimization
 */

import { ulid } from 'ulid';

/**
 * Generate prefixed ID
 */
function generatePrefixedId(prefix: string): string {
  return `${prefix}-${ulid()}`;
}

export type SmsProvider = 'ooredoo' | 'tt' | 'orange' | 'twilio' | 'vonage' | 'mock';

export type SmsStatus =
  | 'pending'
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'rejected'
  | 'expired';

export interface SmsMessage {
  id: string;
  to: string;
  body: string;
  sender?: string;
  templateCode?: string;
  provider?: SmsProvider;
  status: SmsStatus;
  providerMessageId?: string;
  cost?: number;
  segments?: number;
  sentAt?: string;
  deliveredAt?: string;
  failedReason?: string;
  retryCount: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface SendSmsParams {
  to: string;
  body: string;
  sender?: string;
  templateCode?: string;
  variables?: Record<string, string>;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  metadata?: Record<string, unknown>;
}

export interface SmsTemplate {
  code: string;
  name: string;
  body: string;
  variables: string[];
  maxLength?: number;
}

export interface SmsConfig {
  provider: SmsProvider;
  apiKey?: string;
  apiSecret?: string;
  accountSid?: string;
  authToken?: string;
  senderId?: string;
  baseUrl?: string;
}

interface SmsEnv {
  DB: D1Database;
  CACHE: KVNamespace;
  SMS_PROVIDER?: string;
  SMS_API_KEY?: string;
  SMS_API_SECRET?: string;
  SMS_SENDER_ID?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM_NUMBER?: string;
  VONAGE_API_KEY?: string;
  VONAGE_API_SECRET?: string;
  OOREDOO_API_URL?: string;
  OOREDOO_API_KEY?: string;
  TT_SMS_API_URL?: string;
  TT_SMS_API_KEY?: string;
}

// Pre-defined SMS templates for common operations
const SMS_TEMPLATES: Record<string, SmsTemplate> = {
  OTP_LOGIN: {
    code: 'OTP_LOGIN',
    name: 'Code de connexion',
    body: 'E-Santé: Votre code de verification est {code}. Valide 5 minutes.',
    variables: ['code'],
    maxLength: 160,
  },
  OTP_RESET: {
    code: 'OTP_RESET',
    name: 'Reinitialisation mot de passe',
    body: 'E-Santé: Code de reinitialisation: {code}. Ne partagez jamais ce code.',
    variables: ['code'],
    maxLength: 160,
  },
  CLAIM_SUBMITTED: {
    code: 'CLAIM_SUBMITTED',
    name: 'Demande soumise',
    body: 'E-Santé: Votre demande {numero} a ete soumise. Montant: {montant} TND.',
    variables: ['numero', 'montant'],
    maxLength: 160,
  },
  CLAIM_APPROVED: {
    code: 'CLAIM_APPROVED',
    name: 'Demande approuvee',
    body: 'E-Santé: Bonne nouvelle! Demande {numero} approuvee. Remb: {montant} TND.',
    variables: ['numero', 'montant'],
    maxLength: 160,
  },
  CLAIM_REJECTED: {
    code: 'CLAIM_REJECTED',
    name: 'Demande rejetee',
    body: 'E-Santé: Demande {numero} non approuvee. Motif: {motif}. Contactez-nous.',
    variables: ['numero', 'motif'],
    maxLength: 160,
  },
  PAYMENT_SENT: {
    code: 'PAYMENT_SENT',
    name: 'Paiement effectue',
    body: 'E-Santé: Virement de {montant} TND effectue sur votre compte. Ref: {ref}.',
    variables: ['montant', 'ref'],
    maxLength: 160,
  },
  FRAUD_ALERT: {
    code: 'FRAUD_ALERT',
    name: 'Alerte fraude',
    body: 'URGENT E-Santé: Activite suspecte detectee. Demande {numero}. Verifiez.',
    variables: ['numero'],
    maxLength: 160,
  },
  CARD_ACTIVATED: {
    code: 'CARD_ACTIVATED',
    name: 'Carte activee',
    body: 'E-Santé: Votre carte virtuelle est active. Code PIN: {pin}. Gardez-le secret.',
    variables: ['pin'],
    maxLength: 160,
  },
  ELIGIBILITY_VERIFIED: {
    code: 'ELIGIBILITY_VERIFIED',
    name: 'Eligibilite verifiee',
    body: 'E-Santé: {adherent} eligibile. Couverture: {taux}%. Plafond dispo: {plafond} TND.',
    variables: ['adherent', 'taux', 'plafond'],
    maxLength: 160,
  },
  BORDEREAU_READY: {
    code: 'BORDEREAU_READY',
    name: 'Bordereau disponible',
    body: 'E-Santé: Bordereau {numero} pret. Montant: {montant} TND. Consultez portail.',
    variables: ['numero', 'montant'],
    maxLength: 160,
  },
};

export class SmsService {
  private db: D1Database;
  private cache: KVNamespace;
  private primaryProvider: SmsProvider;
  private fallbackProvider?: SmsProvider;
  private config: Partial<SmsEnv>;

  constructor(env: SmsEnv) {
    this.db = env.DB;
    this.cache = env.CACHE;
    this.config = env;
    this.primaryProvider = (env.SMS_PROVIDER as SmsProvider) || 'mock';

    // Set fallback provider
    if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
      this.fallbackProvider = 'twilio';
    } else if (env.VONAGE_API_KEY && env.VONAGE_API_SECRET) {
      this.fallbackProvider = 'vonage';
    }
  }

  /**
   * Send SMS message
   */
  async send(params: SendSmsParams): Promise<SmsMessage> {
    const { to, body, sender, templateCode, variables, priority = 'normal', metadata } = params;

    // Normalize phone number
    const normalizedTo = this.normalizePhone(to);
    if (!normalizedTo) {
      throw new Error('Invalid phone number');
    }

    // Resolve body from template if provided
    let messageBody = body;
    if (templateCode) {
      const template = SMS_TEMPLATES[templateCode];
      if (!template) {
        throw new Error(`Template not found: ${templateCode}`);
      }
      messageBody = this.renderTemplate(template.body, variables || {});
    }

    // Calculate segments
    const segments = this.calculateSegments(messageBody);

    // Check rate limit
    await this.checkRateLimit(normalizedTo);

    // Create message record
    const message: SmsMessage = {
      id: generatePrefixedId('SMS'),
      to: normalizedTo,
      body: messageBody,
      sender: sender || this.config.SMS_SENDER_ID || 'E-Sante',
      templateCode,
      status: 'pending',
      segments,
      retryCount: 0,
      metadata,
      createdAt: new Date().toISOString(),
    };

    // Save to database
    await this.saveMessage(message);

    // Send via provider (with priority queue for urgent messages)
    if (priority === 'urgent' || priority === 'high') {
      // Send immediately
      return this.deliverMessage(message);
    }

    // For normal/low priority, can be queued
    return this.deliverMessage(message);
  }

  /**
   * Send SMS using template
   */
  async sendFromTemplate(
    templateCode: string,
    to: string,
    variables: Record<string, string>,
    options: { priority?: SendSmsParams['priority']; metadata?: Record<string, unknown> } = {}
  ): Promise<SmsMessage> {
    const template = SMS_TEMPLATES[templateCode];
    if (!template) {
      throw new Error(`Template not found: ${templateCode}`);
    }

    return this.send({
      to,
      body: '', // Will be overridden by template
      templateCode,
      variables,
      priority: options.priority,
      metadata: options.metadata,
    });
  }

  /**
   * Send OTP via SMS
   */
  async sendOTP(
    to: string,
    purpose: 'login' | 'reset' | 'verify' = 'login'
  ): Promise<{ message: SmsMessage; otp: string }> {
    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));

    // Store OTP in cache (5 minutes TTL)
    const cacheKey = `otp:${purpose}:${this.normalizePhone(to)}`;
    await this.cache.put(cacheKey, otp, { expirationTtl: 300 });

    const templateCode = purpose === 'reset' ? 'OTP_RESET' : 'OTP_LOGIN';
    const message = await this.sendFromTemplate(templateCode, to, { code: otp }, { priority: 'urgent' });

    return { message, otp };
  }

  /**
   * Verify OTP
   */
  async verifyOTP(to: string, otp: string, purpose: 'login' | 'reset' | 'verify' = 'login'): Promise<boolean> {
    const cacheKey = `otp:${purpose}:${this.normalizePhone(to)}`;
    const storedOtp = await this.cache.get(cacheKey);

    if (!storedOtp) {
      return false;
    }

    // Timing-safe comparison
    if (storedOtp.length !== otp.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < storedOtp.length; i++) {
      result |= storedOtp.charCodeAt(i) ^ otp.charCodeAt(i);
    }

    const isValid = result === 0;

    // Delete OTP after verification (one-time use)
    if (isValid) {
      await this.cache.delete(cacheKey);
    }

    return isValid;
  }

  /**
   * Deliver message via provider
   */
  private async deliverMessage(message: SmsMessage): Promise<SmsMessage> {
    const providers = [this.primaryProvider, this.fallbackProvider].filter(Boolean) as SmsProvider[];

    for (const provider of providers) {
      try {
        message.provider = provider;
        const result = await this.sendViaProvider(message, provider);

        message.status = 'sent';
        message.providerMessageId = result.messageId;
        message.cost = result.cost;
        message.sentAt = new Date().toISOString();

        await this.updateMessage(message);
        await this.logDelivery(message, provider, 'sent');

        return message;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`SMS delivery failed via ${provider}:`, errorMessage);

        // Log failed attempt
        await this.logDelivery(message, provider, 'failed', errorMessage);

        // Try fallback provider
        continue;
      }
    }

    // All providers failed
    message.status = 'failed';
    message.failedReason = 'All providers failed';
    message.retryCount += 1;
    await this.updateMessage(message);

    return message;
  }

  /**
   * Send via specific provider
   */
  private async sendViaProvider(
    message: SmsMessage,
    provider: SmsProvider
  ): Promise<{ messageId: string; cost?: number }> {
    switch (provider) {
      case 'ooredoo':
        return this.sendViaOoredoo(message);
      case 'tt':
        return this.sendViaTunisieTelecom(message);
      case 'orange':
        return this.sendViaOrange(message);
      case 'twilio':
        return this.sendViaTwilio(message);
      case 'vonage':
        return this.sendViaVonage(message);
      case 'mock':
      default:
        return this.sendViaMock(message);
    }
  }

  /**
   * Send via Ooredoo Tunisia
   */
  private async sendViaOoredoo(message: SmsMessage): Promise<{ messageId: string; cost?: number }> {
    const apiUrl = this.config.OOREDOO_API_URL || 'https://api.ooredoo.tn/sms/v1/send';
    const apiKey = this.config.OOREDOO_API_KEY;

    if (!apiKey) {
      throw new Error('Ooredoo API key not configured');
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: message.to,
        from: message.sender,
        message: message.body,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ooredoo error: ${error}`);
    }

    const result = await response.json() as { message_id: string; cost?: number };
    return { messageId: result.message_id, cost: result.cost };
  }

  /**
   * Send via Tunisie Telecom (TopNet SMS)
   */
  private async sendViaTunisieTelecom(message: SmsMessage): Promise<{ messageId: string; cost?: number }> {
    const apiUrl = this.config.TT_SMS_API_URL || 'https://sms.topnet.tn/api/send';
    const apiKey = this.config.TT_SMS_API_KEY;

    if (!apiKey) {
      throw new Error('Tunisie Telecom API key not configured');
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        destinataire: message.to,
        expediteur: message.sender,
        texte: message.body,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`TT error: ${error}`);
    }

    const result = await response.json() as { id: string; cout?: number };
    return { messageId: result.id, cost: result.cout };
  }

  /**
   * Send via Orange Tunisia
   */
  private async sendViaOrange(message: SmsMessage): Promise<{ messageId: string; cost?: number }> {
    // Orange Tunisia SMS API
    const apiKey = this.config.SMS_API_KEY;

    if (!apiKey) {
      throw new Error('Orange API key not configured');
    }

    const response = await fetch('https://api.orange.tn/sms/v1/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        outboundSMSMessageRequest: {
          address: `tel:${message.to}`,
          senderAddress: message.sender,
          outboundSMSTextMessage: {
            message: message.body,
          },
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Orange error: ${error}`);
    }

    const result = await response.json() as { outboundSMSMessageRequest: { resourceURL: string } };
    const messageId = result.outboundSMSMessageRequest.resourceURL.split('/').pop() || generatePrefixedId('ORA');
    return { messageId };
  }

  /**
   * Send via Twilio
   */
  private async sendViaTwilio(message: SmsMessage): Promise<{ messageId: string; cost?: number }> {
    const accountSid = this.config.TWILIO_ACCOUNT_SID;
    const authToken = this.config.TWILIO_AUTH_TOKEN;
    const fromNumber = this.config.TWILIO_FROM_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      throw new Error('Twilio credentials not configured');
    }

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: message.to,
          From: fromNumber,
          Body: message.body,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Twilio error: ${error}`);
    }

    const result = await response.json() as { sid: string; price?: string };
    return {
      messageId: result.sid,
      cost: result.price ? Math.abs(parseFloat(result.price)) : undefined,
    };
  }

  /**
   * Send via Vonage (Nexmo)
   */
  private async sendViaVonage(message: SmsMessage): Promise<{ messageId: string; cost?: number }> {
    const apiKey = this.config.VONAGE_API_KEY;
    const apiSecret = this.config.VONAGE_API_SECRET;

    if (!apiKey || !apiSecret) {
      throw new Error('Vonage credentials not configured');
    }

    const response = await fetch('https://rest.nexmo.com/sms/json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        api_secret: apiSecret,
        to: message.to,
        from: message.sender,
        text: message.body,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Vonage error: ${error}`);
    }

    const result = await response.json() as {
      messages: Array<{ 'message-id': string; 'message-price'?: string; status: string; 'error-text'?: string }>;
    };

    const firstMessage = result.messages[0];
    if (!firstMessage || firstMessage.status !== '0') {
      throw new Error(`Vonage error: ${firstMessage?.['error-text'] || 'Unknown error'}`);
    }

    return {
      messageId: firstMessage['message-id'],
      cost: firstMessage['message-price'] ? parseFloat(firstMessage['message-price']) : undefined,
    };
  }

  /**
   * Mock provider for development
   */
  private async sendViaMock(message: SmsMessage): Promise<{ messageId: string; cost?: number }> {
    console.log('[MOCK SMS]', {
      to: message.to,
      body: message.body,
      sender: message.sender,
    });

    // Simulate delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    return {
      messageId: `MOCK-${generatePrefixedId('MSG')}`,
      cost: 0.05 * (message.segments || 1),
    };
  }

  /**
   * Normalize Tunisian phone number
   */
  private normalizePhone(phone: string): string | null {
    // Remove all non-digits
    let cleaned = phone.replace(/\D/g, '');

    // Handle different formats
    if (cleaned.startsWith('216')) {
      // Already has country code
      cleaned = '+' + cleaned;
    } else if (cleaned.startsWith('00216')) {
      cleaned = '+' + cleaned.substring(2);
    } else if (cleaned.length === 8) {
      // Local format (8 digits)
      cleaned = '+216' + cleaned;
    } else if (cleaned.startsWith('0') && cleaned.length === 9) {
      // Local format with leading 0
      cleaned = '+216' + cleaned.substring(1);
    } else {
      // International format
      cleaned = '+' + cleaned;
    }

    // Validate Tunisian format (+216 XX XXX XXX)
    if (!/^\+216[2-9]\d{7}$/.test(cleaned)) {
      return null;
    }

    return cleaned;
  }

  /**
   * Calculate SMS segments
   */
  private calculateSegments(body: string): number {
    // GSM-7 encoding: 160 chars/segment (or 153 for multipart)
    // UCS-2 encoding: 70 chars/segment (or 67 for multipart)

    // Check if message needs UCS-2 (Arabic, emojis, etc.)
    const needsUCS2 = /[^\x00-\x7F]/.test(body);

    if (needsUCS2) {
      if (body.length <= 70) return 1;
      return Math.ceil(body.length / 67);
    } else {
      if (body.length <= 160) return 1;
      return Math.ceil(body.length / 153);
    }
  }

  /**
   * Render template with variables
   */
  private renderTemplate(template: string, variables: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
  }

  /**
   * Check rate limit for phone number
   */
  private async checkRateLimit(phone: string): Promise<void> {
    const key = `sms_rate:${phone}`;
    const count = await this.cache.get(key);
    const currentCount = count ? parseInt(count, 10) : 0;

    // Max 10 SMS per hour per number
    if (currentCount >= 10) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }

    // Increment counter with 1 hour TTL
    await this.cache.put(key, String(currentCount + 1), { expirationTtl: 3600 });
  }

  /**
   * Save message to database
   */
  private async saveMessage(message: SmsMessage): Promise<void> {
    await this.db
      .prepare(
        `
      INSERT INTO sms_messages (
        id, phone_to, body, sender, template_code, provider, status,
        provider_message_id, cost, segments, sent_at, delivered_at,
        failed_reason, retry_count, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .bind(
        message.id,
        message.to,
        message.body,
        message.sender || null,
        message.templateCode || null,
        message.provider || null,
        message.status,
        message.providerMessageId || null,
        message.cost || null,
        message.segments || 1,
        message.sentAt || null,
        message.deliveredAt || null,
        message.failedReason || null,
        message.retryCount,
        message.metadata ? JSON.stringify(message.metadata) : null,
        message.createdAt
      )
      .run();
  }

  /**
   * Update message in database
   */
  private async updateMessage(message: SmsMessage): Promise<void> {
    await this.db
      .prepare(
        `
      UPDATE sms_messages SET
        provider = ?, status = ?, provider_message_id = ?, cost = ?,
        sent_at = ?, delivered_at = ?, failed_reason = ?, retry_count = ?
      WHERE id = ?
    `
      )
      .bind(
        message.provider || null,
        message.status,
        message.providerMessageId || null,
        message.cost || null,
        message.sentAt || null,
        message.deliveredAt || null,
        message.failedReason || null,
        message.retryCount,
        message.id
      )
      .run();
  }

  /**
   * Log delivery attempt
   */
  private async logDelivery(
    message: SmsMessage,
    provider: SmsProvider,
    status: 'sent' | 'failed' | 'delivered',
    errorMessage?: string
  ): Promise<void> {
    await this.db
      .prepare(
        `
      INSERT INTO sms_delivery_log (id, message_id, provider, status, error_message, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `
      )
      .bind(generatePrefixedId('LOG'), message.id, provider, status, errorMessage || null)
      .run();
  }

  /**
   * Get message by ID
   */
  async getMessage(id: string): Promise<SmsMessage | null> {
    const result = await this.db.prepare('SELECT * FROM sms_messages WHERE id = ?').bind(id).first();

    if (!result) return null;

    return this.mapMessage(result);
  }

  /**
   * Get message history for a phone number
   */
  async getMessageHistory(
    phone: string,
    options: { page?: number; limit?: number } = {}
  ): Promise<{ messages: SmsMessage[]; total: number }> {
    const { page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;
    const normalizedPhone = this.normalizePhone(phone);

    const [countResult, messages] = await Promise.all([
      this.db.prepare('SELECT COUNT(*) as total FROM sms_messages WHERE phone_to = ?').bind(normalizedPhone).first<{ total: number }>(),
      this.db
        .prepare('SELECT * FROM sms_messages WHERE phone_to = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
        .bind(normalizedPhone, limit, offset)
        .all(),
    ]);

    return {
      messages: (messages.results || []).map(this.mapMessage),
      total: countResult?.total || 0,
    };
  }

  /**
   * Get SMS stats
   */
  async getStats(
    period: 'day' | 'week' | 'month' = 'month'
  ): Promise<{
    total: number;
    sent: number;
    delivered: number;
    failed: number;
    totalCost: number;
    byProvider: Record<string, number>;
    byTemplate: Record<string, number>;
  }> {
    const daysBack = period === 'day' ? 1 : period === 'week' ? 7 : 30;
    const since = new Date();
    since.setDate(since.getDate() - daysBack);

    const [totals, byProvider, byTemplate] = await Promise.all([
      this.db
        .prepare(
          `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'sent' OR status = 'delivered' THEN 1 ELSE 0 END) as sent,
          SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(COALESCE(cost, 0)) as total_cost
        FROM sms_messages
        WHERE created_at >= ?
      `
        )
        .bind(since.toISOString())
        .first<{ total: number; sent: number; delivered: number; failed: number; total_cost: number }>(),

      this.db
        .prepare(
          `
        SELECT provider, COUNT(*) as count
        FROM sms_messages
        WHERE created_at >= ? AND provider IS NOT NULL
        GROUP BY provider
      `
        )
        .bind(since.toISOString())
        .all<{ provider: string; count: number }>(),

      this.db
        .prepare(
          `
        SELECT template_code, COUNT(*) as count
        FROM sms_messages
        WHERE created_at >= ? AND template_code IS NOT NULL
        GROUP BY template_code
      `
        )
        .bind(since.toISOString())
        .all<{ template_code: string; count: number }>(),
    ]);

    return {
      total: totals?.total || 0,
      sent: totals?.sent || 0,
      delivered: totals?.delivered || 0,
      failed: totals?.failed || 0,
      totalCost: totals?.total_cost || 0,
      byProvider: Object.fromEntries((byProvider.results || []).map((r) => [r.provider, r.count])),
      byTemplate: Object.fromEntries((byTemplate.results || []).map((r) => [r.template_code, r.count])),
    };
  }

  /**
   * Get available templates
   */
  getTemplates(): SmsTemplate[] {
    return Object.values(SMS_TEMPLATES);
  }

  /**
   * Map database row to SmsMessage
   */
  private mapMessage(row: Record<string, unknown>): SmsMessage {
    return {
      id: row.id as string,
      to: row.phone_to as string,
      body: row.body as string,
      sender: row.sender as string | undefined,
      templateCode: row.template_code as string | undefined,
      provider: row.provider as SmsProvider | undefined,
      status: row.status as SmsStatus,
      providerMessageId: row.provider_message_id as string | undefined,
      cost: row.cost as number | undefined,
      segments: row.segments as number | undefined,
      sentAt: row.sent_at as string | undefined,
      deliveredAt: row.delivered_at as string | undefined,
      failedReason: row.failed_reason as string | undefined,
      retryCount: row.retry_count as number,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
      createdAt: row.created_at as string,
    };
  }
}
