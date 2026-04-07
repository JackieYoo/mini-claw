import { describe, it, expect, beforeEach, vi } from 'vitest';
import { retry, createRetry, shouldRetryHttp, shouldRetryApi, withRetry } from '../src/utils/retry.js';

describe('Retry Module', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('retry function', () => {
    it('should succeed on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await retry(fn, { maxRetries: 3 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');

      const promise = retry(fn, { maxRetries: 3, initialDelay: 100, jitter: false });

      // First attempt fails immediately
      await vi.runOnlyPendingTimersAsync();

      // Second attempt after 100ms
      await vi.advanceTimersByTimeAsync(100);

      // Third attempt after 200ms (exponential)
      await vi.advanceTimersByTimeAsync(200);

      const result = await promise;
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries', async () => {
      const error = new Error('persistent failure');
      const fn = vi.fn().mockRejectedValue(error);

      const promise = retry(fn, { maxRetries: 2, initialDelay: 100, jitter: false });

      // Run all timers
      await vi.runAllTimersAsync();

      await expect(promise).rejects.toThrow('persistent failure');
      expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it('should respect shouldRetry condition', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('should not retry'));
      const shouldRetry = vi.fn().mockReturnValue(false);

      await expect(
        retry(fn, { maxRetries: 3, shouldRetry })
      ).rejects.toThrow('should not retry');

      expect(fn).toHaveBeenCalledTimes(1);
      expect(shouldRetry).toHaveBeenCalledTimes(1);
    });

    it('should apply exponential backoff', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const promise = retry(fn, {
        maxRetries: 2,
        initialDelay: 100,
        factor: 2,
        jitter: false,
      });

      // Wait for all retries to complete
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should respect maxDelay', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const promise = retry(fn, {
        maxRetries: 2,
        initialDelay: 1000,
        factor: 10,
        maxDelay: 2000,
        jitter: false,
      });

      // Wait for all retries to complete
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('shouldRetryHttp', () => {
    it('should retry network errors', () => {
      expect(shouldRetryHttp({ code: 'ECONNREFUSED' })).toBe(true);
      expect(shouldRetryHttp({ code: 'ENOTFOUND' })).toBe(true);
      expect(shouldRetryHttp({ code: 'ETIMEDOUT' })).toBe(true);
      expect(shouldRetryHttp({ code: 'ECONNRESET' })).toBe(true);
    });

    it('should retry 5xx errors', () => {
      expect(shouldRetryHttp({ status: 500 })).toBe(true);
      expect(shouldRetryHttp({ status: 502 })).toBe(true);
      expect(shouldRetryHttp({ status: 503 })).toBe(true);
    });

    it('should retry 429 and 408', () => {
      expect(shouldRetryHttp({ status: 429 })).toBe(true);
      expect(shouldRetryHttp({ status: 408 })).toBe(true);
    });

    it('should not retry 4xx errors except 429 and 408', () => {
      expect(shouldRetryHttp({ status: 400 })).toBe(false);
      expect(shouldRetryHttp({ status: 401 })).toBe(false);
      expect(shouldRetryHttp({ status: 404 })).toBe(false);
    });
  });

  describe('shouldRetryApi', () => {
    it('should not retry auth errors', () => {
      expect(shouldRetryApi({ status: 401 })).toBe(false);
      expect(shouldRetryApi({ code: 'invalid_api_key' })).toBe(false);
    });

    it('should not retry bad request errors', () => {
      expect(shouldRetryApi({ status: 400 })).toBe(false);
      expect(shouldRetryApi({ type: 'invalid_request_error' })).toBe(false);
      expect(shouldRetryApi({ status: 404 })).toBe(false);
    });

    it('should retry server errors', () => {
      expect(shouldRetryApi({ status: 500 })).toBe(true);
      expect(shouldRetryApi({ code: 'ECONNREFUSED' })).toBe(true);
    });
  });

  describe('withRetry decorator', () => {
    it('should wrap function with retry logic', async () => {
      let attempt = 0;
      const originalFn = vi.fn().mockImplementation(async () => {
        attempt++;
        if (attempt < 3) throw new Error('fail');
        return 'success';
      });

      const retriedFn = withRetry(originalFn, {
        maxRetries: 3,
        initialDelay: 10,
        jitter: false,
      });

      const promise = retriedFn();
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
      expect(originalFn).toHaveBeenCalledTimes(3);
    });

    it('should preserve function context', async () => {
      const obj = {
        value: 42,
        async getValue() {
          return this.value;
        }
      };

      obj.getValue = withRetry(obj.getValue);
      const result = await obj.getValue();

      expect(result).toBe(42);
    });
  });

  describe('createRetry', () => {
    it('should create retry function with default options', async () => {
      const customRetry = createRetry({
        maxRetries: 1,
        initialDelay: 50,
      });

      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const promise = customRetry(fn);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });
});