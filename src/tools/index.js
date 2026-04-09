/**
 * Tool Registry - 管理和执行工具
 */

import { shellTool } from './shell.js';
import { fileReadTool } from './file_read.js';
import { fileWriteTool } from './file_write.js';
import { webSearchTool } from './web_search.js';
import { httpRequestTool } from './http_request.js';
import { createMemoryTool } from './memory.js';
import { createLogger } from '../utils/logger.js';
import { createCache } from '../utils/cache.js';

const logger = createLogger('tools');

export function createToolRegistry(options = {}) {
  const tools = new Map();

  // 创建工具缓存
  const cache = createCache({
    maxSize: options.cacheMaxSize || 500,
    defaultTTL: options.cacheDefaultTTL || 300000, // 5分钟
  });

  // 缓存配置 - 哪些工具应该被缓存
  const cacheConfig = {
    file_read: { ttl: 600000 }, // 10分钟
    web_search: { ttl: 3600000 }, // 1小时
    http_request: { ttl: 300000 }, // 5分钟
    // shell 和 file_write 不应该被缓存
  };
  
  // 注册内置工具
  register(shellTool);
  register(fileReadTool);
  register(fileWriteTool);
  register(webSearchTool);
  register(httpRequestTool);
  
  // 注册记忆工具（需要指定记忆目录）
  if (options.memoryDir) {
    register(createMemoryTool(options.memoryDir));
  }
  
  function register(tool) {
    if (!tool || !tool.name) {
      logger.warn('无效的工具定义');
      return;
    }
    tools.set(tool.name, tool);
    logger.debug(`注册工具: ${tool.name}`);
  }
  
  function get(name) {
    return tools.get(name);
  }
  
  function getTools() {
    return Array.from(tools.values());
  }
  
  function getToolNames() {
    return Array.from(tools.keys());
  }
  
  function has(name) {
    return tools.has(name);
  }
  
  async function execute(name, args, timeoutMs = 30000) {
    const tool = tools.get(name);
    if (!tool) {
      throw new Error(`工具不存在: ${name}`);
    }

    logger.info(`执行工具: ${name}`);
    const startTime = Date.now();

    try {
      // 检查是否应该使用缓存
      const shouldCache = cacheConfig[name] !== undefined;

      if (shouldCache) {
        // 尝试从缓存获取
        const cachedResult = cache.get(name, args);
        if (cachedResult !== null) {
          const duration = Date.now() - startTime;
          logger.info(`工具完成 (缓存命中): ${name} (${duration}ms)`);
          return cachedResult;
        }
      }

      // 执行工具（带超时控制）
      const executeWithTimeout = Promise.race([
        tool.execute(args || {}),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`工具执行超时: ${name} 超过 ${timeoutMs}ms`)), timeoutMs)
        )
      ]);

      const result = await executeWithTimeout;
      const duration = Date.now() - startTime;
      logger.info(`工具完成: ${name} (${duration}ms)`);

      // 如果配置了缓存，保存结果
      if (shouldCache && result.success !== false) {
        const ttl = cacheConfig[name].ttl;
        cache.set(name, args, result, ttl);
      }

      return result;
    } catch (err) {
      const duration = Date.now() - startTime;
      logger.error(`工具失败: ${name} (${duration}ms)`, err.message);
      throw err;
    }
  }
  
  // 获取工具描述（用于注入到系统提示）
  function getToolsDescription() {
    const toolList = getTools();
    if (toolList.length === 0) return '';
    
    const descriptions = toolList.map(t => 
      `- **${t.name}**: ${t.description}`
    ).join('\n');
    
    return `\n## 可用工具\n\n${descriptions}\n`;
  }
  
  return {
    register,
    get,
    getTools,
    getToolNames,
    has,
    execute,
    getToolsDescription,
    cache: {
      stats: () => cache.getStats(),
      clear: () => cache.clear(),
      invalidate: (toolName) => cache.invalidate(toolName),
    },
  };
}
