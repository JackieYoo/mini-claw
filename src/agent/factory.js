/**
 * AgentFactory - 多 Agent 工厂
 * 负责创建、管理和路由多个 Agent 实例
 */

import { createAgent } from './index.js';
import { createLogger } from '../utils/logger.js';
import { createRouter } from './router.js';

const logger = createLogger('agent-factory');

/**
 * 创建过滤后的工具注册表
 * @param {Object} toolRegistry - 原始工具注册表
 * @param {string[]} allowedTools - 允许的工具列表
 * @returns {Object} 过滤后的工具注册表
 */
function createFilteredToolRegistry(toolRegistry, allowedTools) {
  const allTools = toolRegistry.getTools();
  const filteredTools = allTools.filter(t => allowedTools.includes(t.name));
  
  return {
    getTools: () => filteredTools,
    getToolNames: () => filteredTools.map(t => t.name),
    getToolsDescription: () => {
      if (filteredTools.length === 0) return '';
      const desc = filteredTools.map(t => 
        `- ${t.name}: ${t.description}`
      ).join('\n');
      return `\n你可以使用以下工具:\n${desc}`;
    },
    execute: async (name, args) => {
      if (!allowedTools.includes(name)) {
        throw new Error(`Agent 无权使用工具: ${name}`);
      }
      return toolRegistry.execute(name, args);
    }
  };
}

/**
 * 创建 Agent 工厂
 * @param {Object} config - 多 Agent 配置
 * @param {Object} toolRegistry - 工具注册表
 * @returns {Object} Agent 工厂实例
 */
export function createAgentFactory(config, toolRegistry) {
  const agents = new Map();
  const sessionAgentMap = new Map(); // sessionKey -> agentId
  const defaults = config.defaults || {};
  const routerConfig = config.router || { strategy: 'hybrid', default_agent: 'default' };
  const defaultAgentId = routerConfig.default_agent || 'default';
  
  logger.info('初始化 Agent 工厂...');
  
  // 创建路由管理器
  const router = createRouter(routerConfig);
  
  // 初始化所有 Agent
  for (const [id, agentConfig] of Object.entries(config.agents || {})) {
    try {
      logger.info(`创建 Agent: ${id} (${agentConfig.name || id})`);
      
      // 合并配置（默认值 + Agent 特定配置）
      const mergedConfig = {
        api_key: agentConfig.api_key || defaults.api_key,
        base_url: agentConfig.base_url || defaults.base_url,
        model: agentConfig.model || defaults.model,
        temperature: agentConfig.temperature ?? defaults.temperature ?? 0.7,
        max_tokens: agentConfig.max_tokens || defaults.max_tokens || 4096,
        max_history: agentConfig.max_history || defaults.max_history || 50,
        system_prompt: agentConfig.system_prompt || '',
      };
      
      // 验证必要配置
      if (!mergedConfig.api_key) {
        throw new Error(`Agent ${id}: API Key 未配置`);
      }
      if (!mergedConfig.model) {
        throw new Error(`Agent ${id}: 模型名称未配置`);
      }
      
      // 过滤工具
      const allowedTools = agentConfig.tools || [];
      const filteredToolRegistry = createFilteredToolRegistry(toolRegistry, allowedTools);
      
      // 创建 Agent
      const agent = createAgent(mergedConfig, filteredToolRegistry);
      
      // 添加元数据
      agent.metadata = {
        id,
        name: agentConfig.name || id,
        description: agentConfig.description || '',
        model: mergedConfig.model,
        allowedTools,
        skills: agentConfig.skills || [],
        route: {
          patterns: agentConfig.route?.patterns || [],
          priority: agentConfig.route?.priority ?? 5,
        }
      };
      
      // 保存原始配置用于路由
      agent.rawConfig = mergedConfig;
      
      agents.set(id, agent);
      
      // 注册到路由器
      router.registerAgent(agent);
      
      logger.info(`  ✓ Agent ${id} 创建成功 (工具: ${allowedTools.length}个)`);
    } catch (err) {
      logger.error(`  ✗ Agent ${id} 创建失败:`, err.message);
      // 继续创建其他 Agent，不中断启动
    }
  }
  
  if (agents.size === 0) {
    throw new Error('没有成功创建任何 Agent，请检查配置');
  }
  
  logger.info(`Agent 工厂初始化完成，共 ${agents.size} 个 Agent`);
  
  /**
   * 获取指定 Agent
   */
  function get(agentId) {
    return agents.get(agentId);
  }
  
  /**
   * 获取默认 Agent
   */
  function getDefault() {
    return agents.get(defaultAgentId) || agents.values().next().value;
  }
  
  /**
   * 获取所有 Agent
   */
  function getAll() {
    return Array.from(agents.values());
  }
  
  /**
   * 获取所有 Agent 信息（不包含内部实例）
   */
  function getAllInfo() {
    return Array.from(agents.values()).map(agent => ({
      id: agent.metadata.id,
      name: agent.metadata.name,
      description: agent.metadata.description,
      model: agent.metadata.model,
      tools: agent.metadata.allowedTools,
      skills: agent.metadata.skills,
      route: agent.metadata.route,
    }));
  }
  
  /**
   * 选择 Agent（智能路由）
   * @param {string} message - 用户消息
   * @param {Object} context - 上下文信息
   * @param {string} context.sessionKey - 会话标识
   * @param {string} context.agentId - 显式指定的 Agent ID
   * @param {boolean} useLLM - 是否使用 LLM 智能路由
   * @returns {Object} 选中的 Agent
   */
  async function select(message, context = {}, useLLM = false) {
    const { sessionKey, agentId: explicitAgentId } = context;
    
    // 1. 显式指定 Agent（最高优先级）
    if (explicitAgentId) {
      const agent = agents.get(explicitAgentId);
      if (agent) {
        logger.debug(`路由: 显式指定 Agent ${explicitAgentId}`);
        if (sessionKey) {
          sessionAgentMap.set(sessionKey, explicitAgentId);
        }
        return agent;
      }
      logger.warn(`指定的 Agent ${explicitAgentId} 不存在，使用默认路由`);
    }
    
    // 2. 会话连续性（已绑定的 Agent）
    if (sessionKey && sessionAgentMap.has(sessionKey)) {
      const boundAgentId = sessionAgentMap.get(sessionKey);
      const agent = agents.get(boundAgentId);
      if (agent) {
        logger.debug(`路由: 会话绑定 Agent ${boundAgentId}`);
        return agent;
      }
    }
    
    // 3. 智能路由
    const selectedId = await router.route(message, agents, useLLM);
    const selectedAgent = agents.get(selectedId) || getDefault();
    
    logger.info(`路由: 消息 -> Agent ${selectedAgent.metadata.id} (${selectedAgent.metadata.name})`);
    
    // 绑定会话
    if (sessionKey) {
      sessionAgentMap.set(sessionKey, selectedAgent.metadata.id);
    }
    
    return selectedAgent;
  }
  
  /**
   * 同步选择 Agent（不使用 LLM）
   */
  function selectSync(message, context = {}) {
    const { sessionKey, agentId: explicitAgentId } = context;
    
    // 1. 显式指定
    if (explicitAgentId) {
      const agent = agents.get(explicitAgentId);
      if (agent) {
        if (sessionKey) sessionAgentMap.set(sessionKey, explicitAgentId);
        return agent;
      }
    }
    
    // 2. 会话绑定
    if (sessionKey && sessionAgentMap.has(sessionKey)) {
      const agent = agents.get(sessionAgentMap.get(sessionKey));
      if (agent) return agent;
    }
    
    // 3. 规则路由
    const selectedId = router.routeSync(message, agents);
    const selectedAgent = agents.get(selectedId) || getDefault();
    
    if (sessionKey) {
      sessionAgentMap.set(sessionKey, selectedAgent.metadata.id);
    }
    
    return selectedAgent;
  }
  
  /**
   * 绑定会话到指定 Agent
   */
  function bindSession(sessionKey, agentId) {
    if (!agents.has(agentId)) {
      throw new Error(`Agent ${agentId} 不存在`);
    }
    sessionAgentMap.set(sessionKey, agentId);
    logger.debug(`会话 ${sessionKey} 绑定到 Agent ${agentId}`);
  }
  
  /**
   * 解绑会话
   */
  function unbindSession(sessionKey) {
    sessionAgentMap.delete(sessionKey);
    logger.debug(`会话 ${sessionKey} 解绑`);
  }
  
  /**
   * 获取会话绑定的 Agent
   */
  function getSessionAgent(sessionKey) {
    const agentId = sessionAgentMap.get(sessionKey);
    return agentId ? agents.get(agentId) : null;
  }
  
  /**
   * 切换会话的 Agent
   */
  function switchSessionAgent(sessionKey, newAgentId) {
    if (!agents.has(newAgentId)) {
      return { success: false, error: `Agent ${newAgentId} 不存在` };
    }
    
    const oldAgentId = sessionAgentMap.get(sessionKey);
    sessionAgentMap.set(sessionKey, newAgentId);
    
    logger.info(`会话 ${sessionKey} 切换 Agent: ${oldAgentId} -> ${newAgentId}`);
    
    return {
      success: true,
      oldAgentId,
      newAgentId,
      message: `已切换到 ${agents.get(newAgentId).metadata.name}`
    };
  }
  
  /**
   * 创建临时 Agent（动态创建）
   */
  function createTemp(tempConfig, ttl = 3600000) {
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    
    const mergedConfig = {
      api_key: tempConfig.api_key || defaults.api_key,
      base_url: tempConfig.base_url || defaults.base_url,
      model: tempConfig.model || defaults.model,
      temperature: tempConfig.temperature ?? 0.7,
      max_tokens: tempConfig.max_tokens || 4096,
      max_history: tempConfig.max_history || 50,
      system_prompt: tempConfig.system_prompt || '',
    };
    
    const allowedTools = tempConfig.tools || [];
    const filteredToolRegistry = createFilteredToolRegistry(toolRegistry, allowedTools);
    
    const agent = createAgent(mergedConfig, filteredToolRegistry);
    
    agent.metadata = {
      id: tempId,
      name: tempConfig.name || '临时助手',
      description: tempConfig.description || '临时创建的 Agent',
      model: mergedConfig.model,
      allowedTools,
      skills: tempConfig.skills || [],
      isTemp: true,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttl,
    };
    
    agents.set(tempId, agent);
    
    // 设置自动清理
    setTimeout(() => {
      if (agents.has(tempId)) {
        agents.delete(tempId);
        logger.info(`临时 Agent ${tempId} 已过期清理`);
      }
    }, ttl);
    
    logger.info(`创建临时 Agent: ${tempId}`);
    return agent;
  }
  
  /**
   * Agent 间协作 - 委派任务
   */
  async function delegate(fromAgentId, toAgentId, task, parentContext = {}) {
    const fromAgent = agents.get(fromAgentId);
    const toAgent = agents.get(toAgentId);
    
    if (!fromAgent) throw new Error(`源 Agent ${fromAgentId} 不存在`);
    if (!toAgent) throw new Error(`目标 Agent ${toAgentId} 不存在`);
    
    logger.info(`Agent 协作: ${fromAgentId} -> ${toAgentId}`);
    
    // 构建委派的上下文
    const delegateContext = {
      ...parentContext,
      delegatedFrom: fromAgentId,
      task: task.description,
      isDelegated: true,
    };
    
    const result = await toAgent.chat(task.prompt, delegateContext);
    
    return {
      from: toAgentId,
      to: fromAgentId,
      result: result.content,
      sessionKey: result.sessionKey,
    };
  }
  
  /**
   * 获取统计信息
   */
  function getStats() {
    return {
      total: agents.size,
      tempAgents: Array.from(agents.values()).filter(a => a.metadata.isTemp).length,
      default: defaultAgentId,
      agents: Array.from(agents.entries()).map(([id, agent]) => ({
        id,
        name: agent.metadata.name,
        model: agent.metadata.model,
        isTemp: agent.metadata.isTemp || false,
        stats: agent.getStats?.() || {},
      })),
      sessionBindings: sessionAgentMap.size,
    };
  }
  
  /**
   * 关闭所有 Agent（清理资源）
   */
  function close() {
    logger.info('关闭 Agent 工厂...');
    for (const [id, agent] of agents) {
      if (agent.sessionManager?.close) {
        agent.sessionManager.close();
      }
    }
    agents.clear();
    sessionAgentMap.clear();
  }
  
  return {
    get,
    getDefault,
    getAll,
    getAllInfo,
    select,
    selectSync,
    bindSession,
    unbindSession,
    getSessionAgent,
    switchSessionAgent,
    createTemp,
    delegate,
    getStats,
    close,
  };
}
