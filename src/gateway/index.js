/**
 * Gateway - WebSocket + HTTP Server
 * 学习 OpenClaw 的 Gateway 设计
 */

import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import { createLogger } from '../utils/logger.js';
import { createAuth } from '../utils/auth.js';

const logger = createLogger('gateway');

export function createGateway(config, deps) {
  const { agent, channelManager, toolRegistry, skillsLoader } = deps;

  const fastify = Fastify({ logger: false });
  fastify.register(websocket);
  fastify.register(cors, { origin: '*' });

  // ==================== 认证中间件 ====================
  const authMiddleware = createAuth({
    enableApiKey: true,
    publicPaths: ['/health', '/', '/ws'], // WebSocket 路径单独处理认证
    apiKeys: process.env.API_KEYS?.split(',').filter(Boolean),
  });

  // 注册认证中间件
  fastify.addHook('preHandler', authMiddleware);

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
      // 参数验证错误
      return reply.status(400).send({
        error: 'Validation Error',
        message: '请求参数不符合要求',
        details: error.validation,
      });
    }

    if (error.statusCode) {
      // 已知的 HTTP 错误
      return reply.status(error.statusCode).send({
        error: error.name || 'Error',
        message: error.message,
      });
    }

    // 未知错误 - 返回通用错误信息，避免泄露内部细节
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: '服务器内部错误，请稍后重试',
      requestId: request.id || Date.now().toString(),
    });
  });

  // 未捕获的 promise 拒绝处理
  fastify.addHook('onRequest', async (request, reply) => {
    request.startTime = Date.now();
  });

  // 请求日志和性能监控
  fastify.addHook('onResponse', async (request, reply) => {
    const duration = Date.now() - request.startTime;
    if (duration > 1000) {
      logger.warn(`慢请求 [${request.method} ${request.url}]: ${duration}ms`);
    }

    // 记录认证信息
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
    };
  });
  
  // ==================== 状态统计 ====================
  fastify.get('/stats', async () => {
    const sessionStats = agent?.getSessionStats?.() || {};
    
    return {
      uptime: Math.floor((Date.now() - stats.startTime) / 1000),
      requests: stats.totalRequests,
      messages: stats.totalMessages,
      errors: stats.totalErrors,
      sessions: sessionStats,
      tools: toolRegistry?.getTools?.()?.length || 0,
      skills: skillsLoader?.getAll?.()?.length || 0,
      wsClients: wsClients.size,
    };
  });
  
  // ==================== 会话管理 ====================
  fastify.get('/sessions', async (request, reply) => {
    const limit = parseInt(request.query.limit) || 20;
    const sessions = agent?.sessionManager?.listSessions?.(limit) || [];
    return { sessions };
  });
  
  // ==================== WebSocket 端点 ====================
  fastify.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, (connection, req) => {
      // 简单的 token 认证（通过 query 参数）
      const token = req.query.token;
      const validToken = process.env.WS_AUTH_TOKEN;
      
      // 如果配置了认证 token，则验证
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
      });
      
      // 发送欢迎消息
      connection.socket.send(JSON.stringify({
        type: 'connected',
        payload: { clientId }
      }));
      
      connection.socket.on('message', async (data) => {
        stats.totalMessages++;
        
        try {
          const msg = JSON.parse(data.toString());
          const client = wsClients.get(clientId);
          if (client) client.messages++;
          
          const response = await handleWsMessage(msg, clientId);
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
  
  // 聊天接口
  fastify.post('/chat', async (request, reply) => {
    stats.totalRequests++;
    
    // Rate limiting
    const clientIp = request.ip || 'unknown';
    const rateCheck = checkRateLimit(`ip:${clientIp}`, 30, 60000); // 30次/分钟
    
    if (!rateCheck.allowed) {
      stats.rateLimitedRequests++;
      return reply.status(429).send({ 
        error: 'Too many requests', 
        retryAfter: 60 
      });
    }
    
    const { message, sessionKey, context } = request.body;
    
    // 输入大小限制
    const maxMessageSize = 100000; // 100KB
    if (message && message.length > maxMessageSize) {
      return reply.status(400).send({ error: 'Message too large' });
    }
    
    if (!message) {
      return reply.status(400).send({ error: 'message is required' });
    }
    
    try {
      const response = await agent.chat(message, sessionKey || context);
      return {
        success: true,
        response: response.content,
        sessionId: response.sessionId,
        sessionKey: response.sessionKey,
      };
    } catch (err) {
      stats.totalErrors++;
      logger.error('Chat 错误:', err.message);
      // 让全局错误处理器处理
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
      // 让全局错误处理器处理
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
  
  // 重置会话
  fastify.delete('/sessions/:sessionKey', async (request, reply) => {
    const { sessionKey } = request.params;
    agent?.resetSession?.(sessionKey);
    return { success: true, message: 'Session reset' };
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
      // 让全局错误处理器处理
      throw err;
    }
  });
  
  // ==================== WebSocket 消息处理 ====================
  async function handleWsMessage(msg, clientId) {
    const { type, payload } = msg;

    try {
      switch (type) {
        case 'chat':
          stats.totalRequests++;
          const response = await agent.chat(payload.message, payload.sessionKey || payload.context);
          return { type: 'response', payload: response };

        case 'tool_call':
          const result = await toolRegistry.execute(payload.tool, payload.args);
          return { type: 'tool_result', payload: result };

        case 'ping':
          return { type: 'pong' };

        case 'stats':
          return { type: 'stats', payload: stats };

        default:
          return { type: 'error', payload: { message: `Unknown type: ${type}` } };
      }
    } catch (err) {
      logger.error(`WebSocket 消息处理错误 [${type}]:`, err.message);
      return { type: 'error', payload: { message: err.message } };
    }
  }
  
  // ==================== 返回 Gateway 实例 ====================
  return {
    fastify,
    stats,
    
    async start() {
      await fastify.listen({ port: config.port, host: config.host });
      logger.info(`Gateway 监听 ${config.host}:${config.port}`);
      logger.info(`API 端点:`);
      logger.info(`  GET  /health   - 健康检查`);
      logger.info(`  GET  /stats    - 统计信息`);
      logger.info(`  GET  /sessions - 会话列表`);
      logger.info(`  GET  /tools    - 工具列表`);
      logger.info(`  GET  /skills   - 技能列表`);
      logger.info(`  POST /chat     - 发送消息`);
      logger.info(`  WS   /ws       - WebSocket 连接`);
    },
    
    async stop() {
      // 保存会话
      agent?.sessionManager?.close?.();
      await fastify.close();
    },
    
    // 广播消息
    broadcast(msg) {
      const data = JSON.stringify(msg);
      for (const [_, client] of wsClients) {
        client.connection.socket.send(data);
      }
    },
    
    // 发送给指定客户端
    send(clientId, msg) {
      const client = wsClients.get(clientId);
      if (client) {
        client.connection.socket.send(JSON.stringify(msg));
      }
    }
  };
}
