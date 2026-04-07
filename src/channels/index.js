/**
 * Channel Manager - Manage message channels
 */

import { createFeishuChannel } from './feishu.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('channels');

export function createChannelManager(config) {
  const handlers = new Map();
  let agent = null;
  
  // 初始化飞书通道
  if (config.feishu?.enabled) {
    const feishu = createFeishuChannel(config.feishu);
    handlers.set('feishu', feishu);
    logger.info('飞书通道已启用（长连接模式）');
  }
  
  // 连接所有通道（长连接模式）
  async function connectAll(agentInstance) {
    agent = agentInstance;
    
    for (const [name, handler] of handlers) {
      if (handler.connect) {
        logger.info(`连接通道: ${name}`);
        await handler.connect(agentInstance);
      }
    }
  }
  
  function getHandler(channelName) {
    return handlers.get(channelName);
  }
  
  function getChannels() {
    return Array.from(handlers.keys());
  }
  
  return {
    connectAll,
    getHandler,
    getChannels,
    handlers
  };
}
