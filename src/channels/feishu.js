/**
 * Feishu Channel - Multi-Agent Support Edition
 * 
 * 新增功能：
 * - @agent-name 指定 Agent
 * - /agent 命令切换 Agent
 * - 智能路由选择 Agent
 * - 多 Agent 会话管理
 */

import * as Lark from '@larksuiteoapi/node-sdk';
import { createLogger } from '../utils/logger.js';
import { extractAgentMention, parseAgentCommand } from '../agent/router.js';

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
  
  // 表情回复配置
  const reactionConfig = {
    enabled: process.env.FEISHU_REACTION_ENABLED !== 'false',
    showReceived: process.env.FEISHU_REACTION_SHOW_RECEIVED !== 'false',
    receivedEmoji: process.env.FEISHU_REACTION_RECEIVED_EMOJI || 'THUMBSUP',
    showProcessing: process.env.FEISHU_REACTION_SHOW_PROCESSING === 'true',
    processingEmoji: process.env.FEISHU_REACTION_PROCESSING_EMOJI || 'WOW',
    showResult: process.env.FEISHU_REACTION_SHOW_RESULT !== 'false',
    successEmoji: process.env.FEISHU_REACTION_SUCCESS_EMOJI || 'OK',
    errorEmoji: process.env.FEISHU_REACTION_ERROR_EMOJI || 'SORROW',
  };
  
  // 消息去重管理器
  const messageDeduplicator = {
    processedMessages: new Map(),
    ttl: 60000,
    
    isProcessed(messageId) {
      const now = Date.now();
      for (const [id, timestamp] of this.processedMessages.entries()) {
        if (now - timestamp > this.ttl) {
          this.processedMessages.delete(id);
        }
      }
      
      if (this.processedMessages.has(messageId)) {
        logger.warn(`⚠️ 消息重复，跳过: ${messageId}`);
        return true;
      }
      
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

  // 会话绑定的 Agent 映射（支持多 Agent）
  const sessionAgentBindings = new Map(); // sessionKey -> agentId
  
  let wsClient = null;
  let eventDispatcher = null;
  let agentFactory = null;  // 改为 Agent 工厂
  let messageCallback = null;
  let botOpenId = null;
  let reconnectAttempts = 0;
  let maxReconnectAttempts = 10;
  let reconnectDelay = 5000;

  // 连接健康状态管理
  const connectionState = {
    status: 'disconnected',
    lastMessageAt: null,
    lastPingAt: null,
    connectedAt: null,
    healthCheckFailures: 0,
    maxHealthCheckFailures: 3,
  };

  let healthCheckTimer = null;
  const HEALTH_CHECK_INTERVAL = 30000;
  
  // 表情管理器
  const reactionManager = {
    reactions: new Map(),
    
    async add(messageId, emojiType) {
      if (!this.reactions.has(messageId)) {
        this.reactions.set(messageId, new Set());
      }
      
      const messageReactions = this.reactions.get(messageId);
      
      if (messageReactions.has(emojiType)) {
        logger.debug(`表情已存在，跳过: ${emojiType}`);
        return { code: 0, skipped: true };
      }
      
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
  
  function resolveDomain(domainStr) {
    if (domainStr === 'lark') {
      return Lark.Domain.Lark;
    }
    return Lark.Domain.Feishu;
  }
  
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
  
  // 健康检查配置
  const HEALTH_CHECK_CONFIG = {
    interval: 30000,           // 检查间隔 30 秒
    messageTimeout: 180000,    // 消息超时 3 分钟（原 1 分钟太短）
    gracePeriod: 120000,       // 连接后宽限期 2 分钟
    maxFailures: 3,            // 最大失败次数
  };

  function startHealthCheck() {
    if (healthCheckTimer) {
      clearInterval(healthCheckTimer);
    }

    healthCheckTimer = setInterval(() => {
      const now = Date.now();

      // 只在连接状态下检查
      if (connectionState.status !== 'connected') {
        return;
      }

      // 连接后的宽限期内不检查
      const timeSinceConnected = now - connectionState.connectedAt;
      if (timeSinceConnected < HEALTH_CHECK_CONFIG.gracePeriod) {
        logger.debug(`连接宽限期中，跳过健康检查 (${Math.floor(timeSinceConnected / 1000)}s/${HEALTH_CHECK_CONFIG.gracePeriod / 1000}s)`);
        return;
      }

      // 如果没有收到过消息，使用连接时间作为参考
      const referenceTime = connectionState.lastMessageAt || connectionState.connectedAt;
      const timeSinceLastMessage = now - referenceTime;

      if (timeSinceLastMessage > HEALTH_CHECK_CONFIG.messageTimeout) {
        connectionState.healthCheckFailures++;
        logger.warn(`健康检查失败: ${connectionState.healthCheckFailures}/${HEALTH_CHECK_CONFIG.maxFailures} 次未收到消息 (已等待 ${Math.floor(timeSinceLastMessage / 1000)}s)`);

        if (connectionState.healthCheckFailures >= HEALTH_CHECK_CONFIG.maxFailures) {
          logger.error(`健康检查失败次数过多，触发重连...`);
          reconnect(agentFactory);
        }
      } else {
        if (connectionState.healthCheckFailures > 0) {
          logger.info('健康检查恢复，消息接收正常');
          connectionState.healthCheckFailures = 0;
        }
      }
    }, HEALTH_CHECK_CONFIG.interval);

    logger.debug('健康检查已启动');
  }

  function updateLastMessageTime() {
    connectionState.lastMessageAt = Date.now();
    connectionState.healthCheckFailures = 0;
  }

  function stopHealthCheck() {
    if (healthCheckTimer) {
      clearInterval(healthCheckTimer);
      healthCheckTimer = null;
    }
    connectionState.status = 'disconnected';
    connectionState.healthCheckFailures = 0;
  }

  // 连接飞书长连接（接收 agentFactory 替代单个 agent）
  async function connect(factory) {
    agentFactory = factory;

    if (!app_id || !app_secret) {
      logger.warn('飞书 App ID 或 App Secret 未配置，跳过连接');
      return false;
    }

    // 验证凭证格式
    if (app_id.includes('your-') || app_secret.includes('your-')) {
      logger.warn('飞书凭证使用了占位符，请在 .env 文件中配置真实值');
      return false;
    }

    connectionState.status = 'connecting';
    logger.info(`正在连接飞书长连接...`);
    logger.info(`App ID: ${app_id.substring(0, 8)}...`);

    try {
      await fetchBotInfo();

      wsClient = new Lark.WSClient({
        appId: app_id,
        appSecret: app_secret,
        domain: resolveDomain(domain),
        loggerLevel: process.env.DEBUG === 'true' ? Lark.LoggerLevel.debug : Lark.LoggerLevel.warn,
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
          const agents = agentFactory?.getAllInfo?.() || [];
          let welcomeMsg = '🦞 你好！我是 MiniClaw 多 Agent 助手\n\n可用 Agent：\n';
          for (const agent of agents) {
            welcomeMsg += `• @${agent.id} - ${agent.name}\n`;
          }
          welcomeMsg += '\n使用 @agent-name 指定 Agent，或 /agents 查看全部';
          await sendMessage(data.chat_id, 'chat_id', welcomeMsg);
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

      connectionState.status = 'connected';
      connectionState.connectedAt = Date.now();
      connectionState.lastMessageAt = Date.now();
      connectionState.healthCheckFailures = 0;

      startHealthCheck();

      logger.info('✅ 飞书长连接已建立');
      return true;

    } catch (err) {
      logger.error('连接飞书长连接失败:', err.message);

      // 根据错误类型提供具体建议
      if (err.message?.includes('app_id') || err.message?.includes('app_secret')) {
        logger.error('💡 请检查 .env 文件中的 FEISHU_APP_ID 和 FEISHU_APP_SECRET');
      } else if (err.message?.includes('timeout') || err.message?.includes('ETIMEDOUT')) {
        logger.error('💡 网络连接超时，请检查网络连接');
      }

      // 尝试重连
      if (reconnectAttempts < maxReconnectAttempts) {
        await reconnect(factory);
      } else {
        logger.error('飞书连接失败，Gateway 将继续运行但飞书功能不可用');
      }

      return false;
    }
  }
  
  // 处理消息事件（多 Agent 支持）
  async function handleMessageEvent(event) {
    const { sender, message } = event;
    
    const messageId = message.message_id;
    
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
    
    // 生成会话 Key
    const sessionKey = agentFactory?.getDefault?.()?.sessionManager?.generateSessionKey?.({
      channel: 'feishu',
      chatType,
      chatId,
      senderId,
    }) || `feishu:${chatType === 'group' ? 'group' : 'dm'}:${chatId}`;
    
    // 处理命令
    if (content.startsWith('/')) {
      await handleCommand(content, chatId, chatType, messageId, sessionKey);
      return;
    }
    
    // 解析 @agent 提及和 /agent 命令
    const { text: cleanedContent, agentId: mentionedAgentId } = extractAgentMention(content);
    
    // 检查是否有会话绑定的 Agent
    let boundAgentId = sessionAgentBindings.get(sessionKey);
    
    // 优先使用提及的 Agent，其次是绑定的 Agent
    const targetAgentId = mentionedAgentId || boundAgentId;
    
    if (cleanedContent && agentFactory) {
      try {
        if (reactionConfig.enabled && reactionConfig.showProcessing) {
          await reactionManager.add(messageId, reactionConfig.processingEmoji);
        }
        
        // 智能路由选择 Agent
        const agent = await agentFactory.select(cleanedContent, {
          sessionKey,
          agentId: targetAgentId,
          channel: 'feishu',
          chatType,
          chatId,
          senderId,
        });
        
        if (!agent) {
          throw new Error('没有可用的 Agent');
        }
        
        // 如果不是通过 @ 临时指定的，绑定会话到选中的 Agent
        if (!mentionedAgentId && agent.metadata.id !== boundAgentId) {
          sessionAgentBindings.set(sessionKey, agent.metadata.id);
          logger.debug(`会话 ${sessionKey} 绑定到 Agent ${agent.metadata.id}`);
        }
        
        logger.info(`使用 Agent: ${agent.metadata.name} (${agent.metadata.id})`);
        
        const agentContext = {
          channel: 'feishu',
          chatType,
          chatId,
          senderId,
          senderName,
          messageId,
        };
        
        const response = await agent.chat(cleanedContent, agentContext);
        
        const replyContent = response.content;
        logger.info(`Agent 回复: ${replyContent?.substring(0, 100)}...`);
        
        // 添加 Agent 标识（如果是多 Agent 模式）
        const allAgents = agentFactory.getAllInfo?.() || [];
        let finalReply = replyContent;
        if (allAgents.length > 1 && agent.metadata.id !== 'default') {
          finalReply = `[${agent.metadata.name}]\n${replyContent}`;
        }
        
        await sendMessage(chatId, 'chat_id', finalReply, 'text', messageId);
        
        if (reactionConfig.enabled && reactionConfig.showResult) {
          await reactionManager.add(messageId, reactionConfig.successEmoji);
        }
        
      } catch (err) {
        logger.error('Agent 处理错误:', err.message);
        await sendMessage(chatId, 'chat_id', `❌ ${err.message}`);
        
        if (reactionConfig.enabled && reactionConfig.showResult) {
          await reactionManager.add(messageId, reactionConfig.errorEmoji);
        }
      }
    }
    
    if (messageCallback) {
      await messageCallback({
        content: cleanedContent,
        senderId,
        chatId,
        chatType,
        rawMessage: message
      });
    }
  }
  
  // 处理命令（多 Agent 支持）
  async function handleCommand(content, chatId, chatType, messageId, sessionKey) {
    const cmdParts = content.trim().split(/\s+/);
    const cmd = cmdParts[0].toLowerCase();
    const args = cmdParts.slice(1);
    
    switch (cmd) {
      case '/status': {
        let statusMsg = '🦞 MiniClaw 运行中\n\n';
        
        const factoryStats = agentFactory?.getStats?.();
        if (factoryStats) {
          statusMsg += `Agent 数量: ${factoryStats.total}\n`;
          statusMsg += `当前会话: ${factoryStats.sessionBindings || 0}\n\n`;
          
          for (const agentStat of factoryStats.agents || []) {
            const stats = agentStat.stats || {};
            statusMsg += `• ${agentStat.name}: ${stats.totalCalls || 0} 次调用\n`;
          }
        }
        
        await sendMessage(chatId, 'chat_id', statusMsg);
        break;
      }
      
      case '/reset': {
        if (sessionKey && agentFactory) {
          // 重置该会话在所有 Agent 中的状态
          for (const agent of agentFactory.getAll?.() || []) {
            agent.resetSession?.(sessionKey);
          }
          // 清除 Agent 绑定
          sessionAgentBindings.delete(sessionKey);
          await sendMessage(chatId, 'chat_id', '✅ 会话已重置');
        }
        break;
      }
      
      case '/help': {
        let helpMsg = '🦞 MiniClaw 命令:\n\n';
        helpMsg += '/status - 查看状态\n';
        helpMsg += '/reset - 重置会话\n';
        helpMsg += '/agents - 查看可用 Agent\n';
        helpMsg += '/agent <name> - 切换到指定 Agent\n';
        helpMsg += '@<agent-name> <消息> - 临时使用某个 Agent\n';
        helpMsg += '/help - 显示帮助';
        await sendMessage(chatId, 'chat_id', helpMsg);
        break;
      }
      
      case '/agents': {
        const agents = agentFactory?.getAllInfo?.() || [];
        let agentsMsg = '🤖 可用 Agent 列表:\n\n';
        const currentAgentId = sessionAgentBindings.get(sessionKey);
        
        for (const agent of agents) {
          const marker = agent.id === currentAgentId ? '▶ ' : '  ';
          agentsMsg += `${marker}@${agent.id} - ${agent.name}\n`;
          if (agent.description) {
            agentsMsg += `     ${agent.description}\n`;
          }
        }
        
        agentsMsg += '\n使用 @agent-name 或 /agent <name> 切换';
        await sendMessage(chatId, 'chat_id', agentsMsg);
        break;
      }
      
      case '/agent': {
        if (args.length === 0) {
          const currentAgentId = sessionAgentBindings.get(sessionKey);
          if (currentAgentId) {
            const agent = agentFactory?.get?.(currentAgentId);
            await sendMessage(chatId, 'chat_id', `当前 Agent: ${agent?.metadata?.name || currentAgentId}`);
          } else {
            await sendMessage(chatId, 'chat_id', '未指定 Agent，使用默认路由');
          }
          return;
        }
        
        const targetAgentId = args[0].replace(/^@/, '');
        const agent = agentFactory?.get?.(targetAgentId);
        
        if (!agent) {
          await sendMessage(chatId, 'chat_id', `❌ Agent "${targetAgentId}" 不存在，使用 /agents 查看列表`);
          return;
        }
        
        // 绑定会话到指定 Agent
        sessionAgentBindings.set(sessionKey, targetAgentId);
        await sendMessage(chatId, 'chat_id', `✅ 已切换到 ${agent.metadata.name}\n后续消息将优先由此 Agent 处理`);
        break;
      }
      
      default: {
        // 未知命令也交给 Agent 处理
        if (agentFactory && content.length > 1) {
          try {
            const agent = await agentFactory.select(content, { sessionKey });
            const response = await agent.chat(content);
            await sendMessage(chatId, 'chat_id', response.content);
          } catch (err) {
            await sendMessage(chatId, 'chat_id', `❌ ${err.message}`);
          }
        }
      }
    }
  }
  
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
        params: { receive_id_type: receiveIdType },
        data: messageData,
      });
      
      if (result.code !== 0) {
        logger.error('发送消息失败:', result);
        if (result.code === 40001) {
          logger.error('授权失败，请检查:');
          logger.error('  1. App ID 和 App Secret 是否正确');
          logger.error('  2. 应用是否已发布到企业');
          logger.error('  3. 应用权限是否足够');
        }
      } else {
        logger.debug('消息发送成功');
      }
      
      return result;
      
    } catch (err) {
      logger.error('发送消息异常:', err.message);
      return { code: -1, msg: err.message };
    }
  }
  
  async function addReactionToAPI(messageId, emojiType = 'THUMBSUP') {
    try {
      const client = new Lark.Client({
        appId: app_id,
        appSecret: app_secret,
        appType: Lark.AppType.SelfBuild,
        domain: resolveDomain(domain),
      });
      
      const result = await client.im.messageReaction.create({
        path: { message_id: messageId },
        params: { user_id_type: 'open_id' },
        data: { reaction_type: { emoji_type: emojiType } }
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
  
  async function removeReactionFromAPI(messageId, emojiType = 'THUMBSUP') {
    try {
      const client = new Lark.Client({
        appId: app_id,
        appSecret: app_secret,
        appType: Lark.AppType.SelfBuild,
        domain: resolveDomain(domain),
      });
      
      const result = await client.im.messageReaction.delete({
        path: { message_id: messageId },
        params: { user_id_type: 'open_id' },
        data: { reaction_type: { emoji_type: emojiType } }
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
        path: { message_id: messageId },
        params: { user_id_type: 'open_id' },
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
  
  async function reconnect(factory) {
    connectionState.status = 'reconnecting';
    stopHealthCheck();

    if (reconnectAttempts < maxReconnectAttempts) {
      reconnectAttempts++;
      const delay = reconnectDelay * Math.pow(2, reconnectAttempts - 1);
      logger.info(`将在 ${delay}ms 后尝试重连 (第 ${reconnectAttempts} 次)...`);

      setTimeout(() => {
        connect(factory).catch(err => {
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

    // 清理 WebSocket 客户端
    if (wsClient) {
      try {
        wsClient.stop?.();
      } catch (err) {
        logger.warn('停止飞书 WebSocket 客户端时出错:', err.message);
      }
      wsClient = null;
    }

    // 清理事件分发器
    if (eventDispatcher) {
      try {
        eventDispatcher.removeAllListeners?.();
      } catch (err) {
        // 忽略错误
      }
      eventDispatcher = null;
    }

    // 清理会话绑定
    sessionAgentBindings.clear();

    connectionState.status = 'disconnected';
    logger.info('飞书通道已断开');
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
