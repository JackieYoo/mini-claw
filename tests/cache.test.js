import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createCache, ToolCache, LRUCache } from '../src/utils/cache.js';

describe('Cache Module', () => {
  describe('LRUCache', () => {
    let cache;

    beforeEach(() => {
      cache = new LRUCache(3, 1000); // maxSize: 3, TTL: 1s
    });

    it('should store and retrieve values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return null for missing keys', () => {
      expect(cache.get('missing')).toBe(null);
    });

    it('should evict LRU item when capacity is reached', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // Access key1 to make it more recently used
      cache.get('key1');

      // Add key4, should evict key2
      cache.set('key4', 'value4');

      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBe(null); // evicted
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
    });

    it('should respect TTL', async () => {
      cache.set('key1', 'value1', 100); // 100ms TTL
      expect(cache.get('key1')).toBe('value1');

      await new Promise(resolve => setTimeout(resolve, 150));
      expect(cache.get('key1')).toBe(null);
    });

    it('should track statistics', () => {
      cache.set('key1', 'value1');
      cache.get('key1'); // hit
      cache.get('key2'); // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe('50.00%');
    });

    it('should clean expired items', async () => {
      cache.set('key1', 'value1', 100);
      cache.set('key2', 'value2', 200);
      cache.set('key3', 'value3'); // no expiry

      await new Promise(resolve => setTimeout(resolve, 150));

      const cleaned = cache.cleanExpired();
      expect(cleaned).toBe(1); // key1 expired
      expect(cache.get('key1')).toBe(null);
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
    });
  });

  describe('ToolCache', () => {
    let toolCache;

    beforeEach(() => {
      toolCache = new ToolCache({ maxSize: 10, defaultTTL: 1000 });
    });

    afterEach(() => {
      toolCache.close();
    });

    it('should generate consistent cache keys', () => {
      const key1 = toolCache.generateKey('tool1', { arg: 'value' });
      const key2 = toolCache.generateKey('tool1', { arg: 'value' });
      const key3 = toolCache.generateKey('tool1', { arg: 'different' });

      expect(key1).toBe(key2);
      expect(key1).not.toBe(key3);
    });

    it('should cache tool results', () => {
      const args = { input: 'test' };
      const result = { output: 'result' };

      toolCache.set('myTool', args, result);
      expect(toolCache.get('myTool', args)).toEqual(result);
    });

    it('should use getOrCompute correctly', async () => {
      let computeCount = 0;
      const computeFn = async () => {
        computeCount++;
        return { result: 'computed' };
      };

      const result1 = await toolCache.getOrCompute('tool', { arg: 1 }, computeFn);
      const result2 = await toolCache.getOrCompute('tool', { arg: 1 }, computeFn);

      expect(result1).toEqual({ result: 'computed' });
      expect(result2).toEqual({ result: 'computed' });
      expect(computeCount).toBe(1); // computed only once
    });

    it('should invalidate tool cache', () => {
      toolCache.set('tool1', { arg: 1 }, 'result1');
      toolCache.set('tool1', { arg: 2 }, 'result2');
      toolCache.set('tool2', { arg: 1 }, 'result3');

      const invalidated = toolCache.invalidate('tool1');

      expect(invalidated).toBe(2);
      expect(toolCache.get('tool1', { arg: 1 })).toBe(null);
      expect(toolCache.get('tool1', { arg: 2 })).toBe(null);
      expect(toolCache.get('tool2', { arg: 1 })).toBe('result3');
    });

    it('should provide statistics', () => {
      toolCache.set('tool', { arg: 1 }, 'result');
      toolCache.get('tool', { arg: 1 }); // hit
      toolCache.get('tool', { arg: 2 }); // miss

      const stats = toolCache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });
  });
});