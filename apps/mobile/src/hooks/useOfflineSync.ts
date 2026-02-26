/**
 * Offline Sync Hook
 *
 * Monitors network connectivity and syncs queued actions when online.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { AppState, AppStateStatus } from 'react-native';
import { syncQueue, lastSync, QueueAction } from '@/lib/offline-storage';
import { apiClient } from '@/lib/api-client';

export interface UseOfflineSyncReturn {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncTime: Date | null;
  syncNow: () => Promise<void>;
}

// Max retries before giving up on an action
const MAX_RETRIES = 3;

/**
 * Hook for managing offline sync
 */
export function useOfflineSync(): UseOfflineSyncReturn {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const syncInProgressRef = useRef(false);

  // Update pending count
  const updatePendingCount = useCallback(async () => {
    const count = await syncQueue.count();
    setPendingCount(count);
  }, []);

  // Process a single queued action
  const processAction = async (action: QueueAction): Promise<boolean> => {
    try {
      switch (action.type) {
        case 'CREATE_DEMANDE': {
          const response = await apiClient.post('/sante/demandes', action.payload);
          return response.success;
        }

        case 'UPLOAD_DOCUMENT': {
          const { demandeId, imageUri, typeDocument } = action.payload as {
            demandeId: string;
            imageUri: string;
            typeDocument: string;
          };
          const formData = new FormData();
          formData.append('file', {
            uri: imageUri,
            type: 'image/jpeg',
            name: 'bulletin.jpg',
          } as unknown as Blob);
          formData.append('demandeId', demandeId);
          formData.append('typeDocument', typeDocument);
          const response = await apiClient.upload('/sante/documents/upload', formData);
          return response.success;
        }

        case 'MARK_NOTIFICATION_READ': {
          const { notificationId } = action.payload as { notificationId: string };
          const response = await apiClient.post(`/sante/notifications/${notificationId}/read`);
          return response.success;
        }

        default:
          console.warn(`Unknown action type: ${action.type}`);
          return false;
      }
    } catch (error) {
      console.error(`Failed to process action ${action.type}:`, error);
      return false;
    }
  };

  // Sync all queued actions
  const syncNow = useCallback(async () => {
    if (syncInProgressRef.current || !isOnline) {
      return;
    }

    syncInProgressRef.current = true;
    setIsSyncing(true);

    try {
      const queue = await syncQueue.getAll();

      for (const action of queue) {
        // Skip if too many retries
        if (action.retryCount >= MAX_RETRIES) {
          console.warn(`Action ${action.id} exceeded max retries, removing`);
          await syncQueue.remove(action.id);
          continue;
        }

        const success = await processAction(action);

        if (success) {
          await syncQueue.remove(action.id);
        } else {
          await syncQueue.incrementRetry(action.id);
        }
      }

      await lastSync.set();
      const syncTime = await lastSync.get();
      setLastSyncTime(syncTime);
      await updatePendingCount();
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      setIsSyncing(false);
      syncInProgressRef.current = false;
    }
  }, [isOnline, updatePendingCount]);

  // Network state listener
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const wasOffline = !isOnline;
      const nowOnline = Boolean(state.isConnected && state.isInternetReachable !== false);

      setIsOnline(nowOnline);

      // Auto-sync when coming back online
      if (wasOffline && nowOnline) {
        syncNow();
      }
    });

    return () => unsubscribe();
  }, [isOnline, syncNow]);

  // App state listener (sync when app becomes active)
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active' && isOnline) {
        updatePendingCount();
        // Delayed sync to avoid race conditions
        setTimeout(syncNow, 1000);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [isOnline, syncNow, updatePendingCount]);

  // Initial load
  useEffect(() => {
    const init = async () => {
      const syncTime = await lastSync.get();
      setLastSyncTime(syncTime);
      await updatePendingCount();

      // Check initial network state
      const state = await NetInfo.fetch();
      setIsOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
    };

    init();
  }, [updatePendingCount]);

  return {
    isOnline,
    isSyncing,
    pendingCount,
    lastSyncTime,
    syncNow,
  };
}

/**
 * Queue action for offline sync
 */
export async function queueOfflineAction(
  type: QueueAction['type'],
  payload: Record<string, unknown>
): Promise<string> {
  return syncQueue.add(type, payload);
}
