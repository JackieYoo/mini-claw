#!/usr/bin/env node
/**
 * 多 Agent 功能测试脚本
 */

import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { createAgentFactory } from '../src/agent/factory.js';
import { createToolRegistry } from '../src/tools/index.js';
import { createSkillsLoader } from '../src/utils/skills.js';
import { loadAgentsConfig } from '../src/utils/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('\n🧪 多 Agent 功能测试\n');
console.log('═══════════════════════════════════════\n');

async function main() {
  try {
    // 1. 加载配置
    console.log('1️⃣  加载多 Agent 配置\n');
    const agentsConfig = await loadAgentsConfig();
    
    if (!agentsConfig) {
      console.log('   ❌ 未找到多 Agent 配置，请先创建 config/agents.yaml');
      console.log('   测试将使用模拟配置...\n');
    } else {
      console.log(`   ✅ 找到 ${Object.keys(agentsConfig.agents || {}).length} 个 Agent 配置`);
      console.log(`   路由策略: ${agentsConfig.router?.strategy || 'hybrid'}\n`);
    }
    
    // 2. 初始化工具
    console.log('2️⃣  初始化工具注册表\n');
    const toolRegistry = createToolRegistry({
      memoryDir: join(homedir(), '.miniclaw', 'memory'),
    });
    console.log(`   ✅ 已注册工具: ${toolRegistry.getToolNames().join(', ')}\n`);
    
    // 3. 加载技能
    console.log('3️⃣  加载技能\n');
    const skillsDir = join(__dirname, '../skills');
    const skillsLoader = createSkillsLoader(skillsDir);
    const skills = skillsLoader.loadAll();
    console.log(`   ✅ 已加载技能: ${skills.map(s => s.name).join(', ')}\n`);
    
    // 4. 创建 Agent 工厂
    console.log('4️⃣  创建 Agent 工厂\n');
    
    let factory;
    if (agentsConfig) {
      factory = createAgentFactory(agentsConfig, toolRegistry);
    } else {
      // 使用模拟配置
      const mockConfig = {
        defaults: {
          api_key: process.env.MODEL_API_KEY,
          base_url: process.env.MODEL_API_BASE,
          model: process.env.MODEL_NAME || 'gpt-3.5-turbo',
        },
        router: { strategy: 'pattern', default_agent: 'default' },
        agents: {
          default: {
            name: '通用助手',
            description: '处理日常对话',
            system_prompt: '你是通用助手',
            tools: ['shell', 'file_read', 'web_search'],
            route: { priority: 0, patterns: [] },
          },
          code: {
            name: '代码助手',
            description: '处理编程问题',
            system_prompt: '你是代码专家',
            tools: ['shell', 'file_read', 'file_write'],
            route: { priority: 10, patterns: ['代码', '编程', 'bug', '\\.js$'] },
          },
          doc: {
            name: '文档助手',
            description: '处理文档相关',
            system_prompt: '你是文档专家',
            tools: ['file_read', 'web_search'],
            route: { priority: 8, patterns: ['文档', '总结', '会议纪要'] },
          },
        },
      };
      factory = createAgentFactory(mockConfig, toolRegistry);
    }
    
    const allAgents = factory.getAllInfo();
    console.log(`   ✅ 工厂创建成功，共 ${allAgents.length} 个 Agent:`);
    for (const agent of allAgents) {
      console.log(`      • ${agent.id}: ${agent.name}`);
    }
    console.log();
    
    // 5. 测试智能路由
    console.log('5️⃣  测试智能路由\n');
    
    const testCases = [
      { message: '你好，请介绍一下自己', expected: 'default' },
      { message: '帮我写一段 JavaScript 代码', expected: 'code' },
      { message: '总结一下这份文档', expected: 'doc' },
      { message: 'function hello() {}', expected: 'code' },
      { message: '今天天气怎么样', expected: 'default' },
    ];
    
    for (const test of testCases) {
      const agent = await factory.select(test.message, {});
      const match = agent.metadata.id === test.expected ? '✅' : '⚠️';
      console.log(`   ${match} "${test.message.substring(0, 30)}..."`);
      console.log(`      → ${agent.metadata.id} (${agent.metadata.name})`);
    }
    console.log();
    
    // 6. 测试会话绑定
    console.log('6️⃣  测试会话绑定\n');
    
    const sessionKey = 'test_session_123';
    factory.bindSession(sessionKey, 'code');
    
    const boundAgent = factory.getSessionAgent(sessionKey);
    console.log(`   ✅ 会话 ${sessionKey} 绑定到 ${boundAgent?.metadata?.id || 'none'}`);
    
    // 测试绑定后路由
    const routedAgent = await factory.select('随便说什么', { sessionKey });
    console.log(`   ✅ 绑定后路由: ${routedAgent.metadata.id}`);
    
    // 切换 Agent
    const switchResult = factory.switchSessionAgent(sessionKey, 'doc');
    console.log(`   ✅ 切换结果: ${switchResult.success ? '成功' : '失败'}`);
    if (switchResult.success) {
      console.log(`      ${switchResult.oldAgentId} → ${switchResult.newAgentId}`);
    }
    console.log();
    
    // 7. 测试统计信息
    console.log('7️⃣  测试统计信息\n');
    
    const stats = factory.getStats();
    console.log(`   总 Agent 数: ${stats.total}`);
    console.log(`   临时 Agent: ${stats.tempAgents}`);
    console.log(`   默认 Agent: ${stats.default}`);
    console.log(`   会话绑定: ${stats.sessionBindings}`);
    console.log();
    
    // 8. 清理
    console.log('8️⃣  清理资源\n');
    factory.close();
    console.log('   ✅ 资源已清理');
    
    console.log('\n═══════════════════════════════════════\n');
    console.log('✅ 所有测试通过！\n');
    
  } catch (err) {
    console.error('\n❌ 测试失败:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
