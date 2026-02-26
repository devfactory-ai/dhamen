/**
 * Offline Storage Module
 *
 * Provides caching and offline queue functionality for SoinFlow mobile app.
 * Uses AsyncStorage for persistence.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage keys
const KEYS = {
  PROFILE: 'soinflow_profile',
  DEMANDES: 'soinflow_demandes',
  NOTIFICATIONS: 'soinflow_notifications',
  SYNC_QUEUE: 'soinflow_sync_queue',
  LAST_SYNC: 'soinflow_last_sync',
};

// Queue action types
export type QueueActionType =
  | 'CREATE_DEMANDE'
  | 'UPLOAD_DOCUMENT'
  | 'MARK_NOTIFICATION_READ';

export interface QueueAction {
  id: string;
  type: QueueActionType;
  payload: Record<string, unknown>;
  createdAt: string;
  retryCount: number;
}

export interface CachedData<T> {
  data: T;
  cachedAt: string;
  expiresAt?: string;
}

/**
 * Generate unique ID for queue actions
 */
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/**
 * Generic cache functions
 */
export const cache = {
  /**
   * Set cached data with optional TTL
   */
  async set<T>(key: string, data: T, ttlMinutes?: number): Promise<void> {
    const cached: CachedData<T> = {
      data,
      cachedAt: new Date().toISOString(),
      expiresAt: ttlMinutes
        ? new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString()
        : undefined,
    };
    await AsyncStorage.setItem(key, JSON.stringify(cached));
  },

  /**
   * Get cached data (returns null if expired or not found)
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await AsyncStorage.getItem(key);
      if (!value) return null;

      const cached: CachedData<T> = JSON.parse(value);

      // Check expiration
      if (cached.expiresAt && new Date(cached.expiresAt) < new Date()) {
        await AsyncStorage.removeItem(key);
        return null;
      }

      return cached.data;
    } catch {
      return null;
    }
  },

  /**
   * Remove cached item
   */
  async remove(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  },

  /**
   * Clear all cached data
   */
  async clear(): Promise<void> {
    const keys = Object.values(KEYS);
    await AsyncStorage.multiRemove(keys);
  },
};

/**
 * Profile cache
 */
export const profileCache = {
  async save(profile: Record<string, unknown>): Promise<void> {
    await cache.set(KEYS.PROFILE, profile, 60); // 1 hour TTL
  },

  async get(): Promise<Record<string, unknown> | null> {
    return cache.get(KEYS.PROFILE);
  },

  async clear(): Promise<void> {
    await cache.remove(KEYS.PROFILE);
  },
};

/**
 * Demandes cache
 */
export const demandesCache = {
  async save(demandes: unknown[]): Promise<void> {
    await cache.set(KEYS.DEMANDES, demandes, 30); // 30 min TTL
  },

  async get(): Promise<unknown[] | null> {
    return cache.get(KEYS.DEMANDES);
  },

  async clear(): Promise<void> {
    await cache.remove(KEYS.DEMANDES);
  },
};

/**
 * Notifications cache
 */
export const notificationsCache = {
  async save(notifications: unknown[]): Promise<void> {
    await cache.set(KEYS.NOTIFICATIONS, notifications, 15); // 15 min TTL
  },

  async get(): Promise<unknown[] | null> {
    return cache.get(KEYS.NOTIFICATIONS);
  },

  async clear(): Promise<void> {
    await cache.remove(KEYS.NOTIFICATIONS);
  },
};

/**
 * Sync queue for offline actions
 */
export const syncQueue = {
  /**
   * Add action to sync queue
   */
  async add(type: QueueActionType, payload: Record<string, unknown>): Promise<string> {
    const queue = await this.getAll();
    const action: QueueAction = {
      id: generateId(),
      type,
      payload,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };
    queue.push(action);
    await AsyncStorage.setItem(KEYS.SYNC_QUEUE, JSON.stringify(queue));
    return action.id;
  },

  /**
   * Get all queued actions
   */
  async getAll(): Promise<QueueAction[]> {
    try {
      const value = await AsyncStorage.getItem(KEYS.SYNC_QUEUE);
      return value ? JSON.parse(value) : [];
    } catch {
      return [];
    }
  },

  /**
   * Remove action from queue (after successful sync)
   */
  async remove(actionId: string): Promise<void> {
    const queue = await this.getAll();
    const filtered = queue.filter((a) => a.id !== actionId);
    await AsyncStorage.setItem(KEYS.SYNC_QUEUE, JSON.stringify(filtered));
  },

  /**
   * Increment retry count for an action
   */
  async incrementRetry(actionId: string): Promise<void> {
    const queue = await this.getAll();
    const action = queue.find((a) => a.id === actionId);
    if (action) {
      action.retryCount += 1;
      await AsyncStorage.setItem(KEYS.SYNC_QUEUE, JSON.stringify(queue));
    }
  },

  /**
   * Get count of pending actions
   */
  async count(): Promise<number> {
    const queue = await this.getAll();
    return queue.length;
  },

  /**
   * Clear all queued actions
   */
  async clear(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.SYNC_QUEUE);
  },
};

/**
 * Last sync timestamp
 */
export const lastSync = {
  async get(): Promise<Date | null> {
    try {
      const value = await AsyncStorage.getItem(KEYS.LAST_SYNC);
      return value ? new Date(value) : null;
    } catch {
      return null;
    }
  },

  async set(): Promise<void> {
    await AsyncStorage.setItem(KEYS.LAST_SYNC, new Date().toISOString());
  },
};

/**
 * Clear all offline data (logout)
 */
export async function clearAllOfflineData(): Promise<void> {
  await cache.clear();
}
