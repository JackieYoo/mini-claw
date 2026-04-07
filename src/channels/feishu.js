/**
 * Feishu Channel - Enhanced with Advanced Reaction System
 * 
 * 优化的表情回复功能：
 * - 多阶段表情反馈（收到、处理中、成功、失败）
 * - 表情队列管理（避免重复添加）
 * - 可配置的表情类型
 * - 错误处理和重试
 */

import * as Lark from '@larksuiteoapi/node-sdk';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('feishu');

// 表情类型映射
const EMOJI_TYPES = {
  'THUMBSUP': '👍',
  'HEART': '❤️',
  'LAUGH': '😂',
  'OK': '👌',
  'WOW': '😮',
  'SORROW': '😢',
  'ANGRY': '😡',
  'FIRE': '🔥',
  'CLAP': '👏',
  'THINK': '🤔',
  'ROCKET': '🚀',
  'CHECK': '✅',
  'CROSS': '❌',
};

export function createFeishuChannel(config) {
  const { 
    app_id, 
    app_secret, 
    domain = 'feishu',
  } = config;
  
  // 表情回复配置 - 从环境变量读取
  const reactionConfig = {
    enabled: process.env.FEISHU_REACTION_ENABLED !== 'false',
    
    // 收到消息时的表情
    showReceived: process.env.FEISHU_REACTION_SHOW_RECEIVED !== 'false',
    receivedEmoji: process.env.FEISHU_REACTION_RECEIVED_EMOJI || 'THUMBSUP',
    
    // 处理中的表情
    showProcessing: process.env.FEISHU_REACTION_SHOW_PROCESSING === 'true',
    processingEmoji: process.env.FEISHU_REACTION_PROCESSING_EMOJI || 'WOW',
    
    // 处理结果的表情
    showResult: process.env.FEISHU_REACTION_SHOW_RESULT !== 'false',
    successEmoji: process.env.FEISHU_REACTION_SUCCESS_EMOJI || 'OK',
    errorEmoji: process.env.FEISHU_REACTION_ERROR_EMOJI || 'SORROW',
  };
  
  
  // 消息去重管理器 - 防止重复处理
  const messageDeduplicator = {
    processedMessages: new Map(), // messageId -> timestamp
    ttl: 60000, // 60秒过期
    
    isProcessed(messageId) {
      // 清理过期记录
      const now = Date.now();
      for (const [id, timestamp] of this.processedMessages.entries()) {
        if (now - timestamp > this.ttl) {
          this.processedMessages.delete(id);
        }
      }
      
      // 检查是否已处理
      if (this.processedMessages.has(messageId)) {
        logger.warn(`⚠️ 消息重复，跳过: ${messageId}`);
        return true;
      }
      
      // 标记为已处理
      this.processedMessages.set(messageId, now);
      return false;
    },
    
    getStats() {
      return {
        total: this.processedMessages.size,
        ttl: this.ttl
      };
    }
  };

  let wsClient = null;
  let eventDispatcher = null;
  let agent = null;
  let messageCallback = null;
  let botOpenId = null;
  let reconnectAttempts = 0;
  let maxReconnectAttempts = 10;
  let reconnectDelay = 5000;

  // 连接健康状态管理
  const connectionState = {
    status: 'disconnected', // 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
    lastMessageAt: null,
    lastPingAt: null,
    connectedAt: null,
    healthCheckFailures: 0,
    maxHealthCheckFailures: 3,
  };

  // 健康检查定时器
  let healthCheckTimer = null;
  const HEALTH_CHECK_INTERVAL = 30000; // 30秒检查一次
  
  // 表情管理器 - 防止重复添加
  const reactionManager = {
    reactions: new Map(), // messageId -> Set of emojis
    
    async add(messageId, emojiType) {
      if (!this.reactions.has(messageId)) {
        this.reactions.set(messageId, new Set());
      }
      
      const messageReactions = this.reactions.get(messageId);
      
      // 如果已经添加过这个表情，跳过
      if (messageReactions.has(emojiType)) {
        logger.debug(`表情已存在，跳过: ${emojiType}`);
        return { code: 0, skipped: true };
      }
      
      // 添加表情
      const result = await addReactionToAPI(messageId, emojiType);
      
      if (result.code === 0) {
        messageReactions.add(emojiType);
      }
      
      return result;
    },
    
    async remove(messageId, emojiType) {
      const messageReactions = this.reactions.get(messageId);
      if (messageReactions && messageReactions.has(emojiType)) {
        const result = await removeReactionFromAPI(messageId, emojiType);
        if (result.code === 0) {
          messageReactions.delete(emojiType);
        }
        return result;
      }
      return { code: 0, skipped: true };
    },
    
    clear(messageId) {
      this.reactions.delete(messageId);
    },
  };
  
  // 解析域名
  function resolveDomain(domainStr) {
    if (domainStr === 'lark') {
      return Lark.Domain.Lark;
    }
    return Lark.Domain.Feishu;
  }
  
  // 获取机器人信息
  async function fetchBotInfo() {
    try {
      const client = new Lark.Client({
        appId: app_id,
        appSecret: app_secret,
        appType: Lark.AppType.SelfBuild,
        domain: resolveDomain(domain),
      });
      
      const result = await client.bot.userInfo.get();
      if (result.code === 0 && result.data?.bot) {
        botOpenId = result.data.bot.open_id;
        logger.info(`🤖 机器人: ${result.data.bot.app_name} (${botOpenId})`);
        logger.info(`😊 表情回复: ${reactionConfig.enabled ? '已启用' : '已禁用'}`);
      }
    } catch (err) {
      logger.warn('获取机器人信息失败:', err.message);
    }
  }
  
  // 健康检查
  function startHealthCheck() {
    if (healthCheckTimer) {
      clearInterval(healthCheckTimer);
    }

    healthCheckTimer = setInterval(() => {
      const now = Date.now();

      // 如果已连接但超过60秒没有收到消息，检查连接状态
      if (connectionState.status === 'connected' && connectionState.lastMessageAt) {
        const timeSinceLastMessage = now - connectionState.lastMessageAt;

        if (timeSinceLastMessage > 60000) {
          connectionState.healthCheckFailures++;
          logger.warn(`健康检查失败: ${connectionState.healthCheckFailures}/${connectionState.maxHealthCheckFailures} 次未收到消息，已 ${Math.floor(timeSinceLastMessage / 1000)} 秒`);

          if (connectionState.healthCheckFailures >= connectionState.maxHealthCheckFailures) {
            logger.error('健康检查失败次数过多，触发重连...');
            reconnect(agent);
          }
        } else {
          // 重置失败计数
          connectionState.healthCheckFailures = 0;
        }
      }
    }, HEALTH_CHECK_INTERVAL);

    logger.debug('健康检查已启动');
  }

  // 更新消息接收时间
  function updateLastMessageTime() {
    connectionState.lastMessageAt = Date.now();
    connectionState.healthCheckFailures = 0;
  }

  // 停止健康检查
  function stopHealthCheck() {
    if (healthCheckTimer) {
      clearInterval(healthCheckTimer);
      healthCheckTimer = null;
    }
    connectionState.status = 'disconnected';
    connectionState.healthCheckFailures = 0;
  }

  // 连接飞书长连接
  async function connect(agentInstance) {
    agent = agentInstance;

    if (!app_id || !app_secret) {
      throw new Error('飞书 App ID 或 App Secret 未配置');
    }

    connectionState.status = 'connecting';
    logger.info(`正在连接飞书长连接...`);
    logger.info(`App ID: ${app_id}`);

    try {
      await fetchBotInfo();

      wsClient = new Lark.WSClient({
        appId: app_id,
        appSecret: app_secret,
        domain: resolveDomain(domain),
        loggerLevel: Lark.LoggerLevel.info,
      });

      eventDispatcher = new Lark.EventDispatcher({});

      eventDispatcher.register({
        'im.message.receive_v1': async (data) => {
          try {
            updateLastMessageTime();
            await handleMessageEvent(data);
          } catch (err) {
            logger.error('处理消息事件错误:', err);
          }
        },
        
        'im.chat.member.bot.added_v1': async (data) => {
          logger.info(`机器人被添加到群聊: ${data.chat_id}`);
          await sendMessage(data.chat_id, 'chat_id', '🦞 你好！我是 MiniClaw 助手，有什么可以帮助你的吗？');
        },
        
        'im.chat.member.bot.deleted_v1': async (data) => {
          logger.info(`机器人被移出群聊: ${data.chat_id}`);
        },
        
        'im.message.reaction.created_v1': async (data) => {
          const emojiType = data.reaction_type?.emoji_type;
          const emoji = EMOJI_TYPES[emojiType] || emojiType;
          logger.debug(`收到表情回复: ${emoji} (消息ID: ${data.message_id})`);
        },
        
        'im.message.reaction.deleted_v1': async (data) => {
          logger.debug(`表情回复被移除 (消息ID: ${data.message_id})`);
        },
      });
      
      wsClient.start({ eventDispatcher });
      reconnectAttempts = 0;

      // 更新连接状态
      connectionState.status = 'connected';
      connectionState.connectedAt = Date.now();
      connectionState.lastMessageAt = Date.now();
      connectionState.healthCheckFailures = 0;

      // 启动健康检查
      startHealthCheck();

      logger.info('✅ 飞书长连接已建立');
      
    } catch (err) {
      logger.error('连接飞书长连接失败:', err);
      await reconnect(agentInstance);
      throw err;
    }
  }
  
  // 处理消息事件
  async function handleMessageEvent(event) {
    const { sender, message } = event;
    
    // 提前获取 messageId 用于去重
    const messageId = message.message_id;
    
    // 消息去重检查
    if (messageDeduplicator.isProcessed(messageId)) {
      return;
    }
    
    if (sender.sender_type === 'app') {
      return;
    }
    
    let content = message.content;
    if (message.message_type === 'text') {
      try {
        content = JSON.parse(content).text;
      } catch (e) {
        logger.debug('消息内容解析失败，使用原始内容');
      }
    } else if (message.message_type === 'post') {
      try {
        const postContent = JSON.parse(content);
        content = extractTextFromPost(postContent);
      } catch (e) {
        logger.debug('富文本解析失败');
      }
    }
    
    if (!content || !content.trim()) {
      logger.debug('空消息，跳过');
      return;
    }
    
    const senderId = sender.sender_id?.open_id || sender.sender_id?.user_id;
    const senderName = sender.sender_id?.name || senderId;
    const chatId = message.chat_id;
    const chatType = message.chat_type;
    logger.info(`收到消息 [${chatType}] ${senderName}: ${content.substring(0, 50)}...`);
    
    // 群聊检查是否 @ 机器人
    let botMentioned = false;
    if (chatType === 'group') {
      const mentions = message.mentions || [];
      botMentioned = mentions.some(m => 
        m.id?.open_id === botOpenId || 
        m.id?.open_id === app_id ||
        m.key === app_id
      );
      
      if (!botMentioned) {
        logger.debug('群聊未 @ 机器人，忽略');
        return;
      }
      
      content = content.replace(/@_user_\d+/g, '').trim();
    }
    
    // 添加"收到"表情
    if (reactionConfig.enabled && reactionConfig.showReceived) {
      await reactionManager.add(messageId, reactionConfig.receivedEmoji);
    }
    
    // 处理命令
    if (content.startsWith('/')) {
      await handleCommand(content, chatId, chatType, messageId);
      return;
    }
    
    // 调用 Agent 处理
    if (agent && content) {
      try {
        // 添加"处理中"表情
        if (reactionConfig.enabled && reactionConfig.showProcessing) {
          await reactionManager.add(messageId, reactionConfig.processingEmoji);
        }
        
        const agentContext = {
          channel: 'feishu',
          chatType,
          chatId,
          senderId,
          senderName,
          messageId,
        };
        
        logger.debug(`调用 Agent...`);
        const response = await agent.chat(content, agentContext);
        
        const replyContent = response.content;
        logger.info(`Agent 回复: ${replyContent?.substring(0, 100)}...`);
        
        await sendMessage(chatId, 'chat_id', replyContent, 'text', messageId);
        
        // 添加"成功"表情
        if (reactionConfig.enabled && reactionConfig.showResult) {
          await reactionManager.add(messageId, reactionConfig.successEmoji);
        }
        
      } catch (err) {
        logger.error('Agent 处理错误:', err.message);
        await sendMessage(chatId, 'chat_id', `❌ ${err.message}`);
        
        // 添加"失败"表情
        if (reactionConfig.enabled && reactionConfig.showResult) {
          await reactionManager.add(messageId, reactionConfig.errorEmoji);
        }
      }
    }
    
    if (messageCallback) {
      await messageCallback({
        content,
        senderId,
        chatId,
        chatType,
        rawMessage: message
      });
    }
  }
  
  // 处理命令
  async function handleCommand(content, chatId, chatType, messageId) {
    const cmd = content.trim().toLowerCase();
    
    switch (cmd) {
      case '/status':
        await sendMessage(chatId, 'chat_id', 
          '🦞 MiniClaw 运行中\n' +
          `会话数: ${agent?.getSessionStats?.()?.totalSessions || 0}`
        );
        break;
        
      case '/reset':
        if (agent) {
          const sessionKey = `feishu:${chatType === 'group' ? 'group' : 'dm'}:${chatId}`;
          agent.resetSession(sessionKey);
          await sendMessage(chatId, 'chat_id', '✅ 会话已重置');
        }
        break;
        
      case '/help':
        await sendMessage(chatId, 'chat_id',
          '🦞 MiniClaw 命令:\n' +
          '/status - 查看状态\n' +
          '/reset - 重置会话\n' +
          '/help - 显示帮助'
        );
        break;
        
      default:
        if (agent && content.length > 1) {
          const response = await agent.chat(content);
          await sendMessage(chatId, 'chat_id', response.content);
        }
    }
  }
  
  // 从富文本提取纯文本
  function extractTextFromPost(postContent) {
    if (!postContent) return '';
    
    let text = '';
    
    const extractFromContent = (content) => {
      if (typeof content === 'string') return content;
      if (content.text) return content.text;
      if (Array.isArray(content)) {
        return content.map(extractFromContent).join('');
      }
      if (content.content) {
        return extractFromContent(content.content);
      }
      return '';
    };
    
    if (postContent.content) {
      text = extractFromContent(postContent.content);
    }
    
    return text;
  }
  
  // 发送消息
  async function sendMessage(receiveId, receiveIdType, content, msgType = 'text', replyToMessageId = null) {
    if (!content) return;
    
    try {
      const client = new Lark.Client({
        appId: app_id,
        appSecret: app_secret,
        appType: Lark.AppType.SelfBuild,
        domain: resolveDomain(domain),
      });
      
      const messageData = {
        receive_id: receiveId,
        msg_type: msgType,
        content: msgType === 'text' ? JSON.stringify({ text: content }) : content,
      };
      
      const result = await client.im.message.create({
        params: {
          receive_id_type: receiveIdType,
        },
        data: messageData,
      });
      
      if (result.code !== 0) {
        logger.error('发送消息失败:', result);
      } else {
        logger.debug('消息发送成功');
      }
      
      return result;
      
    } catch (err) {
      logger.error('发送消息异常:', err.message);
      return { code: -1, msg: err.message };
    }
  }
  
  // 添加表情回复 - API 调用
  async function addReactionToAPI(messageId, emojiType = 'THUMBSUP') {
    try {
      const client = new Lark.Client({
        appId: app_id,
        appSecret: app_secret,
        appType: Lark.AppType.SelfBuild,
        domain: resolveDomain(domain),
      });
      
      const result = await client.im.messageReaction.create({
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
        const emoji = EMOJI_TYPES[emojiType] || emojiType;
        logger.debug(`添加表情回复: ${emoji}`);
      } else {
        logger.warn(`添加表情回复失败: ${result.msg}`);
      }
      
      return result;
      
    } catch (err) {
      logger.error('添加表情回复异常:', err.message);
      return { code: -1, msg: err.message };
    }
  }
  
  // 移除表情回复 - API 调用
  async function removeReactionFromAPI(messageId, emojiType = 'THUMBSUP') {
    try {
      const client = new Lark.Client({
        appId: app_id,
        appSecret: app_secret,
        appType: Lark.AppType.SelfBuild,
        domain: resolveDomain(domain),
      });
      
      const result = await client.im.messageReaction.delete({
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
        logger.debug(`移除表情回复: ${emojiType}`);
      }
      
      return result;
      
    } catch (err) {
      logger.error('移除表情回复异常:', err.message);
      return { code: -1, msg: err.message };
    }
  }
  
  // 公开的表情管理方法
  async function addReaction(messageId, emojiType = 'THUMBSUP') {
    return reactionManager.add(messageId, emojiType);
  }
  
  async function removeReaction(messageId, emojiType = 'THUMBSUP') {
    return reactionManager.remove(messageId, emojiType);
  }
  
  async function getReactions(messageId) {
    try {
      const client = new Lark.Client({
        appId: app_id,
        appSecret: app_secret,
        appType: Lark.AppType.SelfBuild,
        domain: resolveDomain(domain),
      });
      
      const result = await client.im.messageReaction.list({
        path: {
          message_id: messageId,
        },
        params: {
          user_id_type: 'open_id',
        },
      });
      
      if (result.code === 0) {
        return result.data?.items || [];
      }
      
      return [];
      
    } catch (err) {
      logger.error('获取表情回复列表异常:', err.message);
      return [];
    }
  }
  
  function onMessage(callback) {
    messageCallback = callback;
  }
  
  // 重新连接
  async function reconnect(agentInstance) {
    connectionState.status = 'reconnecting';
    stopHealthCheck();

    if (reconnectAttempts < maxReconnectAttempts) {
      reconnectAttempts++;
      const delay = reconnectDelay * Math.pow(2, reconnectAttempts - 1);
      logger.info(`将在 ${delay}ms 后尝试重连 (第 ${reconnectAttempts} 次)...`);

      setTimeout(() => {
        connect(agentInstance).catch(err => {
          logger.error('重连失败:', err);
        });
      }, delay);
    } else {
      logger.error(`重连失败次数已达上限 (${maxReconnectAttempts})，停止重连`);
      connectionState.status = 'disconnected';
    }
  }

  function disconnect() {
    stopHealthCheck();
    if (wsClient) {
      wsClient.stop?.();
      wsClient = null;
      eventDispatcher = null;
    }
  }
  
  function isConnected() {
    return wsClient !== null;
  }
  
  return {
    connect,
    disconnect,
    sendMessage,
    onMessage,
    addReaction,
    removeReaction,
    getReactions,
    isConnected,
    get appId() { return app_id; },
    get botOpenId() { return botOpenId; },
    getConnectionState() { return { ...connectionState }; },
  };
}
