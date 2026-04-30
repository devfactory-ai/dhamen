/**
 * Notifications Routes
 *
 * API endpoints for managing user notifications
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Bindings, Variables } from '../types';
import { NotificationService } from '../services/notification.service';
import { authMiddleware } from '../middleware/auth';
import { logAudit } from '../middleware/audit-trail';

const notifications = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All routes require authentication
notifications.use('*', authMiddleware());

// Get notification preferences schema
const updatePreferencesSchema = z.object({
  emailClaims: z.boolean().optional(),
  emailBordereaux: z.boolean().optional(),
  emailReconciliation: z.boolean().optional(),
  emailSystem: z.boolean().optional(),
  smsClaims: z.boolean().optional(),
  smsUrgent: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
  quietHoursEnabled: z.boolean().optional(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

// List query schema
const listQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  unreadOnly: z.coerce.boolean().default(false),
});

/**
 * GET /notifications
 * List user's notifications
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

    return c.json({
      success: true,
      data: {
        notifications: items,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  }
);

/**
 * GET /notifications/count
 * Get unread notification count
 */
notifications.get('/count', async (c) => {
  const user = c.get('user');

  const notificationService = new NotificationService(c.env);
  const count = await notificationService.getUnreadCount(user.sub);

  return c.json({
    success: true,
    data: { unreadCount: count },
  });
});

/**
 * GET /notifications/preferences
 * Get user's notification preferences
 */
notifications.get('/preferences', async (c) => {
  const user = c.get('user');

  const notificationService = new NotificationService(c.env);
  const preferences = await notificationService.getUserPreferences(user.sub);

  return c.json({
    success: true,
    data: preferences,
  });
});

/**
 * PUT /notifications/preferences
 * Update user's notification preferences
 */
notifications.put(
  '/preferences',
  zValidator('json', updatePreferencesSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const notificationService = new NotificationService(c.env);
    await notificationService.updatePreferences(user.sub, body);

    logAudit(c.env.DB, {
      userId: user.sub,
      action: 'notification_preferences.update',
      entityType: 'notification_preferences',
      entityId: user.sub,
      changes: body,
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    const updatedPrefs = await notificationService.getUserPreferences(user.sub);

    return c.json({
      success: true,
      data: updatedPrefs,
    });
  }
);

/**
 * POST /notifications/:id/read
 * Mark a notification as read
 */
notifications.post('/:id/read', async (c) => {
  const user = c.get('user');
  const notificationId = c.req.param('id');

  const notificationService = new NotificationService(c.env);
  await notificationService.markAsRead(notificationId, user.sub);

  logAudit(c.env.DB, {
    userId: user.sub,
    action: 'notification.mark_read',
    entityType: 'notification',
    entityId: notificationId,
    changes: { read: true },
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return c.json({
    success: true,
    message: 'Notification marquée comme lue',
  });
});

/**
 * POST /notifications/read-all
 * Mark all notifications as read
 */
notifications.post('/read-all', async (c) => {
  const user = c.get('user');

  const notificationService = new NotificationService(c.env);
  await notificationService.markAllAsRead(user.sub);

  logAudit(c.env.DB, {
    userId: user.sub,
    action: 'notification.mark_all_read',
    entityType: 'notification',
    entityId: user.sub,
    changes: { allRead: true },
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return c.json({
    success: true,
    message: 'Toutes les notifications marquées comme lues',
  });
});

export { notifications };
