/**
 * SoinFlow Notifications Routes
 *
 * API endpoints for managing push notification tokens and SoinFlow notifications
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Bindings, Variables } from '../../types';
import { PushNotificationService } from '../../services/push-notification.service';
import { NotificationService } from '../../services/notification.service';
import { authMiddleware } from '../../middleware/auth';
import { success, badRequest } from '../../lib/response';

const notifications = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All routes require authentication
notifications.use('*', authMiddleware());

// Subscribe schema
const subscribeSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  platform: z.enum(['ios', 'android', 'web']),
  deviceName: z.string().optional(),
  deviceInfo: z.record(z.unknown()).optional(),
});

// Unsubscribe schema
const unsubscribeSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

// List query schema
const listQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  unreadOnly: z.coerce.boolean().default(false),
});

/**
 * POST /api/v1/sante/notifications/subscribe
 * Register a device token for push notifications
 */
notifications.post(
  '/subscribe',
  zValidator('json', subscribeSchema),
  async (c) => {
    const user = c.get('user');
    const { token, platform, deviceName, deviceInfo } = c.req.valid('json');

    const pushService = new PushNotificationService(c.env);
    const pushToken = await pushService.registerToken(
      user.sub,
      token,
      platform,
      deviceName,
      deviceInfo
    );

    return success(c, {
      token: {
        id: pushToken.id,
        platform: pushToken.platform,
        deviceName: pushToken.deviceName,
        createdAt: pushToken.createdAt,
      },
      message: 'Device registered for push notifications',
    });
  }
);

/**
 * POST /api/v1/sante/notifications/unsubscribe
 * Unregister a device token
 */
notifications.post(
  '/unsubscribe',
  zValidator('json', unsubscribeSchema),
  async (c) => {
    const user = c.get('user');
    const { token } = c.req.valid('json');

    const pushService = new PushNotificationService(c.env);
    const unregistered = await pushService.unregisterToken(token, user.sub);

    if (!unregistered) {
      return badRequest(c, 'Token not found or already unregistered');
    }

    return success(c, {
      message: 'Device unregistered from push notifications',
    });
  }
);

/**
 * DELETE /api/v1/sante/notifications/devices
 * Unregister all devices for current user
 */
notifications.delete('/devices', async (c) => {
  const user = c.get('user');

  const pushService = new PushNotificationService(c.env);
  await pushService.unregisterAllTokens(user.sub);

  return success(c, {
    message: 'All devices unregistered',
  });
});

/**
 * GET /api/v1/sante/notifications/devices
 * List registered devices for current user
 */
notifications.get('/devices', async (c) => {
  const user = c.get('user');

  const pushService = new PushNotificationService(c.env);
  const tokens = await pushService.getUserTokens(user.sub);

  return success(c, {
    devices: tokens.map((t) => ({
      id: t.id,
      platform: t.platform,
      deviceName: t.deviceName,
      lastUsedAt: t.lastUsedAt,
      createdAt: t.createdAt,
    })),
  });
});

/**
 * GET /api/v1/sante/notifications
 * List user's SoinFlow notifications
 */
notifications.get(
  '/',
  zValidator('query', listQuerySchema),
  async (c) => {
    const user = c.get('user');
    const { page, limit, unreadOnly } = c.req.valid('query');

    const notificationService = new NotificationService(c.env);
    const { notifications: items, total } = await notificationService.getUserNotifications(
      user.sub,
      { page, limit, unreadOnly }
    );

    // Filter for SoinFlow notifications only
    const santeNotifications = items.filter(
      (n) => n.eventType.startsWith('SANTE_') || n.type === 'PUSH'
    );

    return success(c, {
      notifications: santeNotifications,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  }
);

/**
 * GET /api/v1/sante/notifications/count
 * Get unread notification count
 */
notifications.get('/count', async (c) => {
  const user = c.get('user');

  const notificationService = new NotificationService(c.env);
  const count = await notificationService.getUnreadCount(user.sub);

  return success(c, { unreadCount: count });
});

/**
 * POST /api/v1/sante/notifications/:id/read
 * Mark a notification as read
 */
notifications.post('/:id/read', async (c) => {
  const user = c.get('user');
  const notificationId = c.req.param('id');

  const notificationService = new NotificationService(c.env);
  await notificationService.markAsRead(notificationId, user.sub);

  return success(c, {
    message: 'Notification marquee comme lue',
  });
});

/**
 * POST /api/v1/sante/notifications/read-all
 * Mark all notifications as read
 */
notifications.post('/read-all', async (c) => {
  const user = c.get('user');

  const notificationService = new NotificationService(c.env);
  await notificationService.markAllAsRead(user.sub);

  return success(c, {
    message: 'Toutes les notifications marquees comme lues',
  });
});

export { notifications };
