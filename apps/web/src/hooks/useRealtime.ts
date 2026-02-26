/**
 * useRealtime Hook
 *
 * Real-time notifications using Server-Sent Events
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { toast } from 'sonner';

export type RealtimeEventType =
  | 'notification'
  | 'demande_update'
  | 'paiement_update'
  | 'fraud_alert'
  | 'eligibility_check'
  | 'bordereau_ready'
  | 'system'
  | 'connected'
  | 'heartbeat';

export interface RealtimeEvent {
  type: RealtimeEventType;
  data: Record<string, unknown>;
  id?: string;
}

interface UseRealtimeOptions {
  onEvent?: (event: RealtimeEvent) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  showToasts?: boolean;
  autoReconnect?: boolean;
  reconnectInterval?: number;
}

export function useRealtime(options: UseRealtimeOptions = {}) {
  const {
    onEvent,
    onConnect,
    onDisconnect,
    showToasts = true,
    autoReconnect = true,
    reconnectInterval = 5000,
  } = options;

  const { token, isAuthenticated } = useAuth();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
  const [events, setEvents] = useState<RealtimeEvent[]>([]);

  const connect = useCallback(() => {
    if (!isAuthenticated || !token) return;
    if (eventSourceRef.current) return;

    const apiUrl = import.meta.env.VITE_API_URL || '';
    const url = `${apiUrl}/realtime/events`;

    try {
      // Create EventSource with auth header via URL param (workaround)
      // In production, use cookies or a separate auth mechanism
      const eventSource = new EventSource(url, {
        withCredentials: true,
      });

      eventSource.onopen = () => {
        setIsConnected(true);
        onConnect?.();
      };

      eventSource.onerror = () => {
        setIsConnected(false);
        eventSource.close();
        eventSourceRef.current = null;
        onDisconnect?.();

        // Auto reconnect
        if (autoReconnect) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        }
      };

      // Generic message handler
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const realtimeEvent: RealtimeEvent = {
            type: 'notification',
            data,
            id: event.lastEventId,
          };
          handleEvent(realtimeEvent);
        } catch (e) {
          console.error('Failed to parse SSE message:', e);
        }
      };

      // Specific event handlers
      const eventTypes: RealtimeEventType[] = [
        'connected',
        'heartbeat',
        'notification',
        'demande_update',
        'paiement_update',
        'fraud_alert',
        'eligibility_check',
        'bordereau_ready',
        'system',
      ];

      eventTypes.forEach((type) => {
        eventSource.addEventListener(type, (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            const realtimeEvent: RealtimeEvent = {
              type,
              data,
              id: event.lastEventId,
            };
            handleEvent(realtimeEvent);
          } catch (e) {
            console.error(`Failed to parse ${type} event:`, e);
          }
        });
      });

      eventSourceRef.current = eventSource;
    } catch (error) {
      console.error('Failed to create EventSource:', error);
    }
  }, [isAuthenticated, token, autoReconnect, reconnectInterval, onConnect, onDisconnect]);

  const handleEvent = useCallback(
    (event: RealtimeEvent) => {
      setLastEvent(event);
      setEvents((prev) => [...prev.slice(-99), event]);
      onEvent?.(event);

      // Show toast notifications for important events
      if (showToasts && event.type !== 'heartbeat' && event.type !== 'connected') {
        showEventToast(event);
      }
    },
    [onEvent, showToasts]
  );

  const showEventToast = (event: RealtimeEvent) => {
    const { type, data } = event;

    switch (type) {
      case 'notification':
        toast.info(String(data.message || 'Nouvelle notification'));
        break;
      case 'demande_update':
        toast.info(`Demande ${data.numero} mise à jour: ${data.statut}`);
        break;
      case 'paiement_update':
        toast.success(`Paiement ${data.reference}: ${data.statut}`);
        break;
      case 'fraud_alert':
        toast.warning(`Alerte fraude: ${data.niveau} - ${data.message}`);
        break;
      case 'eligibility_check':
        toast.info(`Vérification éligibilité: ${data.matricule}`);
        break;
      case 'bordereau_ready':
        toast.success(`Bordereau ${data.numero} prêt`);
        break;
      case 'system':
        if (data.severity === 'error') {
          toast.error(String(data.message));
        } else {
          toast.info(String(data.message));
        }
        break;
    }
  };

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsConnected(false);
      onDisconnect?.();
    }
  }, [onDisconnect]);

  const clearEvents = useCallback(() => {
    setEvents([]);
    setLastEvent(null);
  }, []);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected,
    lastEvent,
    events,
    connect,
    disconnect,
    clearEvents,
  };
}

/**
 * Hook for subscribing to specific event types
 */
export function useRealtimeEvent(
  eventType: RealtimeEventType,
  callback: (data: Record<string, unknown>) => void
) {
  const { lastEvent } = useRealtime({
    showToasts: false,
    onEvent: (event) => {
      if (event.type === eventType) {
        callback(event.data);
      }
    },
  });

  return lastEvent?.type === eventType ? lastEvent : null;
}
