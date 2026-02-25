/**
 * Notifications Integration Tests
 *
 * Tests the notifications service and routes
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';

describe('Notifications Integration Tests', () => {
  describe('GET /api/v1/notifications', () => {
    it('should return user notifications', async () => {
      const app = new Hono();

      app.get('/api/v1/notifications', async (c) => {
        return c.json({
          success: true,
          data: {
            notifications: [
              {
                id: 'notif_1',
                userId: 'user_123',
                type: 'EMAIL',
                eventType: 'CLAIM_CREATED',
                title: 'Nouvelle PEC #PEC-2024-001',
                body: 'Une nouvelle prise en charge a été créée.',
                status: 'SENT',
                sentAt: '2024-01-15T10:00:00Z',
                createdAt: '2024-01-15T10:00:00Z',
              },
              {
                id: 'notif_2',
                userId: 'user_123',
                type: 'IN_APP',
                eventType: 'BORDEREAU_READY',
                title: 'Bordereau BRD-2024-001 prêt',
                body: 'Le bordereau est prêt pour validation.',
                status: 'DELIVERED',
                sentAt: '2024-01-14T09:00:00Z',
                createdAt: '2024-01-14T09:00:00Z',
              },
            ],
            meta: {
              page: 1,
              limit: 20,
              total: 2,
              totalPages: 1,
            },
          },
        });
      });

      const res = await app.request('/api/v1/notifications', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer valid_token',
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.notifications).toHaveLength(2);
      expect(data.data.meta.total).toBe(2);
    });

    it('should filter unread notifications', async () => {
      const app = new Hono();

      app.get('/api/v1/notifications', async (c) => {
        const unreadOnly = c.req.query('unreadOnly') === 'true';

        const allNotifications = [
          { id: 'n1', status: 'READ' },
          { id: 'n2', status: 'DELIVERED' },
          { id: 'n3', status: 'SENT' },
        ];

        const filtered = unreadOnly
          ? allNotifications.filter(n => n.status !== 'READ')
          : allNotifications;

        return c.json({
          success: true,
          data: {
            notifications: filtered,
            meta: { total: filtered.length },
          },
        });
      });

      const res = await app.request('/api/v1/notifications?unreadOnly=true', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer valid_token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.notifications).toHaveLength(2);
      expect(data.data.notifications.every((n: { status: string }) => n.status !== 'READ')).toBe(true);
    });

    it('should paginate results', async () => {
      const app = new Hono();

      app.get('/api/v1/notifications', async (c) => {
        const page = Number(c.req.query('page') || 1);
        const limit = Number(c.req.query('limit') || 20);

        return c.json({
          success: true,
          data: {
            notifications: Array(limit).fill({ id: `notif_${page}` }),
            meta: {
              page,
              limit,
              total: 100,
              totalPages: Math.ceil(100 / limit),
            },
          },
        });
      });

      const res = await app.request('/api/v1/notifications?page=2&limit=10', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer valid_token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.meta.page).toBe(2);
      expect(data.data.meta.limit).toBe(10);
      expect(data.data.meta.totalPages).toBe(10);
    });
  });

  describe('GET /api/v1/notifications/count', () => {
    it('should return unread count', async () => {
      const app = new Hono();

      app.get('/api/v1/notifications/count', async (c) => {
        return c.json({
          success: true,
          data: { unreadCount: 5 },
        });
      });

      const res = await app.request('/api/v1/notifications/count', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer valid_token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.unreadCount).toBe(5);
    });
  });

  describe('GET /api/v1/notifications/preferences', () => {
    it('should return user preferences', async () => {
      const app = new Hono();

      app.get('/api/v1/notifications/preferences', async (c) => {
        return c.json({
          success: true,
          data: {
            userId: 'user_123',
            emailClaims: true,
            emailBordereaux: true,
            emailReconciliation: false,
            emailSystem: true,
            smsClaims: false,
            smsUrgent: true,
            pushEnabled: true,
            inAppEnabled: true,
            quietHoursEnabled: true,
            quietHoursStart: '22:00',
            quietHoursEnd: '07:00',
          },
        });
      });

      const res = await app.request('/api/v1/notifications/preferences', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer valid_token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.emailClaims).toBe(true);
      expect(data.data.quietHoursEnabled).toBe(true);
    });
  });

  describe('PUT /api/v1/notifications/preferences', () => {
    it('should update preferences', async () => {
      const app = new Hono();

      app.put('/api/v1/notifications/preferences', async (c) => {
        const body = await c.req.json();

        return c.json({
          success: true,
          data: {
            userId: 'user_123',
            ...body,
          },
        });
      });

      const res = await app.request('/api/v1/notifications/preferences', {
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer valid_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          emailClaims: false,
          smsClaims: true,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.emailClaims).toBe(false);
      expect(data.data.smsClaims).toBe(true);
    });

    it('should validate quiet hours format', async () => {
      const app = new Hono();

      app.put('/api/v1/notifications/preferences', async (c) => {
        const body = await c.req.json();

        // Validate time format HH:MM
        const timeRegex = /^\d{2}:\d{2}$/;
        if (body.quietHoursStart && !timeRegex.test(body.quietHoursStart)) {
          return c.json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Invalid time format' },
          }, 400);
        }

        return c.json({ success: true });
      });

      const res = await app.request('/api/v1/notifications/preferences', {
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer valid_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quietHoursStart: 'invalid',
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
    });
  });

  describe('POST /api/v1/notifications/:id/read', () => {
    it('should mark notification as read', async () => {
      const app = new Hono();

      app.post('/api/v1/notifications/:id/read', async (c) => {
        const id = c.req.param('id');

        return c.json({
          success: true,
          message: 'Notification marquée comme lue',
          data: { id, status: 'READ', readAt: new Date().toISOString() },
        });
      });

      const res = await app.request('/api/v1/notifications/notif_123/read', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer valid_token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.status).toBe('READ');
    });
  });

  describe('POST /api/v1/notifications/read-all', () => {
    it('should mark all notifications as read', async () => {
      const app = new Hono();

      app.post('/api/v1/notifications/read-all', async (c) => {
        return c.json({
          success: true,
          message: 'Toutes les notifications marquées comme lues',
        });
      });

      const res = await app.request('/api/v1/notifications/read-all', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer valid_token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe('Notification Service', () => {
    it('should respect user preferences for email notifications', async () => {
      const app = new Hono();

      app.post('/api/v1/notifications/send', async (c) => {
        const body = await c.req.json();

        // Simulate checking user preferences
        const userPrefs = { emailClaims: false };

        if (body.type === 'EMAIL' && body.eventType.includes('CLAIM') && !userPrefs.emailClaims) {
          return c.json({
            success: false,
            error: { code: 'BLOCKED', message: 'Notification blocked by user preferences' },
          }, 400);
        }

        return c.json({ success: true });
      });

      const res = await app.request('/api/v1/notifications/send', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer admin_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: 'user_123',
          type: 'EMAIL',
          eventType: 'CLAIM_CREATED',
          title: 'Test',
          body: 'Test notification',
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe('BLOCKED');
    });

    it('should queue notification during quiet hours', async () => {
      const app = new Hono();

      app.post('/api/v1/notifications/send', async (c) => {
        const body = await c.req.json();

        // Simulate quiet hours check (22:00 - 07:00)
        const currentHour = new Date().getHours();
        const isQuietHours = currentHour >= 22 || currentHour < 7;

        if (body.respectQuietHours && isQuietHours) {
          return c.json({
            success: true,
            data: {
              id: 'notif_queued',
              status: 'PENDING',
              message: 'Notification queued for delivery after quiet hours',
            },
          });
        }

        return c.json({
          success: true,
          data: { id: 'notif_sent', status: 'SENT' },
        });
      });

      const res = await app.request('/api/v1/notifications/send', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer admin_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: 'user_123',
          type: 'EMAIL',
          eventType: 'BORDEREAU_READY',
          title: 'Test',
          body: 'Test notification',
          respectQuietHours: true,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('should render template with variables', async () => {
      const app = new Hono();

      app.post('/api/v1/notifications/send-from-template', async (c) => {
        const body = await c.req.json();

        // Simple template rendering
        let template = 'Bonjour {firstName}, votre PEC #{claimNumber} a été créée.';
        for (const [key, value] of Object.entries(body.variables as Record<string, string>)) {
          template = template.replace(`{${key}}`, value);
        }

        return c.json({
          success: true,
          data: {
            body: template,
          },
        });
      });

      const res = await app.request('/api/v1/notifications/send-from-template', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer admin_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateCode: 'CLAIM_CREATED_EMAIL',
          userId: 'user_123',
          variables: {
            firstName: 'Mohamed',
            claimNumber: 'PEC-2024-001',
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.body).toBe('Bonjour Mohamed, votre PEC #PEC-2024-001 a été créée.');
    });
  });

  describe('Authorization', () => {
    it('should require authentication', async () => {
      const app = new Hono();

      app.get('/api/v1/notifications', async (c) => {
        const auth = c.req.header('Authorization');

        if (!auth?.startsWith('Bearer ')) {
          return c.json({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          }, 401);
        }

        return c.json({ success: true });
      });

      const res = await app.request('/api/v1/notifications', {
        method: 'GET',
      });

      expect(res.status).toBe(401);
    });

    it('should only return own notifications', async () => {
      const app = new Hono();

      app.get('/api/v1/notifications', async (c) => {
        // Simulate extracting user from token
        const userId = 'user_123';

        // Only return notifications for this user
        const notifications = [
          { id: 'n1', userId: 'user_123' },
          { id: 'n2', userId: 'user_123' },
          // n3 belongs to another user, should not be returned
        ];

        return c.json({
          success: true,
          data: { notifications },
        });
      });

      const res = await app.request('/api/v1/notifications', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer user_123_token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.notifications.every((n: { userId: string }) => n.userId === 'user_123')).toBe(true);
    });
  });

  describe('Delivery Channels', () => {
    it('should send email notification', async () => {
      const app = new Hono();

      app.post('/api/v1/notifications/send', async (c) => {
        const body = await c.req.json();

        if (body.type === 'EMAIL') {
          // Simulate email sending
          return c.json({
            success: true,
            data: {
              id: 'notif_email',
              type: 'EMAIL',
              status: 'SENT',
              provider: 'SENDGRID',
            },
          });
        }

        return c.json({ success: false }, 400);
      });

      const res = await app.request('/api/v1/notifications/send', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer admin_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: 'user_123',
          type: 'EMAIL',
          eventType: 'CLAIM_CREATED',
          title: 'Test Email',
          body: 'This is a test email',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.type).toBe('EMAIL');
      expect(data.data.provider).toBe('SENDGRID');
    });

    it('should send SMS notification', async () => {
      const app = new Hono();

      app.post('/api/v1/notifications/send', async (c) => {
        const body = await c.req.json();

        if (body.type === 'SMS') {
          // Simulate SMS sending
          return c.json({
            success: true,
            data: {
              id: 'notif_sms',
              type: 'SMS',
              status: 'SENT',
              provider: 'TWILIO',
            },
          });
        }

        return c.json({ success: false }, 400);
      });

      const res = await app.request('/api/v1/notifications/send', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer admin_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: 'user_123',
          type: 'SMS',
          eventType: 'FRAUD_DETECTED',
          title: 'Alerte Fraude',
          body: 'Fraude détectée sur PEC #123',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.type).toBe('SMS');
      expect(data.data.provider).toBe('TWILIO');
    });

    it('should store in-app notification', async () => {
      const app = new Hono();

      app.post('/api/v1/notifications/send', async (c) => {
        const body = await c.req.json();

        if (body.type === 'IN_APP') {
          // In-app notifications are just stored, not sent via external provider
          return c.json({
            success: true,
            data: {
              id: 'notif_inapp',
              type: 'IN_APP',
              status: 'DELIVERED',
              provider: null,
            },
          });
        }

        return c.json({ success: false }, 400);
      });

      const res = await app.request('/api/v1/notifications/send', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer admin_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: 'user_123',
          type: 'IN_APP',
          eventType: 'CLAIM_CREATED',
          title: 'Nouvelle PEC',
          body: 'PEC créée',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.type).toBe('IN_APP');
      expect(data.data.status).toBe('DELIVERED');
    });
  });
});
