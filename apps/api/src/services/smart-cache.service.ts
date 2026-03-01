/**
 * Smart Cache Service
 *
 * Intelligent caching with strategies, invalidation, and preloading
 */

import type { Bindings } from '../types';

export type CacheStrategy = 'cache-first' | 'network-first' | 'stale-while-revalidate' | 'cache-only';

export interface CacheConfig {
  ttl: number; // seconds
  strategy: CacheStrategy;
  tags?: string[];
  preload?: boolean;
  compress?: boolean;
}

export interface CacheEntry<T> {
  data: T;
  createdAt: number;
  expiresAt: number;
  tags: string[];
  hits: number;
  strategy: CacheStrategy;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalEntries: number;
  totalSize: number;
}

// Default TTLs for different data types
const DEFAULT_TTLS: Record<string, number> = {
  eligibility: 60, // 1 minute
  adherent: 300, // 5 minutes
  contract: 600, // 10 minutes
  provider: 3600, // 1 hour
  insurer: 3600, // 1 hour
  tarification: 1800, // 30 minutes
  config: 86400, // 24 hours
};

export class SmartCacheService {
  private localCache: Map<string, CacheEntry<unknown>> = new Map();
  private stats = { hits: 0, misses: 0 };

  constructor(private env: Bindings) {}

  /**
   * Get value from cache with strategy
   */
  async get<T>(
    key: string,
    fetcher: () => Promise<T>,
    config: Partial<CacheConfig> = {}
  ): Promise<T> {
    const fullConfig: CacheConfig = {
      ttl: config.ttl || 300,
      strategy: config.strategy || 'stale-while-revalidate',
      tags: config.tags || [],
      preload: config.preload || false,
      compress: config.compress || false,
    };

    switch (fullConfig.strategy) {
      case 'cache-first':
        return this.cacheFirst(key, fetcher, fullConfig);
      case 'network-first':
        return this.networkFirst(key, fetcher, fullConfig);
      case 'stale-while-revalidate':
        return this.staleWhileRevalidate(key, fetcher, fullConfig);
      case 'cache-only':
        return this.cacheOnly<T>(key);
      default:
        return this.staleWhileRevalidate(key, fetcher, fullConfig);
    }
  }

  /**
   * Cache-first strategy
   */
  private async cacheFirst<T>(
    key: string,
    fetcher: () => Promise<T>,
    config: CacheConfig
  ): Promise<T> {
    // Try local cache first
    const local = this.localCache.get(key) as CacheEntry<T> | undefined;
    if (local && local.expiresAt > Date.now()) {
      this.stats.hits++;
      local.hits++;
      return local.data;
    }

    // Try KV cache
    const cached = await this.env.CACHE.get(key);
    if (cached) {
      const entry = JSON.parse(cached) as CacheEntry<T>;
      if (entry.expiresAt > Date.now()) {
        this.stats.hits++;
        entry.hits++;
        this.localCache.set(key, entry);
        return entry.data;
      }
    }

    // Fetch and cache
    this.stats.misses++;
    const data = await fetcher();
    await this.set(key, data, config);
    return data;
  }

  /**
   * Network-first strategy
   */
  private async networkFirst<T>(
    key: string,
    fetcher: () => Promise<T>,
    config: CacheConfig
  ): Promise<T> {
    try {
      const data = await fetcher();
      await this.set(key, data, config);
      this.stats.hits++;
      return data;
    } catch (error) {
      // Fall back to cache on network failure
      const cached = await this.env.CACHE.get(key);
      if (cached) {
        const entry = JSON.parse(cached) as CacheEntry<T>;
        return entry.data;
      }
      throw error;
    }
  }

  /**
   * Stale-while-revalidate strategy
   */
  private async staleWhileRevalidate<T>(
    key: string,
    fetcher: () => Promise<T>,
    config: CacheConfig
  ): Promise<T> {
    // Return stale data immediately if available
    const cached = await this.env.CACHE.get(key);
    if (cached) {
      const entry = JSON.parse(cached) as CacheEntry<T>;
      this.stats.hits++;

      // Revalidate in background if stale
      if (entry.expiresAt < Date.now()) {
        this.revalidateInBackground(key, fetcher, config);
      }

      return entry.data;
    }

    // No cache, fetch synchronously
    this.stats.misses++;
    const data = await fetcher();
    await this.set(key, data, config);
    return data;
  }

  /**
   * Cache-only strategy
   */
  private async cacheOnly<T>(key: string): Promise<T> {
    const cached = await this.env.CACHE.get(key);
    if (!cached) {
      throw new Error(`Cache miss for key: ${key}`);
    }
    const entry = JSON.parse(cached) as CacheEntry<T>;
    this.stats.hits++;
    return entry.data;
  }

  /**
   * Revalidate cache in background
   */
  private async revalidateInBackground<T>(
    key: string,
    fetcher: () => Promise<T>,
    config: CacheConfig
  ): Promise<void> {
    // Use waitUntil if available for background execution
    try {
      const data = await fetcher();
      await this.set(key, data, config);
    } catch (error) {
      console.error(`Background revalidation failed for ${key}:`, error);
    }
  }

  /**
   * Set value in cache
   */
  async set<T>(key: string, data: T, config: Partial<CacheConfig> = {}): Promise<void> {
    const ttl = config.ttl || 300;
    const now = Date.now();

    const entry: CacheEntry<T> = {
      data,
      createdAt: now,
      expiresAt: now + ttl * 1000,
      tags: config.tags || [],
      hits: 0,
      strategy: config.strategy || 'stale-while-revalidate',
    };

    // Set in local cache
    this.localCache.set(key, entry);

    // Set in KV cache
    await this.env.CACHE.put(key, JSON.stringify(entry), {
      expirationTtl: ttl + 60, // Add buffer for stale-while-revalidate
    });

    // Index by tags for invalidation
    for (const tag of entry.tags) {
      await this.addToTagIndex(tag, key);
    }
  }

  /**
   * Delete from cache
   */
  async delete(key: string): Promise<void> {
    this.localCache.delete(key);
    await this.env.CACHE.delete(key);
  }

  /**
   * Invalidate by tag
   */
  async invalidateByTag(tag: string): Promise<number> {
    const tagKey = `tag:${tag}`;
    const keysJson = await this.env.CACHE.get(tagKey);
    if (!keysJson) return 0;

    const keys: string[] = JSON.parse(keysJson);
    let invalidated = 0;

    for (const key of keys) {
      await this.delete(key);
      invalidated++;
    }

    await this.env.CACHE.delete(tagKey);
    return invalidated;
  }

  /**
   * Invalidate by pattern
   */
  async invalidateByPattern(pattern: string): Promise<number> {
    // For KV, we need to list keys (limited functionality)
    // In production, use a tag-based approach instead
    const keys = await this.env.CACHE.list({ prefix: pattern });
    let invalidated = 0;

    for (const key of keys.keys) {
      await this.delete(key.name);
      invalidated++;
    }

    return invalidated;
  }

  /**
   * Add key to tag index
   */
  private async addToTagIndex(tag: string, key: string): Promise<void> {
    const tagKey = `tag:${tag}`;
    const existing = await this.env.CACHE.get(tagKey);
    const keys: string[] = existing ? JSON.parse(existing) : [];

    if (!keys.includes(key)) {
      keys.push(key);
      await this.env.CACHE.put(tagKey, JSON.stringify(keys), {
        expirationTtl: 86400, // 24 hours
      });
    }
  }

  /**
   * Preload cache with common data
   */
  async preloadCache(insurerId?: string): Promise<{ loaded: number; errors: number }> {
    let loaded = 0;
    let errors = 0;

    const preloadConfigs = [
      {
        key: 'providers:active',
        fetcher: () => this.fetchActiveProviders(),
        config: { ttl: 3600, tags: ['providers'] },
      },
      {
        key: `insurers:${insurerId || 'all'}`,
        fetcher: () => this.fetchInsurers(insurerId),
        config: { ttl: 3600, tags: ['insurers'] },
      },
      {
        key: 'tarification:baremes',
        fetcher: () => this.fetchBaremes(),
        config: { ttl: 1800, tags: ['tarification'] },
      },
      {
        key: 'config:care_types',
        fetcher: () => this.fetchCareTypes(),
        config: { ttl: 86400, tags: ['config'] },
      },
    ];

    for (const item of preloadConfigs) {
      try {
        await this.get(item.key, item.fetcher, item.config);
        loaded++;
      } catch (error) {
        errors++;
        console.error(`Preload failed for ${item.key}:`, error);
      }
    }

    return { loaded, errors };
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? (this.stats.hits / total) * 100 : 0,
      totalEntries: this.localCache.size,
      totalSize: 0, // Would need to calculate actual size
    };
  }

  /**
   * Clear all local cache
   */
  clearLocalCache(): void {
    this.localCache.clear();
    this.stats = { hits: 0, misses: 0 };
  }

  // ============== SPECIALIZED CACHE METHODS ==============

  /**
   * Cache eligibility check result
   */
  async cacheEligibility(
    adherentId: string,
    careType: string,
    result: unknown
  ): Promise<void> {
    const key = `eligibility:${adherentId}:${careType}`;
    await this.set(key, result, {
      ttl: DEFAULT_TTLS.eligibility,
      tags: ['eligibility', `adherent:${adherentId}`],
    });
  }

  /**
   * Get cached eligibility
   */
  async getCachedEligibility(adherentId: string, careType: string): Promise<unknown | null> {
    const key = `eligibility:${adherentId}:${careType}`;
    try {
      return await this.cacheOnly(key);
    } catch {
      return null;
    }
  }

  /**
   * Cache adherent data
   */
  async cacheAdherent(adherentId: string, data: unknown): Promise<void> {
    const key = `adherent:${adherentId}`;
    await this.set(key, data, {
      ttl: DEFAULT_TTLS.adherent,
      tags: ['adherents', `adherent:${adherentId}`],
    });
  }

  /**
   * Cache contract data
   */
  async cacheContract(contractId: string, data: unknown): Promise<void> {
    const key = `contract:${contractId}`;
    await this.set(key, data, {
      ttl: DEFAULT_TTLS.contract,
      tags: ['contracts', `contract:${contractId}`],
    });
  }

  /**
   * Invalidate adherent-related caches
   */
  async invalidateAdherent(adherentId: string): Promise<void> {
    await this.invalidateByTag(`adherent:${adherentId}`);
  }

  /**
   * Invalidate contract-related caches
   */
  async invalidateContract(contractId: string): Promise<void> {
    await this.invalidateByTag(`contract:${contractId}`);
  }

  // ============== FETCH HELPERS ==============

  private async fetchActiveProviders(): Promise<unknown[]> {
    const result = await this.env.DB.prepare(`
      SELECT id, name, type, address, phone FROM providers
      WHERE is_active = 1 LIMIT 1000
    `).all();
    return result.results || [];
  }

  private async fetchInsurers(insurerId?: string): Promise<unknown[]> {
    const query = insurerId
      ? `SELECT id, name, code FROM insurers WHERE id = ?`
      : `SELECT id, name, code FROM insurers WHERE is_active = 1`;
    const result = insurerId
      ? await this.env.DB.prepare(query).bind(insurerId).all()
      : await this.env.DB.prepare(query).all();
    return result.results || [];
  }

  private async fetchBaremes(): Promise<unknown[]> {
    const result = await this.env.DB.prepare(`
      SELECT * FROM baremes WHERE is_active = 1
    `).all();
    return result.results || [];
  }

  private async fetchCareTypes(): Promise<string[]> {
    return [
      'consultation',
      'pharmacy',
      'lab',
      'imaging',
      'hospitalization',
      'dental',
      'optical',
      'maternity',
    ];
  }
}
