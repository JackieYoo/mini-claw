/**
 * Session Manager - 会话管理（支持持久化与加密）
 * 学习 OpenClaw 的 session 设计
 */

import { createLogger } from '../utils/logger.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'fs';
import { join } from 'path';
import { encryptSessionData, decryptSessionData } from './security.js';

const logger = createLogger('session');

export function createSessionManager(options = {}) {
  const {
    maxSessions = 500,
    pruneAfterMs = 30 * 24 * 60 * 60 * 1000, // 30天
    maxMessagesPerSession = 100,
    persistDir = null, // 持久化目录
    persistInterval = 60000, // 持久化间隔 1分钟
    autoPruneInterval = 300000, // 自动清理间隔 5分钟
  } = options;
  
  // 会话存储
  const sessions = new Map();
  
  // DM 作用域模式
  const dmScope = options.dmScope || 'per-channel-peer';
  
  // 持久化
  let persistTimer = null;
  let autoPruneTimer = null;
  let sessionFile = null;

  // 操作触发保存的配置
  const SAVE_ON_OPERATIONS = 10; // 每10次操作保存一次
  const SAVE_ON_IMPORTANT_OPS = true; // 重要操作立即保存
  let operationCounter = 0;
  let pendingSave = false;

  if (persistDir) {
    if (!existsSync(persistDir)) {
      mkdirSync(persistDir, { recursive: true });
    }
    sessionFile = join(persistDir, 'sessions.json');

    // 加载持久化的会话
    loadFromDisk();

    // 定期持久化
    persistTimer = setInterval(() => {
      if (pendingSave) {
        saveToDisk();
        pendingSave = false;
        operationCounter = 0;
      }
    }, persistInterval);
  }

  // 定期清理过期会话
  autoPruneTimer = setInterval(() => {
    maybePruneSessions();
  }, autoPruneInterval);
  
  /**
   * 从磁盘加载会话
   */
  function loadFromDisk() {
    if (!sessionFile || !existsSync(sessionFile)) return;
    
    try {
      const encrypted = readFileSync(sessionFile, 'utf-8');
      const encryptionSecret = process.env.SESSION_ENCRYPTION_KEY;
      
      const data = decryptSessionData(encrypted, encryptionSecret);
      if (!data) {
        logger.warn('会话数据解密失败，将使用空会话');
        return;
      }
      
      let loaded = 0;
      
      for (const [key, session] of Object.entries(data)) {
        // 过滤过期会话
        if (Date.now() - session.updatedAt < pruneAfterMs) {
          sessions.set(key, session);
          loaded++;
        }
      }
      
      logger.info(`从磁盘加载 ${loaded} 个会话`);
    } catch (err) {
      logger.warn('加载会话失败:', err.message);
    }
  }
  
  /**
   * 触发保存（操作后调用）
   * @param {boolean} immediate - 是否立即保存
   */
  function triggerSave(immediate = false) {
    if (!sessionFile) return;

    if (immediate) {
      saveToDisk();
      operationCounter = 0;
      pendingSave = false;
    } else {
      operationCounter++;
      pendingSave = true;

      // 每N次操作触发一次保存
      if (operationCounter >= SAVE_ON_OPERATIONS) {
        saveToDisk();
        operationCounter = 0;
        pendingSave = false;
      }
    }
  }

  /**
   * 保存到磁盘（加密）
   */
  function saveToDisk() {
    if (!sessionFile) return;

    try {
      const data = Object.fromEntries(sessions);
      const encryptionSecret = process.env.SESSION_ENCRYPTION_KEY;
      const encrypted = encryptSessionData(data, encryptionSecret);

      writeFileSync(sessionFile, encrypted, { mode: 0o600 }); // 仅所有者可读写

      logger.debug(`会话已持久化: ${sessions.size} 个`);
    } catch (err) {
      logger.warn('持久化会话失败:', err.message);
    }
  }
  
  /**
   * 生成会话 Key
   * 多 Agent 格式: <agentId>:<channel>:<type>:<id>
   * 旧格式兼容: <channel>:<type>:<id>
   */
  function generateSessionKey({ agentId, channel, chatType, chatId, senderId }) {
    // 构建基础 key（不含 agentId）
    let baseKey;
    
    if (chatType === 'group' || chatType === 'channel') {
      baseKey = `${channel}:group:${chatId}`;
    } else {
      switch (dmScope) {
        case 'main':
          baseKey = 'main';
          break;
        case 'per-peer':
          baseKey = `${channel}:dm:${senderId}`;
          break;
        case 'per-channel-peer':
        default:
          baseKey = `${channel}:dm:${chatId}`;
          break;
      }
    }
    
    // 添加 agentId 前缀实现隔离
    // 如果未指定 agentId，使用 'default' 作为默认
    const prefix = agentId || 'default';
    return `${prefix}:${baseKey}`;
  }
  
  /**
   * 解析会话 Key，提取 agentId 和基础 key
   */
  function parseSessionKey(sessionKey) {
    if (!sessionKey) return { agentId: 'default', baseKey: '', fullKey: '' };
    
    const parts = sessionKey.split(':');
    
    // 新格式: agentId:channel:type:id (4+ 部分)
    if (parts.length >= 4) {
      const agentId = parts[0];
      const baseKey = parts.slice(1).join(':');
      return { agentId, baseKey, fullKey: sessionKey };
    }
    
    // 旧格式兼容: 无前缀，直接返回
    return { agentId: 'default', baseKey: sessionKey, fullKey: sessionKey };
  }
  
  /**
   * 获取或创建会话
   */
  function getSession(sessionKey, systemPrompt) {
    maybePruneSessions();
    
    if (!sessions.has(sessionKey)) {
      sessions.set(sessionKey, {
        id: `session_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        key: sessionKey,
        messages: systemPrompt ? [{ role: 'system', content: systemPrompt }] : [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messageCount: 0,
        tokenCount: { input: 0, output: 0 },
        metadata: {},
      });
      logger.debug(`创建新会话: ${sessionKey}`);
    }
    
    const session = sessions.get(sessionKey);
    session.updatedAt = Date.now();
    
    return session;
  }
  
  /**
   * 添加消息到会话
   */
  function addMessage(sessionKey, message, systemPrompt) {
    const session = getSession(sessionKey, systemPrompt);
    
    session.messages.push(message);
    if (message.role === 'user' || message.role === 'system') {
      // 用户消息计入输入 token
    } else if (message.role === 'assistant') {
      session.messageCount++;
    }
    session.updatedAt = Date.now();
    
    // 限制消息数量，保留系统消息
    if (session.messages.length > maxMessagesPerSession) {
      const systemMessages = session.messages.filter(m => m.role === 'system');
      const otherMessages = session.messages.filter(m => m.role !== 'system');
      const keptMessages = otherMessages.slice(-maxMessagesPerSession + systemMessages.length);
      session.messages = [...systemMessages, ...keptMessages];
      logger.debug(`会话 ${sessionKey} 消息数量达到上限，已裁剪`);
    }

    // 触发保存（非立即，累积后保存）
    triggerSave(false);

    return session;
  }
  
  /**
   * 更新 token 统计
   */
  function updateTokenCount(sessionKey, inputTokens, outputTokens) {
    const session = sessions.get(sessionKey);
    if (session) {
      session.tokenCount.input += inputTokens || 0;
      session.tokenCount.output += outputTokens || 0;
    }
  }
  
  /**
   * 重置会话
   */
  function resetSession(sessionKey, systemPrompt) {
    const oldSession = sessions.get(sessionKey);
    sessions.set(sessionKey, {
      id: `session_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      key: sessionKey,
      messages: systemPrompt ? [{ role: 'system', content: systemPrompt }] : [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messageCount: 0,
      tokenCount: { input: 0, output: 0 },
      metadata: oldSession?.metadata || {},
    });
    logger.info(`会话已重置: ${sessionKey}`);

    // 立即保存
    triggerSave(true);

    return getSession(sessionKey, systemPrompt);
  }
  
  /**
   * 删除会话
   */
  function deleteSession(sessionKey) {
    const deleted = sessions.delete(sessionKey);
    if (deleted) {
      logger.info(`会话已删除: ${sessionKey}`);
    }
    return deleted;
  }
  
  /**
   * 清理过期会话
   */
  function maybePruneSessions() {
    const now = Date.now();
    let pruned = 0;
    let memoryBefore = process.memoryUsage().heapUsed;

    // 清理过期会话
    for (const [key, session] of sessions) {
      if (now - session.updatedAt > pruneAfterMs) {
        sessions.delete(key);
        pruned++;
      }
    }

    // 如果会话数超过最大限制，删除最旧的
    if (sessions.size > maxSessions) {
      const entries = Array.from(sessions.entries())
        .sort((a, b) => a[1].updatedAt - b[1].updatedAt);

      const toDelete = entries.slice(0, sessions.size - maxSessions);
      for (const [key] of toDelete) {
        sessions.delete(key);
        pruned++;
      }
    }

    if (pruned > 0) {
      const memoryAfter = process.memoryUsage().heapUsed;
      const memoryFreed = (memoryBefore - memoryAfter) / 1024 / 1024;
      logger.info(`已清理 ${pruned} 个过期会话，释放内存 ${memoryFreed.toFixed(2)}MB`);

      // 如果有持久化，立即保存
      if (sessionFile) {
        saveToDisk();
      }
    }
  }
  
  /**
   * 获取所有会话列表
   */
  function listSessions(limit = 20) {
    return Array.from(sessions.entries())
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .slice(0, limit)
      .map(([key, session]) => ({
        key,
        id: session.id,
        messageCount: session.messageCount,
        tokenCount: session.tokenCount,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      }));
  }
  
  /**
   * 获取会话统计
   */
  function getStats() {
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalMessages = 0;

    for (const session of sessions.values()) {
      totalInputTokens += session.tokenCount?.input || 0;
      totalOutputTokens += session.tokenCount?.output || 0;
      totalMessages += session.messages?.length || 0;
    }

    const memoryUsage = process.memoryUsage();

    return {
      totalSessions: sessions.size,
      maxSessions,
      dmScope,
      totalInputTokens,
      totalOutputTokens,
      totalMessages,
      memory: {
        heapUsed: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2) + 'MB',
        heapTotal: (memoryUsage.heapTotal / 1024 / 1024).toFixed(2) + 'MB',
        external: (memoryUsage.external / 1024 / 1024).toFixed(2) + 'MB',
      },
    };
  }
  
  /**
   * 关闭（保存数据）
   */
  function close() {
    if (persistTimer) {
      clearInterval(persistTimer);
      persistTimer = null;
    }
    if (autoPruneTimer) {
      clearInterval(autoPruneTimer);
      autoPruneTimer = null;
    }
    // 保存任何待保存的数据
    if (pendingSave) {
      saveToDisk();
    }
  }
  
  /**
   * 按 Agent 获取会话统计
   */
  function getStatsByAgent() {
    const stats = {};
    
    for (const [key, session] of sessions) {
      const { agentId } = parseSessionKey(key);
      if (!stats[agentId]) {
        stats[agentId] = {
          sessionCount: 0,
          messageCount: 0,
          inputTokens: 0,
          outputTokens: 0,
        };
      }
      stats[agentId].sessionCount++;
      stats[agentId].messageCount += session.messages?.length || 0;
      stats[agentId].inputTokens += session.tokenCount?.input || 0;
      stats[agentId].outputTokens += session.tokenCount?.output || 0;
    }
    
    return stats;
  }
  
  /**
   * 获取指定 Agent 的会话列表
   */
  function listSessionsByAgent(agentId, limit = 20) {
    return Array.from(sessions.entries())
      .filter(([key]) => {
        const parsed = parseSessionKey(key);
        return parsed.agentId === agentId;
      })
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .slice(0, limit)
      .map(([key, session]) => ({
        key,
        baseKey: parseSessionKey(key).baseKey,
        id: session.id,
        messageCount: session.messageCount,
        tokenCount: session.tokenCount,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      }));
  }
  
  /**
   * 删除指定 Agent 的所有会话
   */
  function deleteSessionsByAgent(agentId) {
    let deleted = 0;
    for (const [key] of sessions) {
      const { agentId: keyAgentId } = parseSessionKey(key);
      if (keyAgentId === agentId) {
        sessions.delete(key);
        deleted++;
      }
    }
    if (deleted > 0) {
      logger.info(`已删除 Agent ${agentId} 的 ${deleted} 个会话`);
      triggerSave(true);
    }
    return deleted;
  }
  
  return {
    generateSessionKey,
    parseSessionKey,
    getSession,
    addMessage,
    updateTokenCount,
    resetSession,
    deleteSession,
    listSessions,
    getStats,
    getStatsByAgent,
    listSessionsByAgent,
    deleteSessionsByAgent,
    saveToDisk,
    close,
  };
}
