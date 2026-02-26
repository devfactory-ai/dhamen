/**
 * Realtime Routes
 *
 * Server-Sent Events (SSE) for real-time notifications
 */
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { Bindings, Variables } from '../types';
import { authMiddleware } from '../middleware/auth';

const realtime = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// =============================================================================
// Types
// =============================================================================

interface RealtimeEvent {
  type:
    | 'notification'
    | 'demande_update'
    | 'paiement_update'
    | 'fraud_alert'
    | 'eligibility_check'
    | 'bordereau_ready'
    | 'system';
  data: Record<string, unknown>;
  timestamp: string;
}

// =============================================================================
// In-memory event store (for demo - in production use Durable Objects or KV)
// =============================================================================

const eventQueues = new Map<string, RealtimeEvent[]>();
const MAX_EVENTS_PER_USER = 100;

function addEvent(userId: string, event: RealtimeEvent) {
  if (!eventQueues.has(userId)) {
    eventQueues.set(userId, []);
  }
  const queue = eventQueues.get(userId)!;
  queue.push(event);

  // Trim old events
  if (queue.length > MAX_EVENTS_PER_USER) {
    queue.splice(0, queue.length - MAX_EVENTS_PER_USER);
  }
}

function getEvents(userId: string, since?: string): RealtimeEvent[] {
  const queue = eventQueues.get(userId) || [];
  if (!since) return queue;

  const sinceTime = new Date(since).getTime();
  return queue.filter((e) => new Date(e.timestamp).getTime() > sinceTime);
}

// =============================================================================
// Routes
// =============================================================================

/**
 * GET /realtime/events
 * SSE endpoint for real-time events
 */
realtime.get('/events', authMiddleware(), async (c) => {
  const user = c.get('user');
  const lastEventId = c.req.header('Last-Event-ID');

  return streamSSE(c, async (stream) => {
    let eventId = 0;
    let isConnected = true;

    // Send initial connection event
    await stream.writeSSE({
      event: 'connected',
      data: JSON.stringify({
        userId: user.sub,
        timestamp: new Date().toISOString(),
      }),
      id: String(++eventId),
    });

    // Stream events
    while (isConnected) {
      try {
        // Get pending events
        const events = getEvents(user.sub, lastEventId);

        for (const event of events) {
          await stream.writeSSE({
            event: event.type,
            data: JSON.stringify(event.data),
            id: String(++eventId),
          });
        }

        // Heartbeat every 30 seconds
        await stream.writeSSE({
          event: 'heartbeat',
          data: JSON.stringify({ timestamp: new Date().toISOString() }),
          id: String(++eventId),
        });

        // Wait before next check (5 seconds)
        await stream.sleep(5000);
      } catch (error) {
        // Connection closed
        isConnected = false;
      }
    }
  });
});

/**
 * POST /realtime/publish
 * Publish an event to a user (internal use)
 */
realtime.post('/publish', authMiddleware(), async (c) => {
  const user = c.get('user');
  const { userId, type, data } = await c.req.json<{
    userId: string;
    type: RealtimeEvent['type'];
    data: Record<string, unknown>;
  }>();

  // Only admins can publish to other users
  if (userId !== user.sub && user.role !== 'ADMIN') {
    return c.json({ success: false, error: 'Unauthorized' }, 403);
  }

  const event: RealtimeEvent = {
    type,
    data,
    timestamp: new Date().toISOString(),
  };

  addEvent(userId, event);

  return c.json({ success: true });
});

/**
 * POST /realtime/broadcast
 * Broadcast event to multiple users (admin only)
 */
realtime.post('/broadcast', authMiddleware(), async (c) => {
  const user = c.get('user');

  if (user.role !== 'ADMIN') {
    return c.json({ success: false, error: 'Admin only' }, 403);
  }

  const { userIds, type, data } = await c.req.json<{
    userIds: string[];
    type: RealtimeEvent['type'];
    data: Record<string, unknown>;
  }>();

  const event: RealtimeEvent = {
    type,
    data,
    timestamp: new Date().toISOString(),
  };

  for (const userId of userIds) {
    addEvent(userId, event);
  }

  return c.json({ success: true, count: userIds.length });
});

/**
 * GET /realtime/status
 * Get connection status
 */
realtime.get('/status', authMiddleware(), async (c) => {
  const user = c.get('user');
  const pendingEvents = getEvents(user.sub).length;

  return c.json({
    success: true,
    data: {
      userId: user.sub,
      pendingEvents,
      serverTime: new Date().toISOString(),
    },
  });
});

export { realtime };
