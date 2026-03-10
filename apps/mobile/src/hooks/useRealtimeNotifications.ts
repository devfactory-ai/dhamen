/**
 * Real-time Notifications Hook for SoinFlow Mobile
 *
 * WebSocket-based real-time notification system
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useQueryClient } from '@tanstack/react-query';
import { setBadgeCount } from './usePushNotifications';

const WS_BASE_URL = process.env.EXPO_PUBLIC_WS_URL || 'wss://dhamen-api.yassine-techini.workers.dev/api/v1/sante/realtime/ws';

export interface RealtimeNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  data?: Record<string, unknown>;
}

interface WebSocketMessage {
  type: 'notification' | 'ping' | 'pong' | 'connected' | 'error';
  data?: RealtimeNotification;
  error?: string;
}

interface UseRealtimeNotificationsOptions {
  onNotification?: (notification: RealtimeNotification) => void;
  onConnectionChange?: (connected: boolean) => void;
  enabled?: boolean;
}

export function useRealtimeNotifications(options: UseRealtimeNotificationsOptions = {}) {
  const { onNotification, onConnectionChange, enabled = true } = options;
  const queryClient = useQueryClient();

  const [isConnected, setIsConnected] = useState(false);
  const [lastNotification, setLastNotification] = useState<RealtimeNotification | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_BASE_DELAY_MS = 1000;
  const PING_INTERVAL_MS = 30000;

  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(async () => {
    if (!enabled) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    cleanup();

    try {
      const [userId, accessToken] = await Promise.all([
        SecureStore.getItemAsync('userId'),
        SecureStore.getItemAsync('accessToken'),
      ]);

      if (!userId || !accessToken) {
        console.log('[WS] No user credentials, skipping connection');
        return;
      }

      const wsUrl = `${WS_BASE_URL}?userId=${userId}&token=${accessToken}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WS] Connected');
        setIsConnected(true);
        setReconnectAttempts(0);
        onConnectionChange?.(true);

        // Start ping interval
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, PING_INTERVAL_MS);
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);

          switch (message.type) {
            case 'notification':
              if (message.data) {
                setLastNotification(message.data);
                onNotification?.(message.data);

                // Invalidate notifications query to refresh the list
                queryClient.invalidateQueries({ queryKey: ['sante-notifications'] });

                // Update badge count
                queryClient
                  .fetchQuery({
                    queryKey: ['sante-notifications-count'],
                    queryFn: async () => {
                      // This will be refetched, for now just increment
                      return null;
                    },
                  })
                  .catch(() => {
                    // Ignore
                  });
              }
              break;

            case 'pong':
              // Connection is alive
              break;

            case 'connected':
              console.log('[WS] Server acknowledged connection');
              break;

            case 'error':
              console.error('[WS] Server error:', message.error);
              break;
          }
        } catch (error) {
          console.error('[WS] Failed to parse message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('[WS] Error:', error);
      };

      ws.onclose = (event) => {
        console.log('[WS] Closed:', event.code, event.reason);
        setIsConnected(false);
        onConnectionChange?.(false);

        // Clear ping interval
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        // Attempt reconnection if not a clean close and app is active
        if (event.code !== 1000 && appStateRef.current === 'active' && enabled) {
          scheduleReconnect();
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('[WS] Connection failed:', error);
      scheduleReconnect();
    }
  }, [enabled, cleanup, onNotification, onConnectionChange, queryClient]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log('[WS] Max reconnect attempts reached');
      return;
    }

    const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttempts);
    console.log(`[WS] Scheduling reconnect in ${delay}ms (attempt ${reconnectAttempts + 1})`);

    reconnectTimeoutRef.current = setTimeout(() => {
      setReconnectAttempts((prev) => prev + 1);
      connect();
    }, delay);
  }, [reconnectAttempts, connect]);

  const disconnect = useCallback(() => {
    cleanup();
    setIsConnected(false);
    setReconnectAttempts(0);
    onConnectionChange?.(false);
  }, [cleanup, onConnectionChange]);

  const send = useCallback((message: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, []);

  // Handle app state changes
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        // App came to foreground
        console.log('[WS] App active, connecting...');
        connect();
      } else if (nextAppState.match(/inactive|background/)) {
        // App went to background
        console.log('[WS] App background, disconnecting...');
        disconnect();
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [connect, disconnect]);

  // Initial connection
  useEffect(() => {
    if (enabled && appStateRef.current === 'active') {
      connect();
    }

    return () => {
      cleanup();
    };
  }, [enabled, connect, cleanup]);

  return {
    isConnected,
    lastNotification,
    reconnectAttempts,
    connect,
    disconnect,
    send,
  };
}

/**
 * Provider component for global realtime notifications
 */
export function useGlobalRealtimeNotifications() {
  const queryClient = useQueryClient();

  return useRealtimeNotifications({
    onNotification: async (notification) => {
      console.log('[Realtime] New notification:', notification.title);

      // Update badge count
      try {
        const currentBadge = await SecureStore.getItemAsync('unreadBadge');
        const newBadge = (parseInt(currentBadge || '0', 10) || 0) + 1;
        await SecureStore.setItemAsync('unreadBadge', String(newBadge));
        setBadgeCount(newBadge);
      } catch {
        // Ignore badge update errors
      }

      // Invalidate relevant queries based on notification type
      if (notification.type.includes('demande')) {
        queryClient.invalidateQueries({ queryKey: ['sante-demandes'] });
        queryClient.invalidateQueries({ queryKey: ['mes-demandes'] });

        // Also invalidate the specific demande detail if demandeId is available
        const demandeId = notification.data?.demandeId as string | undefined;
        if (demandeId) {
          queryClient.invalidateQueries({ queryKey: ['demande', demandeId] });
        }
      }
      if (notification.type.includes('paiement')) {
        queryClient.invalidateQueries({ queryKey: ['sante-paiements'] });
      }
      if (notification.type.includes('bordereau')) {
        queryClient.invalidateQueries({ queryKey: ['sante-bordereaux'] });
      }
    },
    onConnectionChange: (connected) => {
      console.log('[Realtime] Connection status:', connected ? 'Connected' : 'Disconnected');
    },
    enabled: true,
  });
}
