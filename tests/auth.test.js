import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createAuth, generateApiKey, validateApiKeyFormat } from '../src/utils/auth.js';

describe('Auth Module', () => {
  let mockRequest, mockReply;

  beforeEach(() => {
    mockRequest = {
      headers: {},
      query: {},
      url: '/test',
      routerPath: '/test',
    };

    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
      sent: false,
    };
  });

  describe('generateApiKey', () => {
    it('should generate a valid API key', () => {
      const key = generateApiKey();
      expect(key).toMatch(/^sk-[A-Za-z0-9_-]{40,}$/);
    });

    it('should generate unique keys', () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();
      expect(key1).not.toBe(key2);
    });
  });

  describe('validateApiKeyFormat', () => {
    it('should validate correct API key format', () => {
      const validKey = 'sk-1234567890abcdefghijklmnopqrstuvwxyz1234';
      expect(validateApiKeyFormat(validKey)).toBe(true);
    });

    it('should reject invalid formats', () => {
      expect(validateApiKeyFormat('')).toBe(false);
      expect(validateApiKeyFormat(null)).toBe(false);
      expect(validateApiKeyFormat('invalid')).toBe(false);
      expect(validateApiKeyFormat('sk-short')).toBe(false);
    });
  });

  describe('createAuth middleware', () => {
    it('should allow public paths without authentication', async () => {
      const auth = createAuth({
        publicPaths: ['/health', '/test'],
        apiKeys: ['sk-test-key'],
      });

      await auth(mockRequest, mockReply);
      expect(mockReply.status).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });

    it('should require authentication for non-public paths', async () => {
      const auth = createAuth({
        publicPaths: ['/health'],
        apiKeys: ['sk-test-key'],
      });

      mockRequest.url = '/api/data';
      mockRequest.routerPath = '/api/data';

      await auth(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'API key is required',
      });
    });

    it('should accept valid API key in header', async () => {
      const auth = createAuth({
        publicPaths: [],
        apiKeys: ['sk-test-key-123'],
      });

      mockRequest.headers['x-api-key'] = 'sk-test-key-123';

      await auth(mockRequest, mockReply);

      expect(mockRequest.auth).toEqual({
        type: 'apikey',
        apiKey: 'sk-test-...',
      });
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should accept valid API key in query parameter', async () => {
      const auth = createAuth({
        publicPaths: [],
        apiKeys: ['sk-test-key-123'],
      });

      mockRequest.query.api_key = 'sk-test-key-123';

      await auth(mockRequest, mockReply);

      expect(mockRequest.auth).toEqual({
        type: 'apikey',
        apiKey: 'sk-test-...',
      });
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should reject invalid API key', async () => {
      const auth = createAuth({
        publicPaths: [],
        apiKeys: ['sk-valid-key'],
      });

      mockRequest.headers['x-api-key'] = 'sk-invalid-key';

      await auth(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid API key',
      });
    });

    it('should pass through when no API keys are configured', async () => {
      const auth = createAuth({
        publicPaths: [],
        apiKeys: [],
      });

      mockRequest.url = '/api/data';

      await auth(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });
  });
});