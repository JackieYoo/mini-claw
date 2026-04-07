/**
 * Agent - LLM Integration with Tool Calling
 * 学习 OpenClaw 的 Agent 设计
 */

import OpenAI from 'openai';
import { createLogger } from '../utils/logger.js';
import { createSessionManager } from '../utils/session.js';
import { retryApi } from '../utils/retry.js';

const logger = createLogger('agent');

export function createAgent(config, toolRegistry) {
  // 验证配置
  if (!config.api_key) {
    throw new Error('API Key 未配置，请检查 .env 文件中的 MODEL_API_KEY');
  }
  if (!config.model) {
    throw new Error('模型名称未配置，请检查 .env 文件中的 MODEL_NAME');
  }
  
  const client = new OpenAI({
    apiKey: config.api_key,
    baseURL: config.base_url || 'https://api.openai.com/v1',
  });
  
  // 会话管理器（支持持久化）
  const sessionManager = createSessionManager({
    dmScope: 'per-channel-peer',
    maxMessagesPerSession: config.max_history || 50,
    persistDir: config.persist_dir || null,
  });
  
  const systemPrompt = config.system_prompt || 
    `你是一个智能助手。请简洁、准确地回答问题。
如果需要使用工具来完成任务，请调用相应的工具函数。`;
  
  logger.info(`Agent 初始化完成:`);
  logger.info(`  模型: ${config.model}`);
  logger.info(`  API: ${config.base_url || 'OpenAI 默认'}`);
  logger.info(`  工具数: ${toolRegistry.getTools().length}`);
  
  // 统计
  const stats = {
    totalCalls: 0,
    totalTokens: { input: 0, output: 0 },
    totalErrors: 0,
    toolCalls: 0,
  };
  
  // 获取工具 Schema
  function getToolsSchema() {
    const tools = toolRegistry.getTools();
    if (tools.length === 0) return undefined;
    
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }));
  }
  

  // 验证并修复消息格式（统一的单次验证）
  function validateMessages(messages) {
    if (!messages || messages.length === 0) {
      logger.error('消息数组为空！');
      return { valid: false, messages: [], errors: ['消息数组为空'] };
    }

    const validMessages = [];
    const warnings = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      // 检查必需字段
      if (!msg.role) {
        warnings.push(`消息 ${i} 缺少 role 字段，跳过`);
        continue;
      }

      // 处理不同类型的消息（修复而非跳过）
      if (msg.role === 'tool') {
        // tool 消息必须有 tool_call_id，如果没有则生成一个
        if (!msg.tool_call_id) {
          warnings.push(`消息 ${i} 是 tool 角色但缺少 tool_call_id，生成默认值`);
          msg.tool_call_id = `fallback_${Date.now()}_${i}`;
        }
        if (msg.content === undefined || msg.content === null) {
          msg.content = '';
        }
      } else if (msg.role === 'assistant') {
        // assistant 消息可以有 content 或 tool_calls
        if (!msg.content && (!msg.tool_calls || msg.tool_calls.length === 0)) {
          warnings.push(`消息 ${i} 是 assistant 角色但没有 content 或 tool_calls，设置默认内容`);
          msg.content = '(无内容)';
        }
      } else if (msg.role === 'user' || msg.role === 'system') {
        // user 和 system 消息必须有 content
        if (msg.content === undefined || msg.content === null) {
          warnings.push(`消息 ${i} 是 ${msg.role} 角色但 content 为空，设置默认内容`);
          msg.content = '(空消息)';
        }
      } else {
        warnings.push(`消息 ${i} 有未知的 role: ${msg.role}，作为 user 处理`);
        msg.role = 'user';
        if (!msg.content) msg.content = '(空消息)';
      }

      validMessages.push(msg);
    }

    // 确保第一条消息是 system 或 user
    if (validMessages.length > 0 &&
        validMessages[0].role !== 'system' &&
        validMessages[0].role !== 'user') {
      warnings.push('第一条消息不是 system 或 user，移除');
      validMessages.shift();
    }

    // 记录警告（如果有）
    if (warnings.length > 0 && process.env.DEBUG_MESSAGES === 'true') {
      logger.debug('消息验证警告:', warnings);
    }

    return {
      valid: warnings.length === 0,
      messages: validMessages,
      warnings
    };
  }

    // 估算 token 数（简单估算）
  function estimateTokens(text) {
    if (!text) return 0;
    // 粗略估算：中文约 0.5 字/token，英文约 0.25 字/token
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars * 0.5 + otherChars * 0.25);
  }
  
  // 核心聊天函数
  async function chat(message, context = {}) {
    stats.totalCalls++;
    
    // 支持多种上下文格式
    let sessionKey;
    if (typeof context === 'string') {
      sessionKey = context;
    } else {
      sessionKey = sessionManager.generateSessionKey({
        channel: context.channel || 'default',
        chatType: context.chatType || 'dm',
        chatId: context.chatId || 'default',
        senderId: context.senderId,
      });
    }
    
    logger.debug(`处理消息 [${sessionKey}]: ${message?.substring(0, 50)}...`);
    
    // 获取会话
    const session = sessionManager.getSession(sessionKey, systemPrompt);
    
    // 添加用户消息
    sessionManager.addMessage(sessionKey, { role: 'user', content: message });
    
    try {
      // 构建请求参数
      // 单次验证消息格式
      const validation = validateMessages(session.messages);

      if (validation.messages.length === 0) {
        throw new Error('消息验证失败：没有有效的消息');
      }

      // 调试日志
      if (process.env.DEBUG_MESSAGES === 'true') {
        console.log('\n=== 发送给 API 的 messages ===');
        console.log(JSON.stringify(validation.messages, null, 2));
        console.log('messages 数量:', validation.messages.length);
        if (validation.warnings.length > 0) {
          console.log('验证警告:', validation.warnings);
        }
        console.log('================================\n');
      }

      const requestParams = {
        model: config.model,
        messages: validation.messages,
        temperature: config.temperature || 0.7,
        max_tokens: config.max_tokens || 4096,
      };

      const toolsSchema = getToolsSchema();
      if (toolsSchema) {
        requestParams.tools = toolsSchema;
        requestParams.tool_choice = 'auto';
      }

      // 调试日志
      logger.debug(`发送到 API 的消息数: ${validation.messages.length}`);
      logger.debug(`第一条消息: ${JSON.stringify(validation.messages[0])}`);
      if (validation.messages.length > 1) {
        logger.debug(`最后一条消息: ${JSON.stringify(validation.messages[validation.messages.length - 1])}`);
      }
      
      logger.debug(`调用模型: ${config.model}`);
      const startTime = Date.now();

      // 使用重试机制调用 API
      let response = await retryApi(() => client.chat.completions.create(requestParams), {
        maxRetries: 3,
        initialDelay: 2000,
      });
      let assistantMessage = response.choices[0].message;
      
      // 更新 token 统计
      const inputTokens = response.usage?.prompt_tokens || estimateTokens(JSON.stringify(session.messages));
      const outputTokens = response.usage?.completion_tokens || estimateTokens(assistantMessage.content);
      stats.totalTokens.input += inputTokens;
      stats.totalTokens.output += outputTokens;
      sessionManager.updateTokenCount(sessionKey, inputTokens, outputTokens);
      
      // 处理工具调用
      let toolCallCount = 0;
      const maxToolCalls = 10;
      
      while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0 && toolCallCount < maxToolCalls) {
        toolCallCount++;
        stats.toolCalls++;
        
        // 添加助手消息（包含工具调用）
        sessionManager.addMessage(sessionKey, assistantMessage);
        
        // 执行每个工具调用
        for (const toolCall of assistantMessage.tool_calls) {
          const toolName = toolCall.function.name;
          let toolArgs = {};
          
          try {
            toolArgs = JSON.parse(toolCall.function.arguments);
          } catch (e) {
            logger.warn(`工具参数解析失败: ${toolName}`);
          }
          
          logger.info(`🔧 工具调用: ${toolName}(${JSON.stringify(toolArgs).substring(0, 100)})`);
          
          try {
            const toolStartTime = Date.now();
            const result = await toolRegistry.execute(toolName, toolArgs);
            const toolDuration = Date.now() - toolStartTime;
            
            logger.info(`✅ 工具完成: ${toolName} (${toolDuration}ms)`);
            
            sessionManager.addMessage(sessionKey, {
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(result)
            });
          } catch (err) {
            logger.error(`❌ 工具失败: ${toolName}`, err.message);
            sessionManager.addMessage(sessionKey, {
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: err.message })
            });
          }
        }
        
        // 获取下一次响应 - 使用更新后的会话消息
        const updatedSession = sessionManager.getSession(sessionKey);
        const updatedValidation = validateMessages(updatedSession.messages);

        if (updatedValidation.messages.length === 0) {
          throw new Error('更新后的消息验证失败');
        }

        // 使用重试机制调用 API
        response = await retryApi(() => client.chat.completions.create({
          ...requestParams,
          messages: updatedValidation.messages,
        }), {
          maxRetries: 3,
          initialDelay: 2000,
        });
        
        assistantMessage = response.choices[0].message;
      }
      
      // 添加最终响应
      const finalContent = assistantMessage.content || '(无响应)';
      sessionManager.addMessage(sessionKey, { role: 'assistant', content: finalContent });
      
      const duration = Date.now() - startTime;
      logger.debug(`响应完成 (${duration}ms): ${finalContent.substring(0, 100)}...`);
      
      return {
        content: finalContent,
        sessionId: session.id,
        sessionKey,
        tokens: {
          input: inputTokens,
          output: outputTokens,
        },
        toolCalls: toolCallCount,
        duration,
      };
      
    } catch (err) {
      stats.totalErrors++;
      
      // 详细错误信息
      const errorInfo = {
        message: err.message,
        status: err.status,
        code: err.code,
        type: err.type,
      };
      
      logger.error('Agent 调用失败:', errorInfo);
      
      // 移除失败的用户消息
      session.messages.pop();
      
      // 根据错误类型返回友好提示
      let errorMessage = '处理请求时出错';
      
      if (err.status === 401 || err.code === 'invalid_api_key') {
        errorMessage = 'API Key 无效，请检查配置';
      } else if (err.status === 404) {
        errorMessage = 'API 端点不存在，请检查 MODEL_API_BASE 配置';
      } else if (err.status === 429) {
        errorMessage = '请求过于频繁，请稍后重试';
      } else if (err.status === 500 || err.status === 502 || err.status === 503) {
        errorMessage = '模型服务暂时不可用，请稍后重试';
      } else if (err.message?.includes('timeout')) {
        errorMessage = '请求超时，请稍后重试';
      } else if (err.message) {
        errorMessage = `处理失败: ${err.message.substring(0, 100)}`;
      }
      
      throw new Error(errorMessage);
    }
  }
  
  // 流式聊天（可选）
  async function* chatStream(message, context = {}) {
    const sessionKey = typeof context === 'string' ? context :
      sessionManager.generateSessionKey({
        channel: context.channel || 'default',
        chatType: context.chatType || 'dm',
        chatId: context.chatId || 'default',
        senderId: context.senderId,
      });

    const session = sessionManager.getSession(sessionKey, systemPrompt);
    sessionManager.addMessage(sessionKey, { role: 'user', content: message });

    // 验证消息格式
    const validation = validateMessages(session.messages);
    if (validation.messages.length === 0) {
      throw new Error('消息验证失败');
    }

    const stream = await client.chat.completions.create({
      model: config.model,
      messages: validation.messages,
      temperature: config.temperature || 0.7,
      stream: true,
    });
    
    let fullContent = '';
    
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullContent += content;
        yield { type: 'chunk', content };
      }
    }
    
    sessionManager.addMessage(sessionKey, { role: 'assistant', content: fullContent });
    yield { type: 'done', content: fullContent };
  }
  
  // 执行工具
  async function executeTool(toolName, args) {
    return toolRegistry.execute(toolName, args);
  }
  
  // 重置会话
  function resetSession(sessionKey) {
    sessionManager.resetSession(sessionKey, systemPrompt);
  }
  
  // 获取统计
  function getStats() {
    return {
      ...stats,
      sessions: sessionManager.getStats(),
    };
  }
  
  return {
    chat,
    chatStream,
    executeTool,
    resetSession,
    getStats,
    sessionManager,
    client,
  };
}
