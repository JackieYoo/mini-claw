/**
 * MiniClaw - Minimal AI Assistant Framework
 * 学习 OpenClaw 架构的精简版 AI 助手
 * 
 * Entry point
 */

import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { createGateway } from './gateway/index.js';
import { createAgent } from './agent/index.js';
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
  console.log('║           Minimal AI Assistant Framework             ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
  
  logger.info(`模型: ${config.model.model}`);
  logger.info(`API: ${config.model.base_url}`);
  logger.info(`Gateway: http://localhost:${config.gateway.port}`);
  console.log('');
  
  // 加载技能
  const skillsDir = join(__dirname, '../skills');
  const skillsLoader = createSkillsLoader(skillsDir);
  const skills = skillsLoader.loadAll();
  
  // 创建工具注册中心（带记忆功能）
  const toolRegistry = createToolRegistry({
    memoryDir: join(homedir(), '.miniclaw', 'memory'),
  });
  
  // 将工具描述注入系统提示
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
  
  logger.info(`工具: ${toolRegistry.getToolNames().join(', ')}`);
  logger.info(`技能: ${skills.map(s => s.name).join(', ')}`);
  console.log('');
  
  // 创建 Agent
  const agent = createAgent(config.model, toolRegistry);
  
  // 创建通道管理器
  const channelManager = createChannelManager(config.channels);
  
  // 创建 Gateway
  const gateway = createGateway(config.gateway, {
    agent,
    channelManager,
    toolRegistry,
    skillsLoader,
  });
  
  // 启动 Gateway
  await gateway.start();
  
  // 连接所有通道
  await channelManager.connectAll(agent);
  
  console.log('');
  logger.info('✅ MiniClaw 已启动，等待消息...');
  console.log('');
  logger.info('命令: /status | /reset | /help');
  console.log('');
  
  // 优雅关闭
  const shutdown = async (signal) => {
    console.log('');
    logger.info(`收到 ${signal}，正在关闭...`);
    
    // 保存统计数据
    const agentStats = agent.getStats();
    const gatewayStats = gateway.stats;
    
    logger.info(`本次运行统计:`);
    logger.info(`  消息处理: ${gatewayStats.totalMessages} 条`);
    logger.info(`  API 调用: ${agentStats.totalCalls} 次`);
    logger.info(`  Token 使用: ${agentStats.totalTokens.input + agentStats.totalTokens.output}`);
    logger.info(`  工具调用: ${agentStats.toolCalls} 次`);
    logger.info(`  错误次数: ${agentStats.totalErrors}`);
    
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
  console.error('请检查配置:');
  console.error('  1. 确保 .env 文件存在');
  console.error('  2. 检查 MODEL_API_KEY 是否正确');
  console.error('  3. 检查 MODEL_API_BASE 是否正确');
  console.error('  4. 检查飞书配置是否正确');
  console.error('');
  console.error('详细错误:', err);
  process.exit(1);
});
