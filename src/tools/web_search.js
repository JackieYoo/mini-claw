/**
 * Web Search Tool - Search the web (with URL validation)
 */

import { validateUrl } from '../utils/validator.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('web');

export const webSearchTool = {
  name: 'web_search',
  description: 'Search the web for information',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query'
      },
      count: {
        type: 'number',
        description: 'Number of results to return (default: 5)'
      }
    },
    required: ['query']
  },
  
  async execute({ query, count = 5 }) {
    if (!query || typeof query !== 'string') {
      return {
        success: false,
        error: '搜索关键词不能为空'
      };
    }

    // 限制搜索结果数量
    count = Math.min(Math.max(count, 1), 20);

    try {
      logger.info(`搜索: ${query}`);
      
      // 使用 DuckDuckGo 或其他搜索 API
      // 这里使用模拟实现，实际项目中应该接入真实的搜索 API
      const results = await performSearch(query, count);
      
      return {
        success: true,
        query,
        count: results.length,
        results
      };
    } catch (err) {
      logger.error(`搜索失败: ${err.message}`);
      return {
        success: false,
        error: err.message
      };
    }
  }
};

/**
 * 执行搜索（模拟实现）
 * 实际项目中应该接入真实的搜索 API，如：
 * - Google Custom Search API
 * - Bing Web Search API
 * - SerpAPI
 * - DuckDuckGo Instant Answer API
 */
async function performSearch(query, count) {
  // 模拟搜索结果
  // 实际使用时，请替换为真实的搜索 API
  const mockResults = [
    {
      title: `搜索结果: ${query}`,
      url: 'https://example.com/result1',
      snippet: `这是关于 "${query}" 的搜索结果...`
    }
  ];

  // 如果有环境变量配置的搜索 API，使用真实搜索
  if (process.env.SEARCH_API_KEY) {
    // TODO: 实现真实的搜索 API 调用
    logger.debug('使用真实搜索 API');
  }

  return mockResults.slice(0, count);
}

/**
 * HTTP 请求工具（可选）
 */
export const httpRequestTool = {
  name: 'http_request',
  description: 'Make an HTTP request to a URL',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to request'
      },
      method: {
        type: 'string',
        enum: ['GET', 'POST', 'PUT', 'DELETE'],
        description: 'HTTP method (default: GET)'
      },
      headers: {
        type: 'object',
        description: 'Request headers'
      },
      body: {
        type: 'string',
        description: 'Request body (for POST/PUT)'
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 30000)'
      }
    },
    required: ['url']
  },
  
  async execute({ url, method = 'GET', headers = {}, body, timeout = 30000 }) {
    // URL 验证
    const validation = validateUrl(url);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error
      };
    }

    try {
      logger.info(`HTTP ${method} ${url}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const options = {
        method,
        headers: {
          'User-Agent': 'MiniClaw/0.1.0',
          ...headers
        }
      };

      if (body && ['POST', 'PUT'].includes(method)) {
        options.body = body;
      }

      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const responseText = await response.text();
      
      // 限制响应大小
      const maxSize = 1024 * 1024; // 1MB
      const truncated = responseText.length > maxSize;
      
      return {
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: truncated ? responseText.substring(0, maxSize) : responseText,
        truncated
      };
    } catch (err) {
      logger.error(`HTTP 请求失败: ${err.message}`);
      return {
        success: false,
        error: err.message
      };
    }
  }
};
