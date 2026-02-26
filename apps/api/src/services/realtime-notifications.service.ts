/**
 * Real-time Notifications Service
 *
 * Service for sending real-time notifications via WebSocket
 * using Durable Objects.
 */

import type { Context } from 'hono';
import type { Bindings, Variables } from '../types';

export interface RealtimeNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  data?: Record<string, unknown>;
}

/**
 * Real-time Notifications Service
 */
export class RealtimeNotificationsService {
  private c: Context<{ Bindings: Bindings; Variables: Variables }>;

  constructor(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    this.c = c;
  }

  /**
   * Send notification to a specific user via WebSocket
   */
  async sendToUser(userId: string, notification: RealtimeNotification): Promise<boolean> {
    try {
      // Get the Durable Object for this user's notification hub
      const hubId = this.c.env.NOTIFICATION_HUB?.idFromName('global');
      if (!hubId) {
        console.warn('NOTIFICATION_HUB binding not available');
        return false;
      }

      const hub = this.c.env.NOTIFICATION_HUB.get(hubId);

      const response = await hub.fetch('http://internal/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          notification,
        }),
      });

      const result = await response.json() as { success: boolean; delivered: number };
      return result.success && result.delivered > 0;
    } catch (error) {
      console.error('Failed to send realtime notification:', error);
      return false;
    }
  }

  /**
   * Send notification to multiple users
   */
  async sendToUsers(userIds: string[], notification: RealtimeNotification): Promise<number> {
    let delivered = 0;

    for (const userId of userIds) {
      const success = await this.sendToUser(userId, notification);
      if (success) delivered++;
    }

    return delivered;
  }

  /**
   * Broadcast notification to all connected users
   */
  async broadcast(notification: RealtimeNotification): Promise<number> {
    try {
      const hubId = this.c.env.NOTIFICATION_HUB?.idFromName('global');
      if (!hubId) {
        console.warn('NOTIFICATION_HUB binding not available');
        return 0;
      }

      const hub = this.c.env.NOTIFICATION_HUB.get(hubId);

      const response = await hub.fetch('http://internal/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification }),
      });

      const result = await response.json() as { success: boolean; delivered: number };
      return result.delivered;
    } catch (error) {
      console.error('Failed to broadcast notification:', error);
      return 0;
    }
  }

  /**
   * Send notification to users with specific role
   */
  async sendToRole(role: string, notification: RealtimeNotification): Promise<number> {
    // Get users with this role
    const users = await this.c.env.DB.prepare(`
      SELECT id FROM users WHERE role = ? AND is_active = 1
    `)
      .bind(role)
      .all<{ id: string }>();

    const userIds = (users.results || []).map((u) => u.id);
    return this.sendToUsers(userIds, notification);
  }

  /**
   * Create and persist notification, then send in real-time
   */
  async createAndSend(
    userId: string,
    data: {
      type: string;
      title: string;
      message: string;
      data?: Record<string, unknown>;
    }
  ): Promise<RealtimeNotification> {
    const now = new Date().toISOString();
    const notificationId = crypto.randomUUID();

    const notification: RealtimeNotification = {
      id: notificationId,
      type: data.type,
      title: data.title,
      message: data.message,
      createdAt: now,
      read: false,
      data: data.data,
    };

    // Persist to database
    await this.c.env.DB.prepare(`
      INSERT INTO notifications (id, user_id, type, title, message, data_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        notificationId,
        userId,
        data.type,
        data.title,
        data.message,
        JSON.stringify(data.data || {}),
        now
      )
      .run();

    // Send in real-time
    await this.sendToUser(userId, notification);

    return notification;
  }

  /**
   * Get connection stats
   */
  async getStats(): Promise<{
    totalConnections: number;
    uniqueUsers: number;
    users: Record<string, number>;
  }> {
    try {
      const hubId = this.c.env.NOTIFICATION_HUB?.idFromName('global');
      if (!hubId) {
        return { totalConnections: 0, uniqueUsers: 0, users: {} };
      }

      const hub = this.c.env.NOTIFICATION_HUB.get(hubId);
      const response = await hub.fetch('http://internal/stats');
      return response.json();
    } catch {
      return { totalConnections: 0, uniqueUsers: 0, users: {} };
    }
  }
}

/**
 * Create Real-time Notifications Service instance
 */
export function createRealtimeNotificationsService(
  c: Context<{ Bindings: Bindings; Variables: Variables }>
): RealtimeNotificationsService {
  return new RealtimeNotificationsService(c);
}

// ==========================================================================
// Notification Templates
// ==========================================================================

export const NotificationTemplates = {
  demandeCreee: (numeroDemande: string) => ({
    type: 'demande_created',
    title: 'Nouvelle demande',
    message: `Demande ${numeroDemande} creee avec succes`,
  }),

  demandeApprouvee: (numeroDemande: string, montant: number) => ({
    type: 'demande_approved',
    title: 'Demande approuvee',
    message: `Votre demande ${numeroDemande} a ete approuvee pour ${(montant / 1000).toFixed(3)} TND`,
  }),

  demandeRejetee: (numeroDemande: string, motif: string) => ({
    type: 'demande_rejected',
    title: 'Demande rejetee',
    message: `Votre demande ${numeroDemande} a ete rejetee: ${motif}`,
  }),

  infoRequise: (numeroDemande: string, dueDate: string) => ({
    type: 'info_request',
    title: 'Information requise',
    message: `Information supplementaire demandee pour ${numeroDemande}. Delai: ${dueDate}`,
  }),

  escalation: (priority: string, demandeId: string) => ({
    type: 'escalation',
    title: priority === 'urgent' ? 'ESCALADE URGENTE' : 'Escalade',
    message: `Une demande necessite votre attention`,
    data: { demandeId },
  }),

  validationRequise: (numeroDemande: string, niveau: number) => ({
    type: 'validation_required',
    title: 'Validation requise',
    message: `Validation niveau ${niveau} requise pour ${numeroDemande}`,
  }),

  paiementEffectue: (numeroBordereau: string, montant: number) => ({
    type: 'payment_completed',
    title: 'Paiement effectue',
    message: `Bordereau ${numeroBordereau} paye: ${(montant / 1000).toFixed(3)} TND`,
  }),
};
