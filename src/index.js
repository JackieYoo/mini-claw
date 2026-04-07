/**
 * MiniClaw - Multi-Agent AI Assistant Framework
 * 支持多 Agent 智能路由的精简版 AI 助手
 * 
 * Entry point
 */

import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { createGateway } from './gateway/index.js';
import { createAgentFactory } from './agent/factory.js';
import { createChannelManager } from './channels/index.js';
import { createToolRegistry } from './tools/index.js';
import { createSkillsLoader } from './utils/skills.js';
import { loadConfig } from './utils/config.js';
import { createLogger } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logger = createLogger('main');

async function main() {
  const config = await loadConfig();
  
  // 欢迎信息
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║                    🦞 MiniClaw                       ║');
  console.log('║         Multi-Agent AI Assistant Framework           ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
  
  // 加载技能
  const skillsDir = join(__dirname, '../skills');
  const skillsLoader = createSkillsLoader(skillsDir);
  const skills = skillsLoader.loadAll();
  
  // 创建工具注册中心（带记忆功能）
  const toolRegistry = createToolRegistry({
    memoryDir: join(homedir(), '.miniclaw', 'memory'),
  });
  
  logger.info(`工具: ${toolRegistry.getToolNames().join(', ')}`);
  logger.info(`技能: ${skills.map(s => s.name).join(', ')}`);
  console.log('');
  
  // 创建 Agent 工厂（多 Agent 模式）
  let agentFactory;
  if (config.agents) {
    // 多 Agent 模式
    logger.info('启动多 Agent 模式');
    
    // 将技能提示词注入到各 Agent 配置
    const skillsPrompt = skillsLoader.getSkillsPrompt();
    
    for (const [agentId, agentConfig] of Object.entries(config.agents.agents || {})) {
      if (skillsPrompt && agentConfig.system_prompt) {
        agentConfig.system_prompt += '\n' + skillsPrompt;
      }
    }
    
    agentFactory = createAgentFactory(config.agents, toolRegistry);
    
    const agentList = agentFactory.getAllInfo();
    logger.info(`已加载 ${agentList.length} 个 Agent:`);
    for (const agent of agentList) {
      logger.info(`  • ${agent.id}: ${agent.name} (${agent.model})`);
    }
    
    logger.info(`路由策略: ${config.agents.router?.strategy || 'hybrid'}`);
    logger.info(`默认 Agent: ${config.agents.router?.default_agent || 'default'}`);
  } else {
    // 单 Agent 模式（向后兼容）
    logger.info('启动单 Agent 模式');
    
    // 将工具描述和技能注入系统提示
    const toolsDesc = toolRegistry.getToolsDescription();
    const skillsPrompt = skillsLoader.getSkillsPrompt();
    
    if (toolsDesc && config.model.system_prompt) {
      config.model.system_prompt += '\n' + toolsDesc;
    }
    if (skillsPrompt && config.model.system_prompt) {
      config.model.system_prompt += '\n' + skillsPrompt;
    }
    
    // 添加会话持久化目录
    config.model.persist_dir = join(homedir(), '.miniclaw', 'sessions');
    
    // 创建单 Agent 兼容的工厂
    const { createAgent } = await import('./agent/index.js');
    const agent = createAgent(config.model, toolRegistry);
    
    // 包装为工厂接口
    agentFactory = {
      get: (id) => id === 'default' || id === 'agent' ? agent : null,
      getDefault: () => agent,
      getAll: () => [agent],
      getAllInfo: () => [{
        id: 'default',
        name: '默认助手',
        description: '通用 AI 助手',
        model: config.model.model,
        tools: toolRegistry.getToolNames(),
        skills: skills.map(s => s.name),
      }],
      select: async () => agent,
      selectSync: () => agent,
      bindSession: () => {},
      unbindSession: () => {},
      getSessionAgent: () => agent,
      switchSessionAgent: () => ({ success: false, error: '单 Agent 模式不支持切换' }),
      createTemp: () => { throw new Error('单 Agent 模式不支持临时 Agent'); },
      delegate: async () => { throw new Error('单 Agent 模式不支持委派'); },
      getStats: () => ({
        total: 1,
        tempAgents: 0,
        default: 'default',
        agents: [{
          id: 'default',
          name: '默认助手',
          stats: agent.getStats?.() || {},
        }],
        sessionBindings: 0,
      }),
      close: () => {
        if (agent.sessionManager?.close) {
          agent.sessionManager.close();
        }
      },
    };
    
    logger.info(`模型: ${config.model.model}`);
    logger.info(`API: ${config.model.base_url}`);
  }
  
  console.log('');
  
  // 创建通道管理器
  const channelManager = createChannelManager(config.channels);
  
  // 创建 Gateway
  const gateway = createGateway(config.gateway, {
    agentFactory,
    channelManager,
    toolRegistry,
    skillsLoader,
  });
  
  // 启动 Gateway
  await gateway.start();
  
  // 连接所有通道（传入 agentFactory 供多 Agent 使用）
  await channelManager.connectAll(agentFactory);
  
  console.log('');
  logger.info('✅ MiniClaw 已启动，等待消息...');
  console.log('');
  
  if (config.agents) {
    logger.info('多 Agent 命令:');
    logger.info('  /agents          - 查看可用 Agent');
    logger.info('  /agent <name>    - 切换到指定 Agent');
    logger.info('  @<agent-name>    - 临时使用某个 Agent');
    logger.info('  /status          - 查看运行状态');
    logger.info('  /reset           - 重置当前会话');
  } else {
    logger.info('命令: /status | /reset | /help');
  }
  console.log('');
  
  // 优雅关闭
  const shutdown = async (signal) => {
    console.log('');
    logger.info(`收到 ${signal}，正在关闭...`);
    
    // 保存统计数据
    const factoryStats = agentFactory.getStats();
    const gatewayStats = gateway.stats;
    
    logger.info(`本次运行统计:`);
    logger.info(`  消息处理: ${gatewayStats.totalMessages} 条`);
    logger.info(`  请求次数: ${gatewayStats.totalRequests} 次`);
    logger.info(`  错误次数: ${gatewayStats.totalErrors}`);
    
    if (config.agents) {
      logger.info(`  Agent 数量: ${factoryStats.total}`);
      for (const agentStat of factoryStats.agents) {
        const stats = agentStat.stats || {};
        logger.info(`    - ${agentStat.id}: API ${stats.totalCalls || 0} 次, Token ${(stats.totalTokens?.input || 0) + (stats.totalTokens?.output || 0)}`);
      }
    } else {
      const agentStats = agentFactory.getDefault().getStats();
      logger.info(`  API 调用: ${agentStats.totalCalls} 次`);
      logger.info(`  Token 使用: ${agentStats.totalTokens.input + agentStats.totalTokens.output}`);
      logger.info(`  工具调用: ${agentStats.toolCalls} 次`);
    }
    
    await gateway.stop();
    logger.info('👋 MiniClaw 已停止');
    process.exit(0);
  };
  
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  
  // 未捕获异常处理
  process.on('uncaughtException', (err) => {
    logger.error('未捕获异常:', err);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('未处理的 Promise 拒绝:', reason);
  });
}

main().catch((err) => {
  console.error('');
  console.error('❌ 启动失败:', err.message);
  console.error('');
  
  // 提供详细的排查建议
  if (err.message.includes('API Key')) {
    console.error('授权问题排查:');
    console.error('  1. 检查 .env 文件是否存在');
    console.error('  2. 检查 MODEL_API_KEY 是否正确设置');
    console.error('  3. 检查 MODEL_API_BASE 是否正确');
    console.error('  4. 如果是飞书问题，检查 FEISHU_APP_ID 和 FEISHU_APP_SECRET');
    console.error('');
    console.error('快速检查命令:');
    console.error('  cat .env | grep -E "(API_KEY|APP_SECRET)"');
  } else if (err.message.includes('配置')) {
    console.error('配置问题排查:');
    console.error('  1. 检查 config/config.yaml 是否存在');
    console.error('  2. 如果是多 Agent 模式，检查 config/agents.yaml 是否存在');
    console.error('  3. 检查 YAML 格式是否正确（可以使用 yamllint）');
  } else {
    console.error('请检查:');
    console.error('  1. 确保 .env 文件存在且配置正确');
    console.error('  2. 检查 MODEL_API_KEY 是否有效');
    console.error('  3. 检查 MODEL_API_BASE 是否可访问');
    console.error('  4. 检查飞书配置是否正确（如果使用）');
  }
  
  console.error('');
  console.error('详细错误:', err);
  process.exit(1);
});
