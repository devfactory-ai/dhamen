/**
 * Notification Hub Durable Object
 *
 * Manages WebSocket connections for real-time notifications.
 * Each user has their own instance identified by their user ID.
 */

import type { DurableObjectState } from '@cloudflare/workers-types';

interface Session {
  webSocket: WebSocket;
  userId: string;
  connectedAt: number;
  lastPing: number;
}

interface NotificationMessage {
  type: 'notification' | 'ping' | 'pong' | 'subscribe' | 'unsubscribe';
  data?: {
    id: string;
    type: string;
    title: string;
    message: string;
    createdAt: string;
    read: boolean;
    data?: Record<string, unknown>;
  };
}

export class NotificationHub {
  private state: DurableObjectState;
  private sessions: Map<string, Session> = new Map();
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(state: DurableObjectState) {
    this.state = state;

    // Restore sessions from storage
    this.state.blockConcurrencyWhile(async () => {
      // Sessions don't persist across restarts - they reconnect
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(request);
    }

    // REST API endpoints
    if (path === '/send' && request.method === 'POST') {
      return this.handleSendNotification(request);
    }

    if (path === '/broadcast' && request.method === 'POST') {
      return this.handleBroadcast(request);
    }

    if (path === '/stats') {
      return this.handleStats();
    }

    return new Response('Not Found', { status: 404 });
  }

  /**
   * Handle WebSocket connection upgrade
   */
  private async handleWebSocket(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');

    if (!userId) {
      return new Response('Missing userId', { status: 400 });
    }

    // Create WebSocket pair
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    // Accept the connection
    server.accept();

    const sessionId = crypto.randomUUID();
    const session: Session = {
      webSocket: server,
      userId,
      connectedAt: Date.now(),
      lastPing: Date.now(),
    };

    this.sessions.set(sessionId, session);

    // Start ping interval if not already running
    if (!this.pingInterval) {
      this.startPingInterval();
    }

    // Handle messages
    server.addEventListener('message', (event) => {
      this.handleMessage(sessionId, event.data as string);
    });

    // Handle close
    server.addEventListener('close', () => {
      this.sessions.delete(sessionId);
      if (this.sessions.size === 0 && this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }
    });

    // Handle errors
    server.addEventListener('error', (error) => {
      console.error('WebSocket error:', error);
      this.sessions.delete(sessionId);
    });

    // Send welcome message
    server.send(JSON.stringify({
      type: 'connected',
      data: { sessionId, userId },
    }));

    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      const message = JSON.parse(data) as NotificationMessage;

      switch (message.type) {
        case 'ping':
          session.lastPing = Date.now();
          session.webSocket.send(JSON.stringify({ type: 'pong' }));
          break;

        case 'pong':
          session.lastPing = Date.now();
          break;

        case 'subscribe':
          // Could handle topic subscriptions here
          break;

        default:
          // Echo back or log unknown messages
          break;
      }
    } catch {
      // Invalid JSON - ignore
    }
  }

  /**
   * Send notification to a specific user
   */
  private async handleSendNotification(request: Request): Promise<Response> {
    try {
      const body = await request.json() as {
        userId: string;
        notification: NotificationMessage['data'];
      };

      const { userId, notification } = body;
      let delivered = 0;

      // Find all sessions for this user
      for (const [, session] of this.sessions) {
        if (session.userId === userId) {
          try {
            session.webSocket.send(JSON.stringify({
              type: 'notification',
              data: notification,
            }));
            delivered++;
          } catch {
            // Session may be closed
          }
        }
      }

      return Response.json({
        success: true,
        delivered,
        total: this.sessions.size,
      });
    } catch (error) {
      return Response.json({ error: 'Invalid request' }, { status: 400 });
    }
  }

  /**
   * Broadcast notification to all connected users
   */
  private async handleBroadcast(request: Request): Promise<Response> {
    try {
      const body = await request.json() as {
        notification: NotificationMessage['data'];
        roles?: string[];
      };

      const { notification } = body;
      let delivered = 0;

      for (const [, session] of this.sessions) {
        try {
          session.webSocket.send(JSON.stringify({
            type: 'notification',
            data: notification,
          }));
          delivered++;
        } catch {
          // Session may be closed
        }
      }

      return Response.json({
        success: true,
        delivered,
        total: this.sessions.size,
      });
    } catch {
      return Response.json({ error: 'Invalid request' }, { status: 400 });
    }
  }

  /**
   * Get connection statistics
   */
  private handleStats(): Response {
    const userCounts = new Map<string, number>();

    for (const [, session] of this.sessions) {
      const count = userCounts.get(session.userId) || 0;
      userCounts.set(session.userId, count + 1);
    }

    return Response.json({
      totalConnections: this.sessions.size,
      uniqueUsers: userCounts.size,
      users: Object.fromEntries(userCounts),
    });
  }

  /**
   * Start ping interval to keep connections alive
   */
  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      const now = Date.now();
      const timeout = 60000; // 60 seconds

      for (const [sessionId, session] of this.sessions) {
        // Check for stale connections
        if (now - session.lastPing > timeout) {
          try {
            session.webSocket.close(1000, 'Connection timeout');
          } catch {
            // Already closed
          }
          this.sessions.delete(sessionId);
          continue;
        }

        // Send ping
        try {
          session.webSocket.send(JSON.stringify({ type: 'ping' }));
        } catch {
          this.sessions.delete(sessionId);
        }
      }
    }, 30000); // Every 30 seconds
  }
}

export default NotificationHub;
