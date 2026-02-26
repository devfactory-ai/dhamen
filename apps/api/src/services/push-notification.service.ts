/**
 * Push Notification Service
 *
 * Handles sending push notifications to mobile devices via Expo.
 * Uses Expo Push Notification service for iOS and Android.
 */

import { ulid } from 'ulid';

export interface PushToken {
  id: string;
  userId: string;
  token: string;
  platform: 'ios' | 'android' | 'web';
  deviceName?: string;
  deviceInfo?: Record<string, unknown>;
  isActive: boolean;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
  ttl?: number;
}

export interface PushResult {
  success: boolean;
  ticketId?: string;
  error?: string;
}

interface PushEnv {
  DB: D1Database;
  CACHE: KVNamespace;
  EXPO_ACCESS_TOKEN?: string;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export class PushNotificationService {
  private db: D1Database;
  private cache: KVNamespace;
  private expoToken?: string;

  constructor(env: PushEnv) {
    this.db = env.DB;
    this.cache = env.CACHE;
    this.expoToken = env.EXPO_ACCESS_TOKEN;
  }

  /**
   * Register a device token for push notifications
   */
  async registerToken(
    userId: string,
    token: string,
    platform: 'ios' | 'android' | 'web',
    deviceName?: string,
    deviceInfo?: Record<string, unknown>
  ): Promise<PushToken> {
    const id = ulid();
    const now = new Date().toISOString();

    // Check if token already exists
    const existing = await this.db.prepare(`
      SELECT id, user_id FROM sante_push_tokens WHERE token = ?
    `).bind(token).first<{ id: string; user_id: string }>();

    if (existing) {
      // Update existing token
      await this.db.prepare(`
        UPDATE sante_push_tokens
        SET user_id = ?, device_name = ?, device_info = ?, is_active = 1, last_used_at = ?, updated_at = ?
        WHERE token = ?
      `).bind(
        userId,
        deviceName || null,
        deviceInfo ? JSON.stringify(deviceInfo) : null,
        now,
        now,
        token
      ).run();

      return {
        id: existing.id,
        userId,
        token,
        platform,
        deviceName,
        deviceInfo,
        isActive: true,
        lastUsedAt: now,
        createdAt: now,
        updatedAt: now,
      };
    }

    // Insert new token
    await this.db.prepare(`
      INSERT INTO sante_push_tokens (id, user_id, token, platform, device_name, device_info, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).bind(
      id,
      userId,
      token,
      platform,
      deviceName || null,
      deviceInfo ? JSON.stringify(deviceInfo) : null,
      now,
      now
    ).run();

    // Invalidate cache
    await this.cache.delete(`push_tokens:${userId}`);

    return {
      id,
      userId,
      token,
      platform,
      deviceName,
      deviceInfo,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Unregister a device token
   */
  async unregisterToken(token: string, userId: string): Promise<boolean> {
    const result = await this.db.prepare(`
      UPDATE sante_push_tokens SET is_active = 0, updated_at = datetime('now')
      WHERE token = ? AND user_id = ?
    `).bind(token, userId).run();

    // Invalidate cache
    await this.cache.delete(`push_tokens:${userId}`);

    return (result.meta?.changes || 0) > 0;
  }

  /**
   * Unregister all tokens for a user
   */
  async unregisterAllTokens(userId: string): Promise<void> {
    await this.db.prepare(`
      UPDATE sante_push_tokens SET is_active = 0, updated_at = datetime('now')
      WHERE user_id = ?
    `).bind(userId).run();

    await this.cache.delete(`push_tokens:${userId}`);
  }

  /**
   * Get all active tokens for a user
   */
  async getUserTokens(userId: string): Promise<PushToken[]> {
    // Check cache
    const cacheKey = `push_tokens:${userId}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const result = await this.db.prepare(`
      SELECT * FROM sante_push_tokens WHERE user_id = ? AND is_active = 1
    `).bind(userId).all();

    const tokens = (result.results || []).map(this.mapToken);

    // Cache for 5 minutes
    await this.cache.put(cacheKey, JSON.stringify(tokens), { expirationTtl: 300 });

    return tokens;
  }

  /**
   * Send push notification to a user
   */
  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>
  ): Promise<PushResult[]> {
    const tokens = await this.getUserTokens(userId);

    if (tokens.length === 0) {
      return [{ success: false, error: 'No registered devices' }];
    }

    const messages: PushMessage[] = tokens.map((t) => ({
      to: t.token,
      title,
      body,
      data,
      sound: 'default',
      priority: 'high',
    }));

    return this.sendMessages(messages);
  }

  /**
   * Send push notifications in batch
   */
  async sendMessages(messages: PushMessage[]): Promise<PushResult[]> {
    if (messages.length === 0) {
      return [];
    }

    // In development/test, mock the push
    if (!this.expoToken) {
      console.log('[MOCK] Push notifications sent:', messages.length);
      return messages.map(() => ({ success: true, ticketId: 'mock-ticket' }));
    }

    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.expoToken}`,
        },
        body: JSON.stringify(messages),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Expo push error:', error);
        return messages.map(() => ({ success: false, error }));
      }

      const result = await response.json() as { data: Array<{ status: string; id?: string; message?: string }> };

      return result.data.map((ticket) => ({
        success: ticket.status === 'ok',
        ticketId: ticket.id,
        error: ticket.status === 'error' ? ticket.message : undefined,
      }));
    } catch (error) {
      console.error('Failed to send push notifications:', error);
      return messages.map(() => ({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }

  /**
   * Send push notification for SoinFlow events
   */
  async sendSanteNotification(
    userId: string,
    eventType: string,
    data: Record<string, string>
  ): Promise<PushResult[]> {
    const templates: Record<string, { title: string; body: string }> = {
      SANTE_DEMANDE_SOUMISE: {
        title: 'Demande soumise',
        body: `Votre demande ${data.numeroDemande} a ete soumise avec succes.`,
      },
      SANTE_DEMANDE_APPROUVEE: {
        title: 'Demande approuvee',
        body: `Bonne nouvelle ! Votre demande ${data.numeroDemande} a ete approuvee. Montant rembourse: ${data.montantRembourse} TND.`,
      },
      SANTE_DEMANDE_REJETEE: {
        title: 'Demande rejetee',
        body: `Votre demande ${data.numeroDemande} a ete rejetee. Motif: ${data.motifRejet}.`,
      },
      SANTE_INFO_REQUISE: {
        title: 'Information requise',
        body: `Des informations supplementaires sont requises pour votre demande ${data.numeroDemande}.`,
      },
      SANTE_PAIEMENT_EFFECTUE: {
        title: 'Paiement effectue',
        body: `Le paiement de ${data.montant} TND pour votre demande ${data.numeroDemande} a ete effectue.`,
      },
      SANTE_BORDEREAU_GENERE: {
        title: 'Bordereau genere',
        body: `Un nouveau bordereau ${data.numeroBordereau} a ete genere avec ${data.nombreDemandes} demande(s).`,
      },
    };

    const template = templates[eventType];
    if (!template) {
      console.warn(`Unknown event type: ${eventType}`);
      return [{ success: false, error: 'Unknown event type' }];
    }

    return this.sendToUser(userId, template.title, template.body, {
      eventType,
      ...data,
    });
  }

  /**
   * Map database record to PushToken
   */
  private mapToken(row: Record<string, unknown>): PushToken {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      token: row.token as string,
      platform: row.platform as 'ios' | 'android' | 'web',
      deviceName: row.device_name as string | undefined,
      deviceInfo: row.device_info ? JSON.parse(row.device_info as string) : undefined,
      isActive: Boolean(row.is_active),
      lastUsedAt: row.last_used_at as string | undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
