/**
 * Cache Manager - Tool execution result caching
 * 
 * Features:
 * - In-memory cache with TTL
 * - LRU eviction
 * - Cache statistics
 * - Namespace support
 */

import { createLogger } from './logger.js';
import { createHash } from 'crypto';

const logger = createLogger('cache');

/**
 * LRU Cache Implementation
 */
class LRUCache {
  constructor(maxSize = 1000, defaultTTL = 300000) {
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
    };
  }
  
  /**
   * Get item from cache
   */
  get(key) {
    const item = this.cache.get(key);
    
    if (!item) {
      this.stats.misses++;
      return null;
    }
    
    // Check TTL
    if (item.expires && Date.now() > item.expires) {
      this.delete(key);
      this.stats.misses++;
      return null;
    }
    
    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, item);
    
    this.stats.hits++;
    return item.value;
  }
  
  /**
   * Set item in cache
   */
  set(key, value, ttl = this.defaultTTL) {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evict();
    }
    
    const item = {
      value,
      expires: ttl ? Date.now() + ttl : null,
      createdAt: Date.now(),
    };
    
    this.cache.set(key, item);
    this.stats.size = this.cache.size;
    
    logger.debug(`Cache set: ${key.substring(0, 50)}...`);
  }
  
  /**
   * Delete item from cache
   */
  delete(key) {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.stats.size = this.cache.size;
    }
    return deleted;
  }
  
  /**
   * Clear cache
   */
  clear() {
    this.cache.clear();
    this.stats.size = 0;
  }
  
  /**
   * Evict least recently used item
   */
  evict() {
    // Delete first item (oldest in LRU)
    const firstKey = this.cache.keys().next().value;
    if (firstKey) {
      this.cache.delete(firstKey);
      this.stats.evictions++;
      this.stats.size = this.cache.size;
      logger.debug(`Cache evicted: ${firstKey.substring(0, 50)}...`);
    }
  }
  
  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) + '%' : '0%',
    };
  }
  
  /**
   * Clean expired items
   */
  cleanExpired() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, item] of this.cache.entries()) {
      if (item.expires && now > item.expires) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      this.stats.size = this.cache.size;
      logger.info(`Cleaned ${cleaned} expired cache items`);
    }
    
    return cleaned;
  }
}

/**
 * Tool Cache Manager
 */
export class ToolCache {
  constructor(options = {}) {
    this.cache = new LRUCache(
      options.maxSize || 1000,
      options.defaultTTL || 300000 // 5 minutes
    );
    
    // Clean expired items every 5 minutes
    this.cleanInterval = setInterval(() => {
      this.cache.cleanExpired();
    }, 300000);
  }
  
  /**
   * Generate cache key
   * 对于大参数对象使用哈希，避免 key 过长影响性能
   */
  generateKey(toolName, args) {
    const MAX_KEY_LENGTH = 200;
    const argsStr = JSON.stringify(args);

    // 如果参数较短，直接使用字符串
    if (argsStr.length <= MAX_KEY_LENGTH) {
      return `${toolName}:${argsStr}`;
    }

    // 对于大参数，使用哈希
    const hash = createHash('md5').update(argsStr).digest('hex').slice(0, 16);
    // 保留部分前缀用于可读性
    const prefix = argsStr.slice(0, 50);
    return `${toolName}:${prefix}...:${hash}`;
  }
  
  /**
   * Get cached result
   */
  get(toolName, args) {
    const key = this.generateKey(toolName, args);
    return this.cache.get(key);
  }
  
  /**
   * Set cache result
   */
  set(toolName, args, result, ttl) {
    const key = this.generateKey(toolName, args);
    this.cache.set(key, result, ttl);
  }
  
  /**
   * Get or compute
   */
  async getOrCompute(toolName, args, computeFn, ttl) {
    const cached = this.get(toolName, args);
    if (cached !== null) {
      logger.debug(`Cache hit for tool: ${toolName}`);
      return cached;
    }
    
    logger.debug(`Cache miss for tool: ${toolName}`);
    const result = await computeFn();
    this.set(toolName, args, result, ttl);
    return result;
  }
  
  /**
   * Invalidate tool cache
   */
  invalidate(toolName) {
    let count = 0;
    for (const key of this.cache.cache.keys()) {
      if (key.startsWith(`${toolName}:`)) {
        this.cache.delete(key);
        count++;
      }
    }
    logger.info(`Invalidated ${count} cache items for tool: ${toolName}`);
    return count;
  }
  
  /**
   * Get statistics
   */
  getStats() {
    return this.cache.getStats();
  }
  
  /**
   * Clear all cache
   */
  clear() {
    this.cache.clear();
  }
  
  /**
   * Close cache
   */
  close() {
    if (this.cleanInterval) {
      clearInterval(this.cleanInterval);
    }
    this.clear();
  }
}

/**
 * Session Cache Manager
 */
export class SessionCache {
  constructor(options = {}) {
    this.cache = new LRUCache(
      options.maxSize || 500,
      options.defaultTTL || 86400000 // 1 day
    );
  }
  
  /**
   * Get session
   */
  get(sessionKey) {
    return this.cache.get(sessionKey);
  }
  
  /**
   * Set session
   */
  set(sessionKey, session, ttl) {
    this.cache.set(sessionKey, session, ttl);
  }
  
  /**
   * Delete session
   */
  delete(sessionKey) {
    return this.cache.delete(sessionKey);
  }
  
  /**
   * Get statistics
   */
  getStats() {
    return this.cache.getStats();
  }
}

/**
 * Create global cache instance
 */
export function createCache(options = {}) {
  return new ToolCache(options);
}

// Export classes
export { LRUCache };
