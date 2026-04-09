/**
 * Channel Manager - Manage message channels
 * 支持多 Agent 架构
 */

import { createFeishuChannel } from './feishu.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('channels');

export function createChannelManager(config) {
  const handlers = new Map();
  let agentFactory = null;
  
  // 初始化飞书通道
  if (config.feishu?.enabled) {
    const feishu = createFeishuChannel(config.feishu);
    handlers.set('feishu', feishu);
    logger.info('飞书通道已启用（长连接模式）');
  }
  
  // 连接所有通道（接收 agentFactory 替代单个 agent）
  async function connectAll(factory) {
    agentFactory = factory;
    
    for (const [name, handler] of handlers) {
      if (handler.connect) {
        logger.info(`连接通道: ${name}`);
        try {
          await handler.connect(factory);
        } catch (err) {
          logger.error(`连接通道 ${name} 失败:`, err.message);
          // 继续连接其他通道
        }
      }
    }
  }
  
  function getHandler(channelName) {
    return handlers.get(channelName);
  }
  
  function getChannels() {
    return Array.from(handlers.keys());
  }
  
  function disconnectAll() {
    for (const [name, handler] of handlers) {
      if (handler.disconnect) {
        logger.info(`断开通道: ${name}`);
        handler.disconnect();
      }
    }
  }
  
  return {
    connectAll,
    getHandler,
    getChannels,
    disconnectAll,
    handlers
  };
}
