/**
 * Feishu Reaction Manager - Enhanced reaction system
 * 
 * 表情回复管理器
 * 
 * Features:
 * - 灵活的表情配置
 * - 表情回复统计
 * - 错误容错
 * - 详细日志
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger('feishu-reaction');

/**
 * 表情类型映射
 */
export const EMOJI_TYPES = {
  'THUMBSUP': '👍',
  'HEART': '❤️',
  'LAUGH': '😂',
  'OK': '👌',
  'WOW': '😮',
  'SORROW': '😢',
  'ANGRY': '😡',
  'FIRE': '🔥',
  'STAR': '⭐',
  'CLAP': '👏',
  'THINK': '🤔',
  'ROCKET': '🚀',
};

/**
 * 表情回复配置
 */
export const DEFAULT_REACTION_CONFIG = {
  enabled: true,
  
  // 各阶段表情
  emojis: {
    received: 'THUMBSUP',      // 收到消息
    processing: 'WOW',          // 处理中
    success: 'OK',              // 成功
    error: 'SORROW',            // 失败
  },
  
  // 各场景开关
  scenarios: {
    showReceived: true,         // 显示收到消息的表情
    showProcessing: true,       // 显示处理中的表情
    showResult: true,           // 显示结果表情
  },
  
  // 各类型消息开关
  replyOn: {
    mention: true,              // 被 @ 时
    directMessage: true,        // 私聊时
    command: false,             // 命令消息
  },
  
  // 容错配置
  retryOnError: true,           // 失败时重试
  maxRetries: 2,                // 最大重试次数
  retryDelay: 500,              // 重试延迟(ms)
};

/**
 * 表情回复管理器
 */
export class ReactionManager {
  constructor(config, client, domain) {
    this.config = { ...DEFAULT_REACTION_CONFIG, ...config };
    this.client = client;
    this.domain = domain;
    
    // 统计信息
    this.stats = {
      total: 0,
      success: 0,
      failed: 0,
      byType: {},
    };
    
    // 表情缓存（避免重复添加）
    this.reactionCache = new Map();
  }
  
  /**
   * 添加表情回复
   */
  async add(messageId, emojiType, options = {}) {
    if (!this.config.enabled) {
      return { success: false, reason: 'disabled' };
    }
    
    const emoji = EMOJI_TYPES[emojiType] || emojiType;
    const cacheKey = `${messageId}:${emojiType}`;
    
    // 检查缓存（避免重复添加）
    if (this.reactionCache.has(cacheKey)) {
      logger.debug(`表情已存在，跳过: ${emoji}`);
      return { success: true, cached: true };
    }
    
    this.stats.total++;
    
    try {
      // 添加表情
      await this._addReactionWithRetry(messageId, emojiType, options);
      
      // 更新统计
      this.stats.success++;
      this.stats.byType[emojiType] = (this.stats.byType[emojiType] || 0) + 1;
      
      // 添加到缓存
      this.reactionCache.set(cacheKey, Date.now());
      
      logger.info(`✅ 添加表情回复: ${emoji} (消息ID: ${messageId.substring(0, 20)}...)`);
      
      return { success: true, emoji: emojiType };
      
    } catch (error) {
      this.stats.failed++;
      
      logger.error(`❌ 添加表情回复失败: ${emoji}`, {
        error: error.message,
        messageId: messageId.substring(0, 20),
      });
      
      return { success: false, error: error.message };
    }
  }
  
  /**
   * 带重试的表情添加
   */
  async _addReactionWithRetry(messageId, emojiType, options = {}) {
    const maxRetries = this.config.retryOnError ? this.config.maxRetries : 1;
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.client.im.messageReaction.create({
          path: {
            message_id: messageId,
          },
          params: {
            user_id_type: 'open_id',
          },
          data: {
            reaction_type: {
              emoji_type: emojiType
            }
          }
        });
        
        if (result.code === 0) {
          return result;
        }
        
        // API 返回错误
        throw new Error(result.msg || `API error: ${result.code}`);
        
      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries) {
          logger.debug(`表情添加失败，重试 ${attempt}/${maxRetries}`, {
            emoji: emojiType,
            error: error.message,
          });
          
          await this._delay(this.config.retryDelay);
        }
      }
    }
    
    throw lastError;
  }
  
  /**
   * 移除表情回复
   */
  async remove(messageId, emojiType) {
    try {
      const result = await this.client.im.messageReaction.delete({
        path: {
          message_id: messageId,
        },
        params: {
          user_id_type: 'open_id',
        },
        data: {
          reaction_type: {
            emoji_type: emojiType
          }
        }
      });
      
      // 从缓存移除
      const cacheKey = `${messageId}:${emojiType}`;
      this.reactionCache.delete(cacheKey);
      
      if (result.code === 0) {
        const emoji = EMOJI_TYPES[emojiType] || emojiType;
        logger.debug(`移除表情回复: ${emoji}`);
      }
      
      return result;
      
    } catch (error) {
      logger.error('移除表情回复异常:', error.message);
      return { code: -1, msg: error.message };
    }
  }
  
  /**
   * 获取消息的表情列表
   */
  async list(messageId) {
    try {
      const result = await this.client.im.messageReaction.list({
        path: {
          message_id: messageId,
        },
        params: {
          user_id_type: 'open_id',
        },
      });
      
      return result.code === 0 ? (result.data?.items || []) : [];
      
    } catch (error) {
      logger.error('获取表情列表异常:', error.message);
      return [];
    }
  }
  
  /**
   * 判断是否应该回复表情
   */
  shouldReact(context) {
    if (!this.config.enabled) {
      return false;
    }
    
    const { chatType, botMentioned, isCommand } = context;
    
    // 私聊
    if (chatType === 'p2p' && this.config.replyOn.directMessage) {
      return true;
    }
    
    // 群聊 @
    if (chatType === 'group' && botMentioned && this.config.replyOn.mention) {
      return true;
    }
    
    // 命令消息
    if (isCommand && this.config.replyOn.command) {
      return true;
    }
    
    return false;
  }
  
  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.total > 0 
        ? ((this.stats.success / this.stats.total) * 100).toFixed(2) + '%'
        : '0%',
    };
  }
  
  /**
   * 清理过期缓存
   */
  cleanCache(maxAge = 3600000) {
    const now = Date.now();
    for (const [key, timestamp] of this.reactionCache) {
      if (now - timestamp > maxAge) {
        this.reactionCache.delete(key);
      }
    }
  }
  
  /**
   * 延迟函数
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 创建表情回复管理器
 */
export function createReactionManager(config, client, domain) {
  return new ReactionManager(config, client, domain);
}
