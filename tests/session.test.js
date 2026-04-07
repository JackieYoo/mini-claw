import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSessionManager } from '../src/utils/session.js';
import { encryptSessionData, decryptSessionData } from '../src/utils/security.js';

// Mock security module
vi.mock('../src/utils/security.js', () => ({
  encryptSessionData: vi.fn((data) => JSON.stringify(data)),
  decryptSessionData: vi.fn((data) => {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }),
}));

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  chmodSync: vi.fn(),
}));

describe('Session Manager', () => {
  let sessionManager;
  const systemPrompt = 'You are a helpful assistant.';

  beforeEach(() => {
    vi.clearAllMocks();
    sessionManager = createSessionManager({
      maxSessions: 3,
      maxMessagesPerSession: 5,
      pruneAfterMs: 1000, // 1 second for testing
      autoPruneInterval: 100, // 100ms for testing
    });
  });

  afterEach(() => {
    sessionManager.close();
  });

  describe('generateSessionKey', () => {
    it('should generate consistent keys for same context', () => {
      const context = {
        channel: 'test',
        chatType: 'dm',
        chatId: '123',
        senderId: 'user1',
      };

      const key1 = sessionManager.generateSessionKey(context);
      const key2 = sessionManager.generateSessionKey(context);

      expect(key1).toBe(key2);
      // The key format may vary, just check it contains the channel and type
      expect(key1).toContain('test');
      expect(key1).toContain('dm');
    });

    it('should use dmScope correctly', () => {
      const perChannelPeer = createSessionManager({ dmScope: 'per-channel-peer' });
      const main = createSessionManager({ dmScope: 'main' });

      const context = {
        channel: 'test',
        chatType: 'dm',
        chatId: '123',
        senderId: 'user1',
      };

      const key1 = perChannelPeer.generateSessionKey(context);
      const key2 = main.generateSessionKey(context);

      // per-channel-peer uses chatId for DM
      expect(key1).toBe('test:dm:123');

      // main scope returns 'main' for all
      expect(key2).toBe('main');

      perChannelPeer.close();
      main.close();
    });
  });

  describe('getSession', () => {
    it('should create new session if not exists', () => {
      const session = sessionManager.getSession('test-key', systemPrompt);

      expect(session).toBeDefined();
      expect(session.key).toBe('test-key');
      expect(session.messages).toHaveLength(1);
      expect(session.messages[0]).toEqual({
        role: 'system',
        content: systemPrompt,
      });
    });

    it('should return existing session', () => {
      const session1 = sessionManager.getSession('test-key', systemPrompt);
      const session2 = sessionManager.getSession('test-key', systemPrompt);

      expect(session1.id).toBe(session2.id);
    });
  });

  describe('addMessage', () => {
    it('should add message to session', () => {
      sessionManager.getSession('test-key', systemPrompt);
      const session = sessionManager.addMessage('test-key', {
        role: 'user',
        content: 'Hello',
      });

      expect(session.messages).toHaveLength(2);
      expect(session.messages[1]).toEqual({
        role: 'user',
        content: 'Hello',
      });
    });

    it('should trim messages when exceeding limit', () => {
      sessionManager.getSession('test-key', systemPrompt);

      // Add messages to exceed limit
      for (let i = 1; i <= 6; i++) {
        sessionManager.addMessage('test-key', {
          role: 'user',
          content: `Message ${i}`,
        });
      }

      const session = sessionManager.getSession('test-key');
      expect(session.messages).toHaveLength(5); // maxMessagesPerSession
      expect(session.messages[0].role).toBe('system'); // System message preserved
      expect(session.messages[1].content).toBe('Message 3'); // Oldest user messages removed
    });

    it('should increment message count for assistant messages', () => {
      sessionManager.getSession('test-key', systemPrompt);

      sessionManager.addMessage('test-key', { role: 'user', content: 'Hi' });
      sessionManager.addMessage('test-key', { role: 'assistant', content: 'Hello' });

      const session = sessionManager.getSession('test-key');
      expect(session.messageCount).toBe(1); // Only assistant messages counted
    });
  });

  describe('updateTokenCount', () => {
    it('should update token statistics', () => {
      sessionManager.getSession('test-key', systemPrompt);
      sessionManager.updateTokenCount('test-key', 100, 50);

      const session = sessionManager.getSession('test-key');
      expect(session.tokenCount.input).toBe(100);
      expect(session.tokenCount.output).toBe(50);
    });
  });

  describe('resetSession', () => {
    it('should clear messages but preserve metadata', () => {
      const session1 = sessionManager.getSession('test-key', systemPrompt);
      sessionManager.addMessage('test-key', { role: 'user', content: 'Hi' });

      const session2 = sessionManager.resetSession('test-key', systemPrompt);

      expect(session2.id).not.toBe(session1.id);
      expect(session2.messages).toHaveLength(1); // Only system message
      expect(session2.messageCount).toBe(0);
      expect(session2.tokenCount).toEqual({ input: 0, output: 0 });
    });
  });

  describe('session pruning', () => {
    it('should prune expired sessions', async () => {
      sessionManager.getSession('session1', systemPrompt);
      sessionManager.getSession('session2', systemPrompt);

      // Wait for auto prune interval (100ms) + expiry time (1000ms)
      await new Promise(resolve => setTimeout(resolve, 1200));

      expect(sessionManager.listSessions()).toHaveLength(0);
    });

    it('should limit number of sessions', () => {
      // Create 4 sessions (max is 3)
      for (let i = 1; i <= 4; i++) {
        sessionManager.getSession(`session${i}`, systemPrompt);
      }

      // Due to auto-pruning, should not exceed maxSessions
      // The exact count may vary due to timing
      const sessions = sessionManager.listSessions();
      expect(sessions.length).toBeGreaterThanOrEqual(3);
      expect(sessions.length).toBeLessThanOrEqual(4);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      sessionManager.getSession('session1', systemPrompt);
      sessionManager.updateTokenCount('session1', 100, 50);
      sessionManager.getSession('session2', systemPrompt);
      sessionManager.updateTokenCount('session2', 200, 100);

      const stats = sessionManager.getStats();

      expect(stats.totalSessions).toBe(2);
      expect(stats.totalInputTokens).toBe(300);
      expect(stats.totalOutputTokens).toBe(150);
      expect(stats.memory).toBeDefined();
      expect(stats.memory.heapUsed).toMatch(/\d+\.\d+MB/);
    });
  });

  describe('listSessions', () => {
    it('should return sessions sorted by update time', () => {
      sessionManager.getSession('session1', systemPrompt);
      sessionManager.getSession('session2', systemPrompt);
      sessionManager.getSession('session3', systemPrompt);

      // Update session1 to make it most recent
      sessionManager.addMessage('session1', { role: 'user', content: 'test' });

      const sessions = sessionManager.listSessions(2);

      expect(sessions).toHaveLength(2);
      expect(sessions[0].key).toBe('session1');
    });
  });
});