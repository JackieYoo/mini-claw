/**
 * 功能模块检查脚本
 * 检查各个模块的功能完整性
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync, existsSync, readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

function log(type, message) {
  const color = colors[type] || colors.reset;
  console.log(`${color}${message}${colors.reset}`);
}

function checkIcon(hasFeature) {
  return hasFeature ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
}

// ==================== 检查 Agent 模块 ====================
function checkAgentModule() {
  log('cyan', '\n📦 Agent 模块检查');
  log('gray', '─'.repeat(50));

  const checks = {
    'createAgent 函数': false,
    'chat 函数': false,
    'chatStream 函数': false,
    'executeTool 函数': false,
    'resetSession 函数': false,
    'getStats 函数': false,
    '消息验证': false,
    '工具调用支持': false,
    '重试机制': false,
    '错误处理': false,
    '流式响应': false,
    '统计功能': false
  };

  try {
    const content = readFileSync(join(__dirname, '../src/agent/index.js'), 'utf-8');

    checks['createAgent 函数'] = /export function createAgent/.test(content);
    checks['chat 函数'] = /async function chat\(/.test(content);
    checks['chatStream 函数'] = /async function\* chatStream/.test(content);
    checks['executeTool 函数'] = /async function executeTool/.test(content);
    checks['resetSession 函数'] = /function resetSession/.test(content);
    checks['getStats 函数'] = /function getStats/.test(content);
    checks['消息验证'] = /function validateMessages/.test(content);
    checks['工具调用支持'] = /while \(assistantMessage\.tool_calls/.test(content);
    checks['重试机制'] = /retryApi/.test(content);
    checks['错误处理'] = /try \{[\s\S]*?\} catch \(err\)/.test(content);
    checks['流式响应'] = /yield \{ type:/.test(content);
    checks['统计功能'] = /const stats = \{/.test(content);

    for (const [name, hasFeature] of Object.entries(checks)) {
      log(hasFeature ? 'green' : 'red', `  ${checkIcon(hasFeature)} ${name}`);
    }

    const passed = Object.values(checks).filter(Boolean).length;
    log('blue', `\n  Agent 模块: ${passed}/${Object.keys(checks).length} 项检查通过`);

    return { passed, total: Object.keys(checks).length, checks };
  } catch (err) {
    log('red', `  检查失败: ${err.message}`);
    return { passed: 0, total: Object.keys(checks).length, error: err.message };
  }
}

// ==================== 检查 AgentFactory 模块 ====================
function checkAgentFactoryModule() {
  log('cyan', '\n📦 AgentFactory 模块检查');
  log('gray', '─'.repeat(50));

  const checks = {
    'createAgentFactory 函数': false,
    'get 方法': false,
    'getDefault 方法': false,
    'getAll 方法': false,
    'select 方法': false,
    'selectSync 方法': false,
    'bindSession 方法': false,
    'switchSessionAgent 方法': false,
    'createTemp 方法': false,
    'delegate 方法': false,
    '工具过滤': false,
    '配置合并': false
  };

  try {
    const content = readFileSync(join(__dirname, '../src/agent/factory.js'), 'utf-8');

    checks['createAgentFactory 函数'] = /export function createAgentFactory/.test(content);
    checks['get 方法'] = /function get\(agentId\)/.test(content);
    checks['getDefault 方法'] = /function getDefault/.test(content);
    checks['getAll 方法'] = /function getAll\(\)/.test(content);
    checks['select 方法'] = /async function select\(/.test(content);
    checks['selectSync 方法'] = /function selectSync/.test(content);
    checks['bindSession 方法'] = /function bindSession/.test(content);
    checks['switchSessionAgent 方法'] = /function switchSessionAgent/.test(content);
    checks['createTemp 方法'] = /function createTemp/.test(content);
    checks['delegate 方法'] = /async function delegate/.test(content);
    checks['工具过滤'] = /createFilteredToolRegistry/.test(content);
    checks['配置合并'] = /mergedConfig/.test(content);

    for (const [name, hasFeature] of Object.entries(checks)) {
      log(hasFeature ? 'green' : 'red', `  ${checkIcon(hasFeature)} ${name}`);
    }

    const passed = Object.values(checks).filter(Boolean).length;
    log('blue', `\n  AgentFactory 模块: ${passed}/${Object.keys(checks).length} 项检查通过`);

    return { passed, total: Object.keys(checks).length, checks };
  } catch (err) {
    log('red', `  检查失败: ${err.message}`);
    return { passed: 0, total: Object.keys(checks).length, error: err.message };
  }
}

// ==================== 检查 Router 模块 ====================
function checkRouterModule() {
  log('cyan', '\n📦 Router 模块检查');
  log('gray', '─'.repeat(50));

  const checks = {
    'createRouter 函数': false,
    'routeByPattern 方法': false,
    'routeByLLM 方法': false,
    'routeHybrid 方法': false,
    '路由缓存': false,
    'extractAgentMention 函数': false,
    'parseAgentCommand 函数': false,
    'analyze 方法': false
  };

  try {
    const content = readFileSync(join(__dirname, '../src/agent/router.js'), 'utf-8');

    checks['createRouter 函数'] = /export function createRouter/.test(content);
    checks['routeByPattern 方法'] = /function routeByPattern/.test(content);
    checks['routeByLLM 方法'] = /async function routeByLLM/.test(content);
    checks['routeHybrid 方法'] = /async function routeHybrid/.test(content);
    checks['路由缓存'] = /routerCache/.test(content) && /getCachedRoute/.test(content);
    checks['extractAgentMention 函数'] = /export function extractAgentMention/.test(content);
    checks['parseAgentCommand 函数'] = /export function parseAgentCommand/.test(content);
    checks['analyze 方法'] = /async function analyze/.test(content);

    for (const [name, hasFeature] of Object.entries(checks)) {
      log(hasFeature ? 'green' : 'red', `  ${checkIcon(hasFeature)} ${name}`);
    }

    const passed = Object.values(checks).filter(Boolean).length;
    log('blue', `\n  Router 模块: ${passed}/${Object.keys(checks).length} 项检查通过`);

    return { passed, total: Object.keys(checks).length, checks };
  } catch (err) {
    log('red', `  检查失败: ${err.message}`);
    return { passed: 0, total: Object.keys(checks).length, error: err.message };
  }
}

// ==================== 检查 Gateway 模块 ====================
function checkGatewayModule() {
  log('cyan', '\n📦 Gateway 模块检查');
  log('gray', '─'.repeat(50));

  const checks = {
    'createGateway 函数': false,
    '/health 端点': false,
    '/stats 端点': false,
    '/metrics 端点': false,
    '/agents 端点': false,
    '/sessions 端点': false,
    '/chat 端点': false,
    '/tools 端点': false,
    '/skills 端点': false,
    '/ws WebSocket': false,
    '认证中间件': false,
    '输入验证': false,
    '限流功能': false,
    '端口自动切换': false,
    '全局错误处理': false
  };

  try {
    const content = readFileSync(join(__dirname, '../src/gateway/index.js'), 'utf-8');

    checks['createGateway 函数'] = /export function createGateway/.test(content);
    checks['/health 端点'] = /fastify\.get\(['"]\/health['"]/.test(content);
    checks['/stats 端点'] = /fastify\.get\(['"]\/stats['"]/.test(content);
    checks['/metrics 端点'] = /fastify\.get\(['"]\/metrics['"]/.test(content);
    checks['/agents 端点'] = /fastify\.get\(['"]\/agents['"]/.test(content);
    checks['/sessions 端点'] = /fastify\.get\(['"]\/sessions['"]/.test(content);
    checks['/chat 端点'] = /fastify\.post\(['"]\/chat['"]/.test(content);
    checks['/tools 端点'] = /fastify\.get\(['"]\/tools['"]/.test(content);
    checks['/skills 端点'] = /fastify\.get\(['"]\/skills['"]/.test(content);
    checks['/ws WebSocket'] = /fastify\.get\(['"]\/ws['"]/.test(content);
    checks['认证中间件'] = /createAuth/.test(content) && /authMiddleware/.test(content);
    checks['输入验证'] = /validateRequestBody/.test(content);
    checks['限流功能'] = /checkRateLimit/.test(content);
    checks['端口自动切换'] = /findAvailablePort/.test(content);
    checks['全局错误处理'] = /fastify\.setErrorHandler/.test(content);

    for (const [name, hasFeature] of Object.entries(checks)) {
      log(hasFeature ? 'green' : 'red', `  ${checkIcon(hasFeature)} ${name}`);
    }

    const passed = Object.values(checks).filter(Boolean).length;
    log('blue', `\n  Gateway 模块: ${passed}/${Object.keys(checks).length} 项检查通过`);

    return { passed, total: Object.keys(checks).length, checks };
  } catch (err) {
    log('red', `  检查失败: ${err.message}`);
    return { passed: 0, total: Object.keys(checks).length, error: err.message };
  }
}

// ==================== 检查 Channel 模块 ====================
function checkChannelModule() {
  log('cyan', '\n📦 Channel 模块检查');
  log('gray', '─'.repeat(50));

  const checks = {
    'createFeishuChannel 函数': false,
    'connect 方法': false,
    'disconnect 方法': false,
    'sendMessage 方法': false,
    '消息去重': false,
    'LRU 限制': false,
    '命令处理': false,
    '@agent 提及': false,
    '表情回复': false,
    '健康检查': false,
    '重连机制': false,
    'clientManager 重构': false
  };

  try {
    const content = readFileSync(join(__dirname, '../src/channels/feishu.js'), 'utf-8');

    checks['createFeishuChannel 函数'] = /export function createFeishuChannel/.test(content);
    checks['connect 方法'] = /async function connect\(/.test(content);
    checks['disconnect 方法'] = /function disconnect\(\)/.test(content);
    checks['sendMessage 方法'] = /async function sendMessage/.test(content);
    checks['消息去重'] = /messageDeduplicator/.test(content);
    checks['LRU 限制'] = /maxSize.*10000/.test(content);
    checks['命令处理'] = /handleCommand/.test(content);
    checks['@agent 提及'] = /extractAgentMention/.test(content);
    checks['表情回复'] = /reactionManager/.test(content);
    checks['健康检查'] = /startHealthCheck/.test(content);
    checks['重连机制'] = /async function reconnect/.test(content);
    checks['clientManager 重构'] = /clientManager/.test(content);

    for (const [name, hasFeature] of Object.entries(checks)) {
      log(hasFeature ? 'green' : 'red', `  ${checkIcon(hasFeature)} ${name}`);
    }

    const passed = Object.values(checks).filter(Boolean).length;
    log('blue', `\n  Channel 模块: ${passed}/${Object.keys(checks).length} 项检查通过`);

    return { passed, total: Object.keys(checks).length, checks };
  } catch (err) {
    log('red', `  检查失败: ${err.message}`);
    return { passed: 0, total: Object.keys(checks).length, error: err.message };
  }
}

// ==================== 检查 Tools 模块 ====================
function checkToolsModule() {
  log('cyan', '\n📦 Tools 模块检查');
  log('gray', '─'.repeat(50));

  const checks = {
    'createToolRegistry 函数': false,
    '注册工具': false,
    '获取工具': false,
    '执行工具': false,
    '超时控制': false,
    '工具缓存': false,
    'shell 工具': false,
    'file_read 工具': false,
    'file_write 工具': false,
    'web_search 工具': false,
    'http_request 工具': false,
    'memory 工具': false
  };

  try {
    const registryContent = readFileSync(join(__dirname, '../src/tools/index.js'), 'utf-8');
    const shellContent = existsSync(join(__dirname, '../src/tools/shell.js')) ?
      readFileSync(join(__dirname, '../src/tools/shell.js'), 'utf-8') : '';

    checks['createToolRegistry 函数'] = /export function createToolRegistry/.test(registryContent);
    checks['注册工具'] = /function register\(/.test(registryContent);
    checks['获取工具'] = /function get\(/.test(registryContent) && /function getTools/.test(registryContent);
    checks['执行工具'] = /async function execute/.test(registryContent);
    checks['超时控制'] = /Promise\.race/.test(registryContent) && /timeout/.test(registryContent);
    checks['工具缓存'] = /createCache/.test(registryContent);
    checks['shell 工具'] = existsSync(join(__dirname, '../src/tools/shell.js'));
    checks['file_read 工具'] = existsSync(join(__dirname, '../src/tools/file_read.js'));
    checks['file_write 工具'] = existsSync(join(__dirname, '../src/tools/file_write.js'));
    checks['web_search 工具'] = existsSync(join(__dirname, '../src/tools/web_search.js'));
    checks['http_request 工具'] = existsSync(join(__dirname, '../src/tools/http_request.js'));
    checks['memory 工具'] = existsSync(join(__dirname, '../src/tools/memory.js'));

    for (const [name, hasFeature] of Object.entries(checks)) {
      log(hasFeature ? 'green' : 'red', `  ${checkIcon(hasFeature)} ${name}`);
    }

    const passed = Object.values(checks).filter(Boolean).length;
    log('blue', `\n  Tools 模块: ${passed}/${Object.keys(checks).length} 项检查通过`);

    return { passed, total: Object.keys(checks).length, checks };
  } catch (err) {
    log('red', `  检查失败: ${err.message}`);
    return { passed: 0, total: Object.keys(checks).length, error: err.message };
  }
}

// ==================== 检查 Session 模块 ====================
function checkSessionModule() {
  log('cyan', '\n📦 Session 模块检查');
  log('gray', '─'.repeat(50));

  const checks = {
    'createSessionManager 函数': false,
    'generateSessionKey': false,
    'getSession': false,
    'addMessage': false,
    'resetSession': false,
    '会话持久化': false,
    '数据加密': false,
    '自动清理': false,
    'Agent 隔离': false,
    '特殊字符处理': false,
    '消息数量限制': false
  };

  try {
    const content = readFileSync(join(__dirname, '../src/utils/session.js'), 'utf-8');

    checks['createSessionManager 函数'] = /export function createSessionManager/.test(content);
    checks['generateSessionKey'] = /function generateSessionKey/.test(content);
    checks['getSession'] = /function getSession/.test(content);
    checks['addMessage'] = /function addMessage/.test(content);
    checks['resetSession'] = /function resetSession/.test(content);
    checks['会话持久化'] = /saveToDisk/.test(content) && /loadFromDisk/.test(content);
    checks['数据加密'] = /encryptSessionData/.test(content) && /decryptSessionData/.test(content);
    checks['自动清理'] = /maybePruneSessions/.test(content);
    checks['Agent 隔离'] = /agentId.*baseKey/.test(content);
    checks['特殊字符处理'] = /sanitizeKeyPart/.test(content);
    checks['消息数量限制'] = /maxMessagesPerSession/.test(content);

    for (const [name, hasFeature] of Object.entries(checks)) {
      log(hasFeature ? 'green' : 'red', `  ${checkIcon(hasFeature)} ${name}`);
    }

    const passed = Object.values(checks).filter(Boolean).length;
    log('blue', `\n  Session 模块: ${passed}/${Object.keys(checks).length} 项检查通过`);

    return { passed, total: Object.keys(checks).length, checks };
  } catch (err) {
    log('red', `  检查失败: ${err.message}`);
    return { passed: 0, total: Object.keys(checks).length, error: err.message };
  }
}

// ==================== 检查 Utils 模块 ====================
function checkUtilsModule() {
  log('cyan', '\n📦 Utils 模块检查');
  log('gray', '─'.repeat(50));

  const checks = {
    'config.js': false,
    'logger.js': false,
    'auth.js': false,
    'cache.js': false,
    'errors.js': false,
    'retry.js': false,
    'security.js': false,
    'skills.js': false,
    'mask.js': false,
    'metrics.js': false
  };

  try {
    const utilsDir = join(__dirname, '../src/utils');
    const files = readdirSync(utilsDir);

    for (const file of Object.keys(checks)) {
      checks[file] = files.includes(file);
    }

    for (const [name, hasFeature] of Object.entries(checks)) {
      log(hasFeature ? 'green' : 'red', `  ${checkIcon(hasFeature)} ${name}`);
    }

    const passed = Object.values(checks).filter(Boolean).length;
    log('blue', `\n  Utils 模块: ${passed}/${Object.keys(checks).length} 项检查通过`);

    return { passed, total: Object.keys(checks).length, checks };
  } catch (err) {
    log('red', `  检查失败: ${err.message}`);
    return { passed: 0, total: Object.keys(checks).length, error: err.message };
  }
}

// ==================== 检查配置文件 ====================
function checkConfigFiles() {
  log('cyan', '\n📦 配置文件检查');
  log('gray', '─'.repeat(50));

  const checks = {
    'config/config.yaml': false,
    'config/agents.example.yaml': false,
    '.env.example': false,
    'package.json': false
  };

  try {
    for (const file of Object.keys(checks)) {
      checks[file] = existsSync(join(__dirname, '..', file));
    }

    for (const [name, hasFeature] of Object.entries(checks)) {
      log(hasFeature ? 'green' : 'yellow', `  ${checkIcon(hasFeature)} ${name}`);
    }

    const passed = Object.values(checks).filter(Boolean).length;
    log('blue', `\n  配置文件: ${passed}/${Object.keys(checks).length} 项存在`);

    return { passed, total: Object.keys(checks).length, checks };
  } catch (err) {
    log('red', `  检查失败: ${err.message}`);
    return { passed: 0, total: Object.keys(checks).length, error: err.message };
  }
}

// ==================== 主函数 ====================
async function main() {
  console.log('\n' + '═'.repeat(60));
  log('cyan', '🔍 MiniClaw 功能模块检查');
  console.log('═'.repeat(60));

  const results = {
    agent: checkAgentModule(),
    agentFactory: checkAgentFactoryModule(),
    router: checkRouterModule(),
    gateway: checkGatewayModule(),
    channel: checkChannelModule(),
    tools: checkToolsModule(),
    session: checkSessionModule(),
    utils: checkUtilsModule(),
    config: checkConfigFiles()
  };

  // 总结
  console.log('\n' + '═'.repeat(60));
  log('cyan', '📊 检查总结');
  console.log('═'.repeat(60));

  let totalPassed = 0;
  let totalChecks = 0;

  for (const [module, result] of Object.entries(results)) {
    const status = result.passed === result.total ? colors.green :
                   result.passed >= result.total * 0.8 ? colors.yellow :
                   colors.red;
    console.log(`  ${status}${module.padEnd(15)} ${result.passed}/${result.total}${colors.reset}`);
    totalPassed += result.passed;
    totalChecks += result.total;
  }

  console.log('─'.repeat(60));
  const percentage = Math.round((totalPassed / totalChecks) * 100);
  const overallColor = percentage >= 90 ? colors.green :
                       percentage >= 70 ? colors.yellow :
                       colors.red;
  console.log(`  ${overallColor}总计: ${totalPassed}/${totalChecks} (${percentage}%)${colors.reset}`);
  console.log('═'.repeat(60) + '\n');

  // 问题汇总
  log('cyan', '⚠️  潜在问题');
  console.log('─'.repeat(60));

  let hasIssues = false;
  for (const [module, result] of Object.entries(results)) {
    if (result.checks) {
      for (const [check, passed] of Object.entries(result.checks)) {
        if (!passed) {
          log('red', `  ✗ ${module}: ${check}`);
          hasIssues = true;
        }
      }
    }
  }

  if (!hasIssues) {
    log('green', '  ✓ 所有检查项均通过！');
  }

  console.log('');
}

main().catch(console.error);
