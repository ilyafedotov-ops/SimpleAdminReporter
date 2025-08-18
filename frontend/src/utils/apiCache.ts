/* eslint-disable @typescript-eslint/no-explicit-any */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

interface CacheConfig {
  defaultTTL: number; // in seconds
  maxSize: number;
  enablePersistence: boolean;
}

class ApiCache {
  private cache = new Map<string, CacheEntry<any>>();
  private config: CacheConfig;
  private storageKey = 'api_cache';

  constructor(config?: Partial<CacheConfig>) {
    this.config = {
      defaultTTL: 300, // 5 minutes default
      maxSize: 100,
      enablePersistence: true,
      ...config
    };

    if (this.config.enablePersistence) {
      this.loadFromStorage();
    }
  }

  /**
   * Get data from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Check if expired
    const age = (Date.now() - entry.timestamp) / 1000; // in seconds
    if (age > entry.ttl) {
      this.cache.delete(key);
      this.saveToStorage();
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set data in cache
   */
  set<T>(key: string, data: T, ttl?: number): void {
    // Enforce max size
    if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
      // Remove oldest entry
      const oldestKey = this.findOldestKey();
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.config.defaultTTL
    });

    if (this.config.enablePersistence) {
      this.saveToStorage();
    }
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const data = this.get(key);
    return data !== null;
  }

  /**
   * Delete from cache
   */
  delete(key: string): void {
    this.cache.delete(key);
    if (this.config.enablePersistence) {
      this.saveToStorage();
    }
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
    if (this.config.enablePersistence) {
      localStorage.removeItem(this.storageKey);
    }
  }

  /**
   * Clear cache entries matching a pattern
   */
  clearPattern(pattern: string | RegExp): void {
    const keysToDelete: string[] = [];
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    
    this.cache.forEach((_, key) => {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => this.cache.delete(key));
    
    if (keysToDelete.length > 0 && this.config.enablePersistence) {
      this.saveToStorage();
    }
  }

  /**
   * Clear expired entries
   */
  clearExpired(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    this.cache.forEach((entry, key) => {
      const age = (now - entry.timestamp) / 1000;
      if (age > entry.ttl) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.cache.delete(key));
    
    if (keysToDelete.length > 0 && this.config.enablePersistence) {
      this.saveToStorage();
    }
  }

  /**
   * Find oldest cache entry
   */
  private findOldestKey(): string | null {
    let oldestKey: string | null = null;
    let oldestTimestamp = Date.now();

    this.cache.forEach((entry, key) => {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestKey = key;
      }
    });

    return oldestKey;
  }

  /**
   * Save cache to localStorage
   */
  private saveToStorage(): void {
    try {
      const serialized = JSON.stringify({
        entries: Array.from(this.cache.entries()),
        timestamp: Date.now()
      });
      localStorage.setItem(this.storageKey, serialized);
    } catch (error) {
      console.warn('Failed to save cache to storage:', error);
    }
  }

  /**
   * Load cache from localStorage
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) return;

      const { entries } = JSON.parse(stored);
      this.cache = new Map(entries);
      
      // Clear expired entries immediately
      this.clearExpired();
    } catch (error) {
      console.warn('Failed to load cache from storage:', error);
      localStorage.removeItem(this.storageKey);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    let expiredCount = 0;
    const now = Date.now();

    this.cache.forEach(entry => {
      const age = (now - entry.timestamp) / 1000;
      if (age > entry.ttl) {
        expiredCount++;
      }
    });

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      expiredCount,
      activeCount: this.cache.size - expiredCount
    };
  }
}

// Create singleton instances for different cache purposes
export const schemaCache = new ApiCache({
  defaultTTL: 3600, // 1 hour for schemas
  maxSize: 50
});

export const templateCache = new ApiCache({
  defaultTTL: 600, // 10 minutes for templates
  maxSize: 100
});

export const queryCache = new ApiCache({
  defaultTTL: 300, // 5 minutes for queries
  maxSize: 200
});

// Helper function to create cache key
export function createCacheKey(prefix: string, params?: Record<string, unknown>): string {
  if (!params || Object.keys(params).length === 0) {
    return prefix;
  }
  
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}:${params[key]}`)
    .join('|');
  
  return `${prefix}:${sortedParams}`;
}

// Clear all caches
export function clearAllCaches(): void {
  schemaCache.clear();
  templateCache.clear();
  queryCache.clear();
}