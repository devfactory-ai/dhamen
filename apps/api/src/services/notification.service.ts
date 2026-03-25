/**
 * Notification Service
 *
 * Handles sending notifications via multiple channels:
 * - Email (SendGrid/Resend)
 * - SMS (Twilio)
 * - In-App notifications
 * - Push notifications (FCM - future)
 */

import { ulid } from 'ulid';

export type NotificationType = 'EMAIL' | 'SMS' | 'PUSH' | 'IN_APP';

export type NotificationStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'READ';

export interface NotificationTemplate {
  id: string;
  code: string;
  type: NotificationType;
  eventType: string;
  subjectTemplate?: string;
  bodyTemplate: string;
  variables: string[];
}

export interface Notification {
  id: string;
  userId: string;
  templateId?: string;
  type: NotificationType;
  eventType: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  status: NotificationStatus;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  failedReason?: string;
  retryCount: number;
  entityType?: string;
  entityId?: string;
  createdAt: string;
}

export interface NotificationPreferences {
  userId: string;
  emailClaims: boolean;
  emailBordereaux: boolean;
  emailReconciliation: boolean;
  emailSystem: boolean;
  smsClaims: boolean;
  smsUrgent: boolean;
  pushEnabled: boolean;
  inAppEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
}

export interface SendNotificationParams {
  userId: string;
  type: NotificationType;
  eventType: string;
  title: string;
  body: string;
  templateCode?: string;
  variables?: Record<string, string>;
  metadata?: Record<string, unknown>;
  entityType?: string;
  entityId?: string;
}

export interface EmailParams {
  to: string;
  subject: string;
  body: string;
  html?: string;
}

export interface SmsParams {
  to: string;
  body: string;
}

interface NotificationEnv {
  DB: D1Database;
  CACHE: KVNamespace;
  SENDGRID_API_KEY?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM_NUMBER?: string;
  RESEND_API_KEY?: string;
}

export class NotificationService {
  private db: D1Database;
  private cache: KVNamespace;
  private sendgridKey?: string;
  private twilioSid?: string;
  private twilioToken?: string;
  private twilioFrom?: string;
  private resendKey?: string;

  constructor(env: NotificationEnv) {
    this.db = env.DB;
    this.cache = env.CACHE;
    this.sendgridKey = env.SENDGRID_API_KEY;
    this.twilioSid = env.TWILIO_ACCOUNT_SID;
    this.twilioToken = env.TWILIO_AUTH_TOKEN;
    this.twilioFrom = env.TWILIO_FROM_NUMBER;
    this.resendKey = env.RESEND_API_KEY;
  }

  /**
   * Send a notification to a user
   */
  async send(params: SendNotificationParams): Promise<Notification> {
    const { userId, type, eventType, title, body, metadata, entityType, entityId } = params;

    // Check user preferences
    const prefs = await this.getUserPreferences(userId);
    if (!this.shouldSend(type, eventType, prefs)) {
      throw new Error('Notification blocked by user preferences');
    }

    // Check quiet hours
    if (prefs.quietHoursEnabled && this.isQuietHours(prefs)) {
      // Queue for later delivery
      return this.queueNotification(params);
    }

    // Create notification record
    const notification: Notification = {
      id: ulid(),
      userId,
      type,
      eventType,
      title,
      body,
      metadata,
      status: 'PENDING',
      retryCount: 0,
      entityType,
      entityId,
      createdAt: new Date().toISOString(),
    };

    // Insert into database
    await this.db.prepare(`
      INSERT INTO notifications (id, user_id, type, event_type, title, body, metadata, status, retry_count, entity_type, entity_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      notification.id,
      notification.userId,
      notification.type,
      notification.eventType,
      notification.title,
      notification.body,
      metadata ? JSON.stringify(metadata) : null,
      notification.status,
      notification.retryCount,
      notification.entityType || null,
      notification.entityId || null,
      notification.createdAt,
    ).run();

    // Actually send the notification
    try {
      await this.deliverNotification(notification, userId);
      notification.status = 'SENT';
      notification.sentAt = new Date().toISOString();
    } catch (error) {
      notification.status = 'FAILED';
      notification.failedReason = error instanceof Error ? error.message : 'Unknown error';
      notification.retryCount = 1;
    }

    // Update status
    await this.db.prepare(`
      UPDATE notifications SET status = ?, sent_at = ?, failed_reason = ?, retry_count = ?
      WHERE id = ?
    `).bind(
      notification.status,
      notification.sentAt || null,
      notification.failedReason || null,
      notification.retryCount,
      notification.id,
    ).run();

    return notification;
  }

  /**
   * Send notification using appropriate channel
   */
  private async deliverNotification(notification: Notification, userId: string): Promise<void> {
    // Get user email/phone
    const user = await this.db.prepare(`
      SELECT email, phone FROM users WHERE id = ?
    `).bind(userId).first<{ email: string; phone?: string }>();

    if (!user) {
      throw new Error('User not found');
    }

    switch (notification.type) {
      case 'EMAIL':
        await this.sendEmail({
          to: user.email,
          subject: notification.title,
          body: notification.body,
        });
        break;

      case 'SMS':
        if (!user.phone) {
          throw new Error('User has no phone number');
        }
        await this.sendSms({
          to: user.phone,
          body: notification.body,
        });
        break;

      case 'IN_APP':
        // In-app notifications are just stored in the database
        // The frontend polls or uses websocket to fetch them
        break;

      case 'PUSH':
        // Push notifications would use FCM
        // Not implemented yet
        break;
    }

    // Log delivery attempt
    await this.logDeliveryAttempt(notification.id, 1, 'SENT', notification.type);
  }

  /**
   * Send email via SendGrid or Resend
   */
  private async sendEmail(params: EmailParams): Promise<void> {
    if (this.resendKey) {
      await this.sendEmailViaResend(params);
    } else if (this.sendgridKey) {
      await this.sendEmailViaSendGrid(params);
    } else {
      console.log('[MOCK] Email sent:', params);
    }
  }

  private async sendEmailViaResend(params: EmailParams): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Dhamen <noreply@tnc.trading>',
        to: [params.to],
        subject: params.subject,
        text: params.body,
        html: params.html,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Resend error: ${error}`);
    }
  }

  private async sendEmailViaSendGrid(params: EmailParams): Promise<void> {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.sendgridKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: params.to }] }],
        from: { email: 'noreply@dhamen.tn', name: 'Dhamen' },
        subject: params.subject,
        content: [
          { type: 'text/plain', value: params.body },
          ...(params.html ? [{ type: 'text/html', value: params.html }] : []),
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`SendGrid error: ${error}`);
    }
  }

  /**
   * Send SMS via Twilio
   */
  private async sendSms(params: SmsParams): Promise<void> {
    if (!this.twilioSid || !this.twilioToken || !this.twilioFrom) {
      console.log('[MOCK] SMS sent:', params);
      return;
    }

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.twilioSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${this.twilioSid}:${this.twilioToken}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: params.to,
          From: this.twilioFrom,
          Body: params.body,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Twilio error: ${error}`);
    }
  }

  /**
   * Send MFA code email directly (bypasses notification preferences — security emails always sent)
   */
  async sendMfaCode(to: string, code: string, userName: string): Promise<void> {
    const { renderMfaCodeEmail } = await import('../lib/email-templates');
    const html = renderMfaCodeEmail(code, userName);
    await this.sendEmail({
      to,
      subject: 'Dhamen — Code de vérification',
      body: `Votre code de vérification Dhamen : ${code}. Ce code expire dans 5 minutes.`,
      html,
    });
  }

  /**
   * Send magic link email directly (bypasses notification preferences — security emails always sent)
   */
  async sendMagicLinkEmail(to: string, loginUrl: string, userName: string): Promise<void> {
    const { renderMagicLinkEmail } = await import('../lib/email-templates');
    const html = renderMagicLinkEmail(loginUrl, userName);
    await this.sendEmail({
      to,
      subject: 'Dhamen — Connexion par lien magique',
      body: `Connectez-vous à Dhamen : ${loginUrl}. Ce lien expire dans 15 minutes.`,
      html,
    });
  }

  /**
   * Send password reset email directly (bypasses notification preferences)
   */
  async sendPasswordResetEmail(to: string, resetUrl: string, userName: string): Promise<void> {
    const { renderPasswordResetEmail } = await import('../lib/email-templates');
    const html = renderPasswordResetEmail(resetUrl, userName);
    await this.sendEmail({
      to,
      subject: 'Dhamen — Réinitialisation du mot de passe',
      body: `Réinitialisez votre mot de passe : ${resetUrl}. Ce lien expire dans 30 minutes.`,
      html,
    });
  }

  /**
   * Get user notification preferences
   */
  async getUserPreferences(userId: string): Promise<NotificationPreferences> {
    // Check cache first
    const cacheKey = `notification_prefs:${userId}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const prefs = await this.db.prepare(`
      SELECT * FROM notification_preferences WHERE user_id = ?
    `).bind(userId).first();

    const preferences: NotificationPreferences = prefs ? {
      userId,
      emailClaims: Boolean(prefs.email_claims),
      emailBordereaux: Boolean(prefs.email_bordereaux),
      emailReconciliation: Boolean(prefs.email_reconciliation),
      emailSystem: Boolean(prefs.email_system),
      smsClaims: Boolean(prefs.sms_claims),
      smsUrgent: Boolean(prefs.sms_urgent),
      pushEnabled: Boolean(prefs.push_enabled),
      inAppEnabled: Boolean(prefs.in_app_enabled),
      quietHoursEnabled: Boolean(prefs.quiet_hours_enabled),
      quietHoursStart: prefs.quiet_hours_start as string | undefined,
      quietHoursEnd: prefs.quiet_hours_end as string | undefined,
    } : {
      userId,
      emailClaims: true,
      emailBordereaux: true,
      emailReconciliation: true,
      emailSystem: true,
      smsClaims: false,
      smsUrgent: true,
      pushEnabled: true,
      inAppEnabled: true,
      quietHoursEnabled: false,
    };

    // Cache for 5 minutes
    await this.cache.put(cacheKey, JSON.stringify(preferences), { expirationTtl: 300 });

    return preferences;
  }

  /**
   * Update user notification preferences
   */
  async updatePreferences(userId: string, prefs: Partial<NotificationPreferences>): Promise<void> {
    const existing = await this.getUserPreferences(userId);

    await this.db.prepare(`
      INSERT INTO notification_preferences (
        id, user_id, email_claims, email_bordereaux, email_reconciliation, email_system,
        sms_claims, sms_urgent, push_enabled, in_app_enabled,
        quiet_hours_enabled, quiet_hours_start, quiet_hours_end, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        email_claims = excluded.email_claims,
        email_bordereaux = excluded.email_bordereaux,
        email_reconciliation = excluded.email_reconciliation,
        email_system = excluded.email_system,
        sms_claims = excluded.sms_claims,
        sms_urgent = excluded.sms_urgent,
        push_enabled = excluded.push_enabled,
        in_app_enabled = excluded.in_app_enabled,
        quiet_hours_enabled = excluded.quiet_hours_enabled,
        quiet_hours_start = excluded.quiet_hours_start,
        quiet_hours_end = excluded.quiet_hours_end,
        updated_at = datetime('now')
    `).bind(
      ulid(),
      userId,
      prefs.emailClaims ?? existing.emailClaims ? 1 : 0,
      prefs.emailBordereaux ?? existing.emailBordereaux ? 1 : 0,
      prefs.emailReconciliation ?? existing.emailReconciliation ? 1 : 0,
      prefs.emailSystem ?? existing.emailSystem ? 1 : 0,
      prefs.smsClaims ?? existing.smsClaims ? 1 : 0,
      prefs.smsUrgent ?? existing.smsUrgent ? 1 : 0,
      prefs.pushEnabled ?? existing.pushEnabled ? 1 : 0,
      prefs.inAppEnabled ?? existing.inAppEnabled ? 1 : 0,
      prefs.quietHoursEnabled ?? existing.quietHoursEnabled ? 1 : 0,
      prefs.quietHoursStart ?? existing.quietHoursStart ?? null,
      prefs.quietHoursEnd ?? existing.quietHoursEnd ?? null,
    ).run();

    // Invalidate cache
    await this.cache.delete(`notification_prefs:${userId}`);
  }

  /**
   * Get user's notifications
   */
  async getUserNotifications(
    userId: string,
    options: { page?: number; limit?: number; unreadOnly?: boolean } = {}
  ): Promise<{ notifications: Notification[]; total: number }> {
    const { page = 1, limit = 20, unreadOnly = false } = options;
    const offset = (page - 1) * limit;

    const whereClause = unreadOnly
      ? "WHERE user_id = ? AND status != 'READ'"
      : 'WHERE user_id = ?';

    const [countResult, notifications] = await Promise.all([
      this.db.prepare(`SELECT COUNT(*) as total FROM notifications ${whereClause}`)
        .bind(userId).first<{ total: number }>(),
      this.db.prepare(`
        SELECT * FROM notifications
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).bind(userId, limit, offset).all(),
    ]);

    return {
      notifications: (notifications.results || []).map(this.mapNotification),
      total: countResult?.total || 0,
    };
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    await this.db.prepare(`
      UPDATE notifications SET status = 'READ', read_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).bind(notificationId, userId).run();
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<void> {
    await this.db.prepare(`
      UPDATE notifications SET status = 'READ', read_at = datetime('now')
      WHERE user_id = ? AND status != 'READ'
    `).bind(userId).run();
  }

  /**
   * Get unread count for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    const result = await this.db.prepare(`
      SELECT COUNT(*) as count FROM notifications
      WHERE user_id = ? AND status != 'READ'
    `).bind(userId).first<{ count: number }>();

    return result?.count || 0;
  }

  /**
   * Check if notification should be sent based on preferences
   */
  private shouldSend(type: NotificationType, eventType: string, prefs: NotificationPreferences): boolean {
    if (type === 'EMAIL') {
      if (eventType.includes('CLAIM')) return prefs.emailClaims;
      if (eventType.includes('BORDEREAU')) return prefs.emailBordereaux;
      if (eventType.includes('RECONCILIATION')) return prefs.emailReconciliation;
      return prefs.emailSystem;
    }

    if (type === 'SMS') {
      if (eventType.includes('URGENT') || eventType.includes('FRAUD')) return prefs.smsUrgent;
      return prefs.smsClaims;
    }

    if (type === 'PUSH') return prefs.pushEnabled;
    if (type === 'IN_APP') return prefs.inAppEnabled;

    return true;
  }

  /**
   * Check if current time is within quiet hours
   */
  private isQuietHours(prefs: NotificationPreferences): boolean {
    if (!prefs.quietHoursStart || !prefs.quietHoursEnd) return false;

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const start = prefs.quietHoursStart;
    const end = prefs.quietHoursEnd;

    // Handle case where quiet hours span midnight
    if (start > end) {
      return currentTime >= start || currentTime <= end;
    }

    return currentTime >= start && currentTime <= end;
  }

  /**
   * Queue notification for later delivery
   */
  private async queueNotification(params: SendNotificationParams): Promise<Notification> {
    const notification: Notification = {
      id: ulid(),
      userId: params.userId,
      type: params.type,
      eventType: params.eventType,
      title: params.title,
      body: params.body,
      metadata: params.metadata,
      status: 'PENDING',
      retryCount: 0,
      entityType: params.entityType,
      entityId: params.entityId,
      createdAt: new Date().toISOString(),
    };

    // Calculate next retry time (after quiet hours end)
    const prefs = await this.getUserPreferences(params.userId);
    const nextRetryAt = prefs.quietHoursEnd || '08:00';

    await this.db.prepare(`
      INSERT INTO notifications (id, user_id, type, event_type, title, body, metadata, status, retry_count, next_retry_at, entity_type, entity_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      notification.id,
      notification.userId,
      notification.type,
      notification.eventType,
      notification.title,
      notification.body,
      params.metadata ? JSON.stringify(params.metadata) : null,
      notification.status,
      0,
      nextRetryAt,
      params.entityType || null,
      params.entityId || null,
      notification.createdAt,
    ).run();

    return notification;
  }

  /**
   * Log delivery attempt
   */
  private async logDeliveryAttempt(
    notificationId: string,
    attemptNumber: number,
    status: 'SENDING' | 'SENT' | 'DELIVERED' | 'FAILED',
    provider: string,
    providerMessageId?: string,
    responseCode?: string,
    responseBody?: string,
  ): Promise<void> {
    await this.db.prepare(`
      INSERT INTO notification_delivery_log (id, notification_id, attempt_number, status, provider, provider_message_id, response_code, response_body, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      ulid(),
      notificationId,
      attemptNumber,
      status,
      provider,
      providerMessageId || null,
      responseCode || null,
      responseBody || null,
    ).run();
  }

  /**
   * Map database record to Notification type
   */
  private mapNotification(row: Record<string, unknown>): Notification {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      templateId: row.template_id as string | undefined,
      type: row.type as NotificationType,
      eventType: row.event_type as string,
      title: row.title as string,
      body: row.body as string,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
      status: row.status as NotificationStatus,
      sentAt: row.sent_at as string | undefined,
      deliveredAt: row.delivered_at as string | undefined,
      readAt: row.read_at as string | undefined,
      failedReason: row.failed_reason as string | undefined,
      retryCount: row.retry_count as number,
      entityType: row.entity_type as string | undefined,
      entityId: row.entity_id as string | undefined,
      createdAt: row.created_at as string,
    };
  }

  /**
   * Helper to render template with variables
   */
  renderTemplate(template: string, variables: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
  }

  /**
   * Get a template by code
   */
  async getTemplate(code: string): Promise<NotificationTemplate | null> {
    const template = await this.db.prepare(`
      SELECT * FROM notification_templates WHERE code = ? AND is_active = 1
    `).bind(code).first();

    if (!template) return null;

    return {
      id: template.id as string,
      code: template.code as string,
      type: template.type as NotificationType,
      eventType: template.event_type as string,
      subjectTemplate: template.subject_template as string | undefined,
      bodyTemplate: template.body_template as string,
      variables: JSON.parse(template.variables as string || '[]'),
    };
  }

  /**
   * Send notification using a template
   */
  async sendFromTemplate(
    templateCode: string,
    userId: string,
    variables: Record<string, string>,
    options: { entityType?: string; entityId?: string } = {}
  ): Promise<Notification> {
    const template = await this.getTemplate(templateCode);
    if (!template) {
      throw new Error(`Template not found: ${templateCode}`);
    }

    const title = template.subjectTemplate
      ? this.renderTemplate(template.subjectTemplate, variables)
      : template.eventType;

    const body = this.renderTemplate(template.bodyTemplate, variables);

    return this.send({
      userId,
      type: template.type,
      eventType: template.eventType,
      title,
      body,
      templateCode,
      variables,
      metadata: { templateCode, variables },
      entityType: options.entityType,
      entityId: options.entityId,
    });
  }
}
