/**
 * Agent Router - 智能路由模块
 * 支持多种路由策略：pattern(关键词) | llm(LLM判断) | hybrid(混合)
 */

import { createLogger } from '../utils/logger.js';
import OpenAI from 'openai';

const logger = createLogger('agent-router');

/**
 * 创建路由器
 * @param {Object} config - 路由配置
 * @returns {Object} 路由器实例
 */
export function createRouter(config = {}) {
  const strategy = config.strategy || 'hybrid';
  const defaultAgentId = config.default_agent || 'default';
  const llmConfig = config.llm || {};
  
  const registeredAgents = new Map();
  let llmClient = null;
  
  // 初始化 LLM 客户端（用于智能路由）
  if (strategy === 'llm' || strategy === 'hybrid') {
    const apiKey = llmConfig.api_key || process.env.MODEL_API_KEY;
    const baseURL = llmConfig.base_url || process.env.MODEL_API_BASE;
    
    if (apiKey && apiKey.length > 0 && !apiKey.includes('your-')) {
      llmClient = new OpenAI({
        apiKey: apiKey,
        baseURL: baseURL,
      });
      logger.debug('LLM 路由客户端已初始化');
    } else {
      logger.warn('LLM 路由需要有效的 API Key，将回退到 pattern 模式');
    }
  }
  
  /**
   * 注册 Agent
   */
  function registerAgent(agent) {
    registeredAgents.set(agent.metadata.id, {
      id: agent.metadata.id,
      name: agent.metadata.name,
      description: agent.metadata.description,
      skills: agent.metadata.skills,
      patterns: agent.metadata.route?.patterns || [],
      priority: agent.metadata.route?.priority ?? 5,
    });
  }
  
  /**
   * 关键词模式匹配路由
   * @param {string} message - 用户消息
   * @param {Map} agents - Agent 集合
   * @returns {string} 选中的 Agent ID
   */
  function routeByPattern(message, agents) {
    const matches = [];
    
    for (const [id, agent] of agents) {
      const metadata = registeredAgents.get(id);
      if (!metadata) continue;
      
      const patterns = metadata.patterns || [];
      
      for (const pattern of patterns) {
        try {
          // 支持正则表达式和简单关键词
          const regex = new RegExp(pattern, 'i');
          if (regex.test(message)) {
            matches.push({
              id,
              priority: metadata.priority,
              matchedPattern: pattern,
            });
            break; // 一个 Agent 只匹配一次
          }
        } catch (err) {
          // 非法正则，作为普通字符串匹配
          if (message.toLowerCase().includes(pattern.toLowerCase())) {
            matches.push({
              id,
              priority: metadata.priority,
              matchedPattern: pattern,
            });
            break;
          }
        }
      }
    }
    
    if (matches.length === 0) {
      return defaultAgentId;
    }
    
    // 按优先级排序（高优先级优先）
    matches.sort((a, b) => b.priority - a.priority);
    
    logger.debug(`模式匹配: ${message.substring(0, 50)}... -> ${matches[0].id} (pattern: ${matches[0].matchedPattern})`);
    
    return matches[0].id;
  }
  
  /**
   * LLM 智能路由
   * @param {string} message - 用户消息
   * @param {Map} agents - Agent 集合
   * @returns {Promise<string>} 选中的 Agent ID
   */
  async function routeByLLM(message, agents) {
    if (!llmClient) {
      logger.warn('LLM 客户端未初始化，回退到模式匹配');
      return routeByPattern(message, agents);
    }
    
    // 构建路由提示
    const agentList = Array.from(agents.values()).map(agent => {
      const meta = registeredAgents.get(agent.metadata.id);
      return {
        id: agent.metadata.id,
        name: agent.metadata.name,
        description: agent.metadata.description || '',
        skills: meta?.skills || [],
      };
    });
    
    const prompt = buildRouterPrompt(message, agentList);
    
    try {
      const startTime = Date.now();
      
      const response = await llmClient.chat.completions.create({
        model: llmConfig.model || process.env.MODEL_NAME || 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: '你是 Agent 路由助手，任务是选择最合适的 Agent 处理用户请求。只返回 Agent ID，不要解释。' },
          { role: 'user', content: prompt }
        ],
        temperature: llmConfig.temperature ?? 0,
        max_tokens: llmConfig.max_tokens || 50,
      });
      
      const result = response.choices[0].message.content.trim();
      const duration = Date.now() - startTime;
      
      // 解析结果
      const selectedId = parseLLMResponse(result, agents);
      
      logger.info(`LLM 路由: ${message.substring(0, 50)}... -> ${selectedId} (${duration}ms)`);
      
      return selectedId;
    } catch (err) {
      logger.error('LLM 路由失败:', err.message);
      return routeByPattern(message, agents);
    }
  }
  
  /**
   * 构建路由提示词
   */
  function buildRouterPrompt(message, agents) {
    let prompt = `请根据用户消息，选择最合适的 Agent 来处理。

可用 Agent 列表：
`;
    
    for (const agent of agents) {
      prompt += `\n[${agent.id}] ${agent.name}\n`;
      if (agent.description) {
        prompt += `  描述: ${agent.description}\n`;
      }
      if (agent.skills && agent.skills.length > 0) {
        prompt += `  技能: ${agent.skills.join(', ')}\n`;
      }
    }
    
    prompt += `\n选择规则：
1. 分析用户意图，选择最匹配的 Agent
2. 如果涉及多个领域，选择最相关的那个
3. 如果不确定，选择 "default"
4. 只返回 Agent ID，不要任何解释

用户消息: "${message.substring(0, 500)}"

Agent ID:`;
    
    return prompt;
  }
  
  /**
   * 解析 LLM 响应
   */
  function parseLLMResponse(response, agents) {
    // 清理响应
    let cleaned = response.trim().toLowerCase();
    
    // 移除常见前缀
    cleaned = cleaned.replace(/^(agent|选择|推荐|答案是?)[:：]?\s*/i, '');
    
    // 提取第一个有效的 Agent ID
    const words = cleaned.split(/[\s,，.。]+/);
    
    for (const word of words) {
      const id = word.trim();
      if (agents.has(id)) {
        return id;
      }
      // 尝试匹配名称
      for (const [agentId, agent] of agents) {
        if (agent.metadata.name.toLowerCase().includes(id) || 
            id.includes(agent.metadata.name.toLowerCase())) {
          return agentId;
        }
      }
    }
    
    return defaultAgentId;
  }
  
  /**
   * 混合路由策略
   * 1. 先尝试关键词匹配（高置信度）
   * 2. 如果不确定，使用 LLM 判断
   */
  async function routeHybrid(message, agents) {
    // 先进行模式匹配
    const patternResult = routeByPattern(message, agents);
    
    // 如果匹配到了高优先级 Agent，直接使用
    const matchedAgent = registeredAgents.get(patternResult);
    if (matchedAgent && matchedAgent.priority >= 8) {
      logger.debug(`混合路由: 高优先级匹配 ${patternResult}`);
      return patternResult;
    }
    
    // 如果消息较短或没有匹配，使用 LLM
    if (message.length < 20 || patternResult === defaultAgentId) {
      return await routeByLLM(message, agents);
    }
    
    return patternResult;
  }
  
  /**
   * 异步路由（主入口）
   */
  async function route(message, agents, forceLLM = false) {
    if (!message || message.trim().length === 0) {
      return defaultAgentId;
    }
    
    const trimmedMessage = message.trim();
    
    if (forceLLM) {
      return await routeByLLM(trimmedMessage, agents);
    }
    
    switch (strategy) {
      case 'pattern':
        return routeByPattern(trimmedMessage, agents);
      case 'llm':
        return await routeByLLM(trimmedMessage, agents);
      case 'hybrid':
      default:
        return await routeHybrid(trimmedMessage, agents);
    }
  }
  
  /**
   * 同步路由（不使用 LLM）
   */
  function routeSync(message, agents) {
    if (!message || message.trim().length === 0) {
      return defaultAgentId;
    }
    
    return routeByPattern(message.trim(), agents);
  }
  
  /**
   * 分析路由决策（用于调试）
   */
  async function analyze(message, agents) {
    const patternResult = routeByPattern(message, agents);
    let llmResult = null;
    let llmReasoning = null;
    
    if (llmClient) {
      try {
        const agentList = Array.from(agents.values()).map(agent => ({
          id: agent.metadata.id,
          name: agent.metadata.name,
          description: agent.metadata.description || '',
          skills: registeredAgents.get(agent.metadata.id)?.skills || [],
        }));
        
        const prompt = buildRouterPrompt(message, agentList) + `

请解释你的选择理由，格式：
选择: [Agent ID]
理由: [简要解释]
置信度: [高/中/低]`;
        
        const response = await llmClient.chat.completions.create({
          model: llmConfig.model || process.env.MODEL_NAME || 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 200,
        });
        
        llmResult = parseLLMResponse(response.choices[0].message.content, agents);
        llmReasoning = response.choices[0].message.content;
      } catch (err) {
        llmReasoning = `错误: ${err.message}`;
      }
    }
    
    return {
      message: message.substring(0, 100),
      strategy,
      pattern: {
        selected: patternResult,
        agent: registeredAgents.get(patternResult)?.name,
      },
      llm: llmResult ? {
        selected: llmResult,
        agent: registeredAgents.get(llmResult)?.name,
        reasoning: llmReasoning,
      } : null,
      final: strategy === 'hybrid' && llmResult ? llmResult : patternResult,
    };
  }
  
  return {
    registerAgent,
    route,
    routeSync,
    routeByPattern,
    routeByLLM,
    analyze,
  };
}

/**
 * 提取消息中的 @agent 提及
 * @param {string} message - 用户消息
 * @returns {Object} { text: 清理后的消息, agentId: 提及的 Agent ID }
 */
export function extractAgentMention(message) {
  if (!message) return { text: '', agentId: null };
  
  // 匹配 @agent-id 或 @agent_name 格式
  const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
  const matches = message.match(mentionRegex);
  
  if (!matches || matches.length === 0) {
    return { text: message, agentId: null };
  }
  
  // 取第一个 @mention
  const agentId = matches[0].substring(1);
  
  // 移除所有 @mention
  const cleanedText = message.replace(mentionRegex, '').trim();
  
  return { text: cleanedText, agentId };
}

/**
 * 解析 /agent 命令
 * @param {string} message - 用户消息
 * @returns {Object} { isCommand: boolean, agentId: string, text: string }
 */
export function parseAgentCommand(message) {
  if (!message) return { isCommand: false, agentId: null, text: message };
  
  // 匹配 /agent <agent-id> [message] 格式
  const commandRegex = /^\/agent\s+([a-zA-Z0-9_-]+)(?:\s+(.*))?$/i;
  const match = message.match(commandRegex);
  
  if (match) {
    return {
      isCommand: true,
      agentId: match[1],
      text: match[2] || '',
    };
  }
  
  return { isCommand: false, agentId: null, text: message };
}
