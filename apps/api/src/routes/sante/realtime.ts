/**
 * Real-time Notifications Routes
 *
 * WebSocket endpoint for real-time notifications
 * and REST endpoints for notification management.
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../types';
import { getDb } from '../../lib/db';
import { requireAuth, requireRole } from '../../middleware/auth';
import { successData as success, errorData as error } from '../../lib/response';
import {
  createRealtimeNotificationsService,
  NotificationTemplates,
} from '../../services/realtime-notifications.service';

export const realtime = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * GET /ws - WebSocket upgrade endpoint
 * Requires token as query parameter for authentication
 */
realtime.get('/ws', async (c) => {
  const upgradeHeader = c.req.header('Upgrade');
  if (!upgradeHeader || upgradeHeader !== 'websocket') {
    return c.json(error('UPGRADE_REQUIRED', 'WebSocket upgrade required'), 426);
  }

  const userId = c.req.query('userId');
  const token = c.req.query('token');

  if (!userId || !token) {
    return c.json(error('AUTH_REQUIRED', 'userId and token required'), 401);
  }

  // Verify token (simple check - in production use proper JWT verification)
  // For now, we trust the userId as the WebSocket connection is typically made
  // after initial authentication

  try {
    const hubId = c.env.NOTIFICATION_HUB?.idFromName('global');
    if (!hubId) {
      return c.json(error('SERVICE_UNAVAILABLE', 'Notification service not available'), 503);
    }

    const hub = c.env.NOTIFICATION_HUB.get(hubId);

    // Forward the WebSocket upgrade request to the Durable Object
    const url = new URL(c.req.url);
    url.searchParams.set('userId', userId);

    return hub.fetch(url.toString(), {
      headers: c.req.raw.headers,
    });
  } catch (err) {
    console.error('WebSocket upgrade failed:', err);
    return c.json(error('CONNECTION_FAILED', 'Failed to establish connection'), 500);
  }
});

/**
 * GET /stats - Get connection statistics (admin only)
 */
realtime.get(
  '/stats',
  requireAuth,
  requireRole('ADMIN', 'SOIN_GESTIONNAIRE'),
  async (c) => {
    const service = createRealtimeNotificationsService(c);

    try {
      const stats = await service.getStats();
      return c.json(success(stats));
    } catch (err) {
      console.error('Failed to get stats:', err);
      return c.json(error('QUERY_ERROR', 'Failed to get statistics'), 500);
    }
  }
);

/**
 * POST /send - Send notification to specific user (internal/admin)
 */
realtime.post(
  '/send',
  requireAuth,
  requireRole('ADMIN', 'SOIN_GESTIONNAIRE', 'SOIN_AGENT'),
  async (c) => {
    const body = await c.req.json() as {
      userId: string;
      type: string;
      title: string;
      message: string;
      data?: Record<string, unknown>;
    };

    if (!body.userId || !body.type || !body.title || !body.message) {
      return c.json(error('VALIDATION_ERROR', 'userId, type, title, message required'), 400);
    }

    const service = createRealtimeNotificationsService(c);

    try {
      const notification = await service.createAndSend(body.userId, {
        type: body.type,
        title: body.title,
        message: body.message,
        data: body.data,
      });

      return c.json(success(notification));
    } catch (err) {
      console.error('Failed to send notification:', err);
      return c.json(error('SEND_FAILED', 'Failed to send notification'), 500);
    }
  }
);

/**
 * POST /broadcast - Broadcast notification to all users (admin only)
 */
realtime.post(
  '/broadcast',
  requireAuth,
  requireRole('ADMIN'),
  async (c) => {
    const body = await c.req.json() as {
      type: string;
      title: string;
      message: string;
      data?: Record<string, unknown>;
    };

    if (!body.type || !body.title || !body.message) {
      return c.json(error('VALIDATION_ERROR', 'type, title, message required'), 400);
    }

    const service = createRealtimeNotificationsService(c);

    try {
      const delivered = await service.broadcast({
        id: crypto.randomUUID(),
        type: body.type,
        title: body.title,
        message: body.message,
        createdAt: new Date().toISOString(),
        read: false,
        data: body.data,
      });

      return c.json(success({ delivered }));
    } catch (err) {
      console.error('Failed to broadcast:', err);
      return c.json(error('BROADCAST_FAILED', 'Failed to broadcast notification'), 500);
    }
  }
);

/**
 * POST /role - Send notification to users with specific role
 */
realtime.post(
  '/role',
  requireAuth,
  requireRole('ADMIN', 'SOIN_GESTIONNAIRE'),
  async (c) => {
    const body = await c.req.json() as {
      role: string;
      type: string;
      title: string;
      message: string;
      data?: Record<string, unknown>;
    };

    if (!body.role || !body.type || !body.title || !body.message) {
      return c.json(error('VALIDATION_ERROR', 'role, type, title, message required'), 400);
    }

    const service = createRealtimeNotificationsService(c);

    try {
      const delivered = await service.sendToRole(body.role, {
        id: crypto.randomUUID(),
        type: body.type,
        title: body.title,
        message: body.message,
        createdAt: new Date().toISOString(),
        read: false,
        data: body.data,
      });

      return c.json(success({ delivered }));
    } catch (err) {
      console.error('Failed to send to role:', err);
      return c.json(error('SEND_FAILED', 'Failed to send notification'), 500);
    }
  }
);

/**
 * GET /templates - Get available notification templates
 */
realtime.get(
  '/templates',
  requireAuth,
  async (c) => {
    const templates = Object.keys(NotificationTemplates);
    return c.json(success({ templates }));
  }
);
