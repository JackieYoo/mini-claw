/**
 * Gateway - WebSocket + HTTP Server
 * 支持多 Agent 架构
 */

import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import { createLogger } from '../utils/logger.js';
import { createAuth } from '../utils/auth.js';
import { extractAgentMention, parseAgentCommand } from '../agent/router.js';
import { metrics, metricHelpers } from '../utils/metrics.js';
import net from 'net';

const logger = createLogger('gateway');

/**
 * 检查端口是否可用
 * @param {number} port - 端口号
 * @param {string} host - 主机地址
 * @returns {Promise<boolean>} - 是否可用
 */
function isPortAvailable(port, host = '0.0.0.0') {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(false);
      }
    });

    server.once('listening', () => {
      server.close();
      resolve(true);
    });

    server.listen(port, host);
  });
}

/**
 * 查找可用端口
 * @param {number} startPort - 起始端口
 * @param {string} host - 主机地址
 * @param {number} maxAttempts - 最大尝试次数
 * @returns {Promise<number|null>} - 可用端口号或null
 */
async function findAvailablePort(startPort, host = '0.0.0.0', maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    if (await isPortAvailable(port, host)) {
      return port;
    }
    logger.warn(`端口 ${port} 被占用，尝试下一个...`);
  }
  return null;
}

export function createGateway(config, deps) {
  const { agentFactory, channelManager, toolRegistry, skillsLoader } = deps;

  const corsOrigin = config.cors?.origin || '*';

  const fastify = Fastify({
    logger: false,
    // 增加请求体大小限制
    bodyLimit: 10 * 1024 * 1024, // 10MB
  });
  fastify.register(websocket);
  fastify.register(cors, {
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  });

  // ==================== 认证中间件 ====================
  // 如果没有配置 API_KEYS，禁用认证（便于本地开发）
  const apiKeys = process.env.API_KEYS?.split(',').filter(Boolean) || [];
  const enableAuth = apiKeys.length > 0;
  
  if (enableAuth) {
    logger.info(`已启用 API Key 认证，共 ${apiKeys.length} 个密钥`);
  } else {
    logger.info('未配置 API_KEYS，认证已禁用（仅用于本地开发）');
  }
  
  const authMiddleware = createAuth({
    enableApiKey: enableAuth,
    publicPaths: ['/health', '/', '/ws', '/agents', '/agents/*', '/tools', '/skills'], // 公开只读端点
    apiKeys,
  });

  // 注册认证中间件
  fastify.addHook('preHandler', authMiddleware);

  // 输入验证中间件
  fastify.addHook('preHandler', async (request, reply) => {
    // 只验证 POST/PUT 请求
    if (request.method !== 'POST' && request.method !== 'PUT') {
      return;
    }

    // 验证 Content-Type
    const contentType = request.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
      // 允许 form-data 等其他类型，不做强制限制
      return;
    }

    // 验证请求体大小
    const contentLength = parseInt(request.headers['content-length'], 10);
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (contentLength && contentLength > maxSize) {
      return reply.status(413).send({
        error: 'Payload Too Large',
        message: `请求体大小超过限制: ${maxSize} bytes`,
        maxSize
      });
    }

    // 验证请求体中的敏感字段类型
    if (request.body && typeof request.body === 'object') {
      validateRequestBody(request.body, reply);
    }
  });

  // 请求体验证函数
  function validateRequestBody(body, reply) {
    // 检查是否包含非法的嵌套层级（防止原型链污染）
    const maxDepth = 10;

    function checkDepth(obj, depth = 0) {
      if (depth > maxDepth) {
        throw new Error('请求体嵌套层级过深');
      }
      if (obj && typeof obj === 'object') {
        for (const key of Object.keys(obj)) {
          // 检查危险键名（原型链污染）
          if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            throw new Error(`非法键名: ${key}`);
          }
          checkDepth(obj[key], depth + 1);
        }
      }
    }

    try {
      checkDepth(body);
    } catch (err) {
      return reply.status(400).send({
        error: 'Invalid Request Body',
        message: err.message
      });
    }
  }

  // ==================== 全局错误处理 ====================
  fastify.setErrorHandler(async (error, request, reply) => {
    stats.totalErrors++;
    logger.error(`请求错误 [${request.method} ${request.url}]:`, {
      error: error.message,
      stack: error.stack,
      statusCode: error.statusCode,
      validation: error.validation,
    });

    // 处理不同类型的错误
    if (error.validation) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: '请求参数不符合要求',
        details: error.validation,
      });
    }

    if (error.statusCode) {
      return reply.status(error.statusCode).send({
        error: error.name || 'Error',
        message: error.message,
      });
    }

    return reply.status(500).send({
      error: 'Internal Server Error',
      message: '服务器内部错误，请稍后重试',
      requestId: request.id || Date.now().toString(),
    });
  });

  fastify.addHook('onRequest', async (request, reply) => {
    request.startTime = Date.now();
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const duration = Date.now() - request.startTime;
    if (duration > 1000) {
      logger.warn(`慢请求 [${request.method} ${request.url}]: ${duration}ms`);
    }

    if (request.auth) {
      logger.debug(`认证用户: ${request.auth.type} - ${request.auth.apiKey || request.auth.userId}`);
    }
  });
  
  // WebSocket 连接池
  const wsClients = new Map();
  
  // Rate limiting 存储
  const rateLimitStore = new Map();
  
  // 统计信息
  const stats = {
    startTime: Date.now(),
    totalRequests: 0,
    totalMessages: 0,
    totalErrors: 0,
    rateLimitedRequests: 0,
  };
  
  // Rate limiting 检查
  function checkRateLimit(clientId, limit = 60, windowMs = 60000) {
    const now = Date.now();
    const key = clientId || 'anonymous';
    
    if (!rateLimitStore.has(key)) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: limit - 1 };
    }
    
    const record = rateLimitStore.get(key);
    
    if (now > record.resetAt) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: limit - 1 };
    }
    
    if (record.count >= limit) {
      return { allowed: false, remaining: 0 };
    }
    
    record.count++;
    return { allowed: true, remaining: limit - record.count };
  }
  
  // 定期清理 rate limit 存储
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitStore.entries()) {
      if (now > record.resetAt) {
        rateLimitStore.delete(key);
      }
    }
  }, 60000);
  
  // ==================== 健康检查 ====================
  fastify.get('/health', async () => {
    return {
      status: 'ok',
      uptime: Math.floor((Date.now() - stats.startTime) / 1000),
      timestamp: new Date().toISOString(),
      agents: agentFactory?.getStats()?.total || 0,
    };
  });
  
  // ==================== 状态统计 ====================
  fastify.get('/stats', async () => {
    const agentStats = agentFactory?.getStats() || {};
    const sessionStats = {};

    // 收集各 Agent 的会话统计
    for (const agent of agentFactory?.getAll() || []) {
      sessionStats[agent.metadata.id] = agent.sessionManager?.getStats?.() || {};
    }

    // 更新内存使用指标
    metricHelpers.updateMemoryUsage();

    return {
      uptime: Math.floor((Date.now() - stats.startTime) / 1000),
      requests: stats.totalRequests,
      messages: stats.totalMessages,
      errors: stats.totalErrors,
      wsClients: wsClients.size,
      agents: agentStats,
      sessions: sessionStats,
      tools: toolRegistry?.getTools?.()?.length || 0,
      skills: skillsLoader?.getAll?.()?.length || 0,
      metrics: metrics.exportJSON(),
    };
  });

  // ==================== Prometheus 指标端点 ====================
  fastify.get('/metrics', async (request, reply) => {
    reply.header('Content-Type', 'text/plain; charset=utf-8');
    return metrics.exportPrometheus();
  });
  
  // ==================== Agent 管理 API ====================
  
  // 获取所有 Agent 列表
  fastify.get('/agents', async () => {
    return {
      agents: agentFactory?.getAllInfo() || [],
      default: agentFactory?.getDefault?.()?.metadata?.id,
    };
  });
  
  // 获取指定 Agent 信息
  fastify.get('/agents/:agentId', async (request, reply) => {
    const { agentId } = request.params;
    const agent = agentFactory?.get(agentId);
    
    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found' });
    }
    
    return {
      id: agent.metadata.id,
      name: agent.metadata.name,
      description: agent.metadata.description,
      model: agent.metadata.model,
      tools: agent.metadata.allowedTools,
      skills: agent.metadata.skills,
      stats: agent.getStats?.() || {},
    };
  });
  
  // 获取指定 Agent 的会话列表
  fastify.get('/agents/:agentId/sessions', async (request, reply) => {
    const { agentId } = request.params;
    const limit = parseInt(request.query.limit) || 20;
    const agent = agentFactory?.get(agentId);
    
    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found' });
    }
    
    const sessions = agent.sessionManager?.listSessionsByAgent?.(agentId, limit) || [];
    return { agentId, sessions };
  });
  
  // ==================== 会话管理 ====================
  fastify.get('/sessions', async (request, reply) => {
    const limit = parseInt(request.query.limit) || 20;
    const agentId = request.query.agent;
    
    if (agentId) {
      const agent = agentFactory?.get(agentId);
      if (!agent) {
        return reply.status(404).send({ error: 'Agent not found' });
      }
      const sessions = agent.sessionManager?.listSessionsByAgent?.(agentId, limit) || [];
      return { agentId, sessions };
    }
    
    // 返回所有会话（按 Agent 分组）
    const allSessions = {};
    for (const agent of agentFactory?.getAll() || []) {
      allSessions[agent.metadata.id] = agent.sessionManager?.listSessions?.(limit) || [];
    }
    return { sessions: allSessions };
  });
  
  // 重置指定会话
  fastify.delete('/sessions/:sessionKey', async (request, reply) => {
    const { sessionKey } = request.params;
    const { agentId } = request.query;
    
    if (agentId) {
      const agent = agentFactory?.get(agentId);
      if (agent) {
        agent.resetSession?.(sessionKey);
        return { success: true, message: `Agent ${agentId} 的会话已重置` };
      }
    }
    
    // 尝试在所有 Agent 中重置
    let resetCount = 0;
    for (const agent of agentFactory?.getAll() || []) {
      try {
        agent.resetSession?.(sessionKey);
        resetCount++;
      } catch (e) {
        // 忽略错误
      }
    }
    
    return { success: true, message: `${resetCount} 个 Agent 的会话已重置` };
  });
  
  // ==================== WebSocket 端点 ====================
  fastify.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, (connection, req) => {
      const token = req.query.token;
      const validToken = process.env.WS_AUTH_TOKEN;
      
      if (validToken && token !== validToken) {
        logger.warn(`WebSocket 认证失败: 无效的 token`);
        connection.socket.send(JSON.stringify({
          type: 'error',
          payload: { message: 'Authentication failed' }
        }));
        connection.socket.close();
        return;
      }
      
      const clientId = `ws_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      
      logger.info(`WebSocket 连接: ${clientId}`);
      wsClients.set(clientId, {
        connection,
        connectedAt: Date.now(),
        messages: 0,
        currentAgent: null,
      });
      
      connection.socket.send(JSON.stringify({
        type: 'connected',
        payload: { clientId, agents: agentFactory?.getAllInfo()?.map(a => ({ id: a.id, name: a.name })) }
      }));
      
      connection.socket.on('message', async (data) => {
        stats.totalMessages++;
        
        try {
          const msg = JSON.parse(data.toString());
          const client = wsClients.get(clientId);
          if (client) client.messages++;
          
          const response = await handleWsMessage(msg, clientId, client);
          connection.socket.send(JSON.stringify(response));
        } catch (err) {
          stats.totalErrors++;
          logger.error('WebSocket 错误:', err.message);
          connection.socket.send(JSON.stringify({ 
            type: 'error', 
            payload: { message: err.message } 
          }));
        }
      });
      
      connection.socket.on('close', () => {
        logger.info(`WebSocket 断开: ${clientId}`);
        wsClients.delete(clientId);
      });
    });
  });
  
  // ==================== HTTP API ====================
  
  // 聊天接口 - 支持多 Agent
  fastify.post('/chat', async (request, reply) => {
    stats.totalRequests++;

    // Rate limiting
    const clientIp = request.ip || 'unknown';
    const rateCheck = checkRateLimit(`ip:${clientIp}`, 30, 60000);

    if (!rateCheck.allowed) {
      stats.rateLimitedRequests++;
      return reply.status(429).send({
        error: 'Too many requests',
        retryAfter: 60
      });
    }

    const { message, sessionKey, context, agent: requestedAgentId } = request.body;

    // 输入大小限制
    const maxMessageSize = 100000;
    if (message && message.length > maxMessageSize) {
      return reply.status(400).send({ error: 'Message too large' });
    }

    if (!message) {
      return reply.status(400).send({ error: 'message is required' });
    }

    const startTime = Date.now();
    try {
      // 智能路由选择 Agent
      const agent = await agentFactory.select(message, {
        sessionKey,
        agentId: requestedAgentId,
        ...context,
      });

      if (!agent) {
        return reply.status(404).send({ error: 'No available agent' });
      }

      // 生成带 agentId 的会话 key
      const agentSessionKey = agent.sessionManager?.generateSessionKey?.({
        agentId: agent.metadata.id,
        ...(context || {}),
      }) || sessionKey;

      const finalSessionKey = sessionKey || agentSessionKey;

      const response = await agent.chat(message, finalSessionKey);

      // 记录指标
      const duration = Date.now() - startTime;
      metricHelpers.recordModelCall(agent.metadata.model, response.tokens?.input + response.tokens?.output || 0, duration);
      if (response.toolCalls > 0) {
        metricHelpers.recordToolExecution('agent_chat', duration, true);
      }

      return {
        success: true,
        response: response.content,
        agentId: agent.metadata.id,
        agentName: agent.metadata.name,
        sessionId: response.sessionId,
        sessionKey: response.sessionKey,
        tokens: response.tokens,
        toolCalls: response.toolCalls,
        duration: response.duration,
      };
    } catch (err) {
      stats.totalErrors++;
      metricHelpers.recordModelCall(requestedAgentId || 'default', 0, Date.now() - startTime);
      logger.error('Chat 错误:', err.message);
      throw err;
    }
  });
  
  // 工具调用接口
  fastify.post('/tools/:toolName', async (request, reply) => {
    stats.totalRequests++;
    
    const { toolName } = request.params;
    const args = request.body || {};
    
    try {
      const result = await toolRegistry.execute(toolName, args);
      return { success: true, result };
    } catch (err) {
      stats.totalErrors++;
      logger.error(`工具执行错误 [${toolName}]:`, err.message);
      throw err;
    }
  });
  
  // 工具列表
  fastify.get('/tools', async () => {
    return {
      tools: toolRegistry.getTools().map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }))
    };
  });
  
  // 技能列表
  fastify.get('/skills', async () => {
    return {
      skills: skillsLoader.getAll().map(s => ({
        name: s.name,
        description: s.description,
        instructions: s.instructions?.substring(0, 200),
      }))
    };
  });
  
  // ==================== Webhook（用于其他渠道） ====================
  fastify.post('/webhook/:channel', async (request, reply) => {
    const { channel } = request.params;
    const handler = channelManager?.getHandler?.(channel);
    
    if (!handler) {
      return reply.status(404).send({ error: 'Channel not found' });
    }
    
    try {
      const result = await handler.handleWebhook(request, reply);
      return result;
    } catch (err) {
      logger.error(`Webhook 错误 (${channel}):`, err);
      throw err;
    }
  });
  
  // ==================== WebSocket 消息处理 ====================
  async function handleWsMessage(msg, clientId, client) {
    const { type, payload } = msg;

    try {
      switch (type) {
        case 'chat': {
          stats.totalRequests++;
          
          const { message, sessionKey, agentId: requestedAgentId } = payload;
          
          // 选择 Agent
          const agent = await agentFactory.select(message, {
            sessionKey,
            agentId: requestedAgentId,
          });
          
          if (!agent) {
            return { type: 'error', payload: { message: 'No available agent' } };
          }
          
          // 更新客户端当前 Agent
          if (client) {
            client.currentAgent = agent.metadata.id;
          }
          
          const response = await agent.chat(message, sessionKey);
          
          return { 
            type: 'response', 
            payload: {
              ...response,
              agentId: agent.metadata.id,
              agentName: agent.metadata.name,
            }
          };
        }

        case 'switch_agent': {
          // 切换当前会话的 Agent
          const { sessionKey, agentId: newAgentId } = payload;
          
          const result = agentFactory.switchSessionAgent(sessionKey, newAgentId);
          
          if (result.success && client) {
            client.currentAgent = newAgentId;
          }
          
          return { type: 'agent_switched', payload: result };
        }

        case 'tool_call': {
          const result = await toolRegistry.execute(payload.tool, payload.args);
          return { type: 'tool_result', payload: result };
        }

        case 'ping':
          return { type: 'pong' };

        case 'stats': {
          const agentStats = agentFactory?.getStats() || {};
          return { 
            type: 'stats', 
            payload: {
              ...stats,
              agents: agentStats,
            }
          };
        }

        case 'agents': {
          return {
            type: 'agents',
            payload: {
              agents: agentFactory?.getAllInfo() || [],
              default: agentFactory?.getDefault?.()?.metadata?.id,
            }
          };
        }

        default:
          return { type: 'error', payload: { message: `Unknown type: ${type}` } };
      }
    } catch (err) {
      logger.error(`WebSocket 消息处理错误 [${type}]:`, err.message);
      return { type: 'error', payload: { message: err.message } };
    }
  }
  
  // ==================== 返回 Gateway 实例 ====================
  let actualPort = config.port;
  let isRunning = false;

  return {
    fastify,
    stats,
    get port() { return actualPort; },
    get isRunning() { return isRunning; },

    /**
     * 启动 Gateway
     * @param {Object} options - 启动选项
     * @param {boolean} options.autoPort - 端口冲突时是否自动切换
     * @param {number} options.maxPortAttempts - 最大端口尝试次数
     */
    async start(options = {}) {
      const { autoPort = true, maxPortAttempts = 10 } = options;

      let targetPort = config.port;
      let targetHost = config.host || '0.0.0.0';

      // 检查端口是否可用
      if (!(await isPortAvailable(targetPort, targetHost))) {
        if (autoPort) {
          logger.warn(`端口 ${targetPort} 已被占用，尝试查找可用端口...`);
          const availablePort = await findAvailablePort(targetPort, targetHost, maxPortAttempts);

          if (availablePort) {
            logger.info(`找到可用端口: ${availablePort}`);
            targetPort = availablePort;
          } else {
            throw new Error(
              `无法找到可用端口（尝试范围: ${config.port}-${config.port + maxPortAttempts - 1}）。` +
              `请手动指定一个可用端口，或关闭占用端口的程序。`
            );
          }
        } else {
          throw new Error(
            `端口 ${targetPort} 已被占用。` +
            `请修改 config/config.yaml 中的 gateway.port，或关闭占用该端口的程序。`
          );
        }
      }

      try {
        await fastify.listen({ port: targetPort, host: targetHost });
        actualPort = targetPort;
        isRunning = true;

        logger.info(`✅ Gateway 启动成功`);
        logger.info(`   监听地址: ${targetHost}:${actualPort}`);

        // 如果使用了自动切换的端口，提示用户
        if (actualPort !== config.port) {
          logger.info(`   原配置端口: ${config.port} → 实际使用端口: ${actualPort}`);
          logger.info(`   提示: 如需固定端口，请修改 config/config.yaml`);
        }

        logger.info(`API 端点:`);
        logger.info(`  GET  /health       - 健康检查`);
        logger.info(`  GET  /stats        - 统计信息`);
        logger.info(`  GET  /metrics      - Prometheus 指标`);
        logger.info(`  GET  /agents       - Agent 列表`);
        logger.info(`  GET  /agents/:id   - Agent 详情`);
        logger.info(`  GET  /sessions     - 会话列表`);
        logger.info(`  GET  /tools        - 工具列表`);
        logger.info(`  GET  /skills       - 技能列表`);
        logger.info(`  POST /chat         - 发送消息`);
        logger.info(`  WS   /ws           - WebSocket 连接`);

        return { port: actualPort, host: targetHost };
      } catch (err) {
        isRunning = false;

        // 提供更友好的错误信息
        if (err.code === 'EADDRINUSE') {
          throw new Error(
            `端口 ${targetPort} 已被占用。` +
            `请检查是否有其他 MiniClaw 实例正在运行，或修改配置文件中的端口号。`
          );
        }

        if (err.code === 'EACCES') {
          throw new Error(
            `没有权限绑定端口 ${targetPort}。` +
            `请尝试使用大于 1024 的端口号，或以管理员权限运行。`
          );
        }

        throw err;
      }
    },

    async stop() {
      if (!isRunning) {
        logger.debug('Gateway 未在运行，跳过停止');
        return;
      }

      logger.info('正在关闭 Gateway...');

      try {
        // 关闭所有 Agent 的会话
        agentFactory?.close?.();

        // 关闭 Fastify 服务器
        await fastify.close();
        isRunning = false;

        logger.info('Gateway 已关闭');
      } catch (err) {
        logger.error('关闭 Gateway 时出错:', err.message);
        throw err;
      }
    },
    
    /**
     * 广播消息到所有 WebSocket 客户端
     * @param {Object} msg - 要广播的消息
     * @returns {number} - 成功发送的客户端数量
     */
    broadcast(msg) {
      if (wsClients.size === 0) return 0;

      let sentCount = 0;
      const data = JSON.stringify(msg);

      for (const [id, client] of wsClients) {
        try {
          if (client.connection.socket.readyState === 1) { // OPEN state
            client.connection.socket.send(data);
            sentCount++;
          }
        } catch (err) {
          logger.warn(`广播消息到客户端 ${id} 失败:`, err.message);
        }
      }

      return sentCount;
    },

    /**
     * 发送消息到指定客户端
     * @param {string} clientId - 客户端 ID
     * @param {Object} msg - 要发送的消息
     * @returns {boolean} - 是否成功发送
     */
    send(clientId, msg) {
      const client = wsClients.get(clientId);
      if (!client) return false;

      try {
        if (client.connection.socket.readyState === 1) { // OPEN state
          client.connection.socket.send(JSON.stringify(msg));
          return true;
        }
      } catch (err) {
        logger.warn(`发送消息到客户端 ${clientId} 失败:`, err.message);
      }

      return false;
    },

    /**
     * 获取 WebSocket 客户端信息
     * @returns {Array} - 客户端信息列表
     */
    getClients() {
      return Array.from(wsClients.entries()).map(([id, client]) => ({
        id,
        connectedAt: client.connectedAt,
        messages: client.messages,
        currentAgent: client.currentAgent,
      }));
    },

    /**
     * 断开指定客户端连接
     * @param {string} clientId - 客户端 ID
     * @param {number} code - 关闭代码
     * @param {string} reason - 关闭原因
     * @returns {boolean} - 是否成功断开
     */
    disconnectClient(clientId, code = 1000, reason = 'Server initiated disconnect') {
      const client = wsClients.get(clientId);
      if (!client) return false;

      try {
        client.connection.socket.close(code, reason);
        wsClients.delete(clientId);
        return true;
      } catch (err) {
        logger.warn(`断开客户端 ${clientId} 连接失败:`, err.message);
        return false;
      }
    }
  };
}
