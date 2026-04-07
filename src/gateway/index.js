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

const logger = createLogger('gateway');

export function createGateway(config, deps) {
  const { agentFactory, channelManager, toolRegistry, skillsLoader } = deps;

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
    };
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
  return {
    fastify,
    stats,
    
    async start() {
      await fastify.listen({ port: config.port, host: config.host });
      logger.info(`Gateway 监听 ${config.host}:${config.port}`);
      logger.info(`API 端点:`);
      logger.info(`  GET  /health       - 健康检查`);
      logger.info(`  GET  /stats        - 统计信息`);
      logger.info(`  GET  /agents       - Agent 列表`);
      logger.info(`  GET  /agents/:id   - Agent 详情`);
      logger.info(`  GET  /sessions     - 会话列表`);
      logger.info(`  GET  /tools        - 工具列表`);
      logger.info(`  GET  /skills       - 技能列表`);
      logger.info(`  POST /chat         - 发送消息`);
      logger.info(`  WS   /ws           - WebSocket 连接`);
    },
    
    async stop() {
      // 关闭所有 Agent 的会话
      agentFactory?.close?.();
      await fastify.close();
    },
    
    broadcast(msg) {
      const data = JSON.stringify(msg);
      for (const [_, client] of wsClients) {
        client.connection.socket.send(data);
      }
    },
    
    send(clientId, msg) {
      const client = wsClients.get(clientId);
      if (client) {
        client.connection.socket.send(JSON.stringify(msg));
      }
    }
  };
}
