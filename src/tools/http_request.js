/**
 * HTTP Request Tool - 发送 HTTP 请求
 */

import { validateUrl } from '../utils/validator.js';
import { createLogger } from '../utils/logger.js';
import { retryHttp } from '../utils/retry.js';

const logger = createLogger('http');

// 内网 IP 模式（用于 SSRF 防护）
const PRIVATE_IP_PATTERNS = [
  /^127\./,                          // 127.0.0.0/8
  /^10\./,                           // 10.0.0.0/8
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
  /^192\.168\./,                     // 192.168.0.0/16
  /^169\.254\./,                     // Link-local
  /^0\.0\.0\.0/,                     // All interfaces
  /^localhost$/i,                    // localhost
  /^::1$/,                           // IPv6 loopback
  /^fc00:/i,                         // IPv6 private
  /^fe80:/i,                         // IPv6 link-local
];

// SSRF 防护：检查是否为内网地址
function isPrivateIP(hostname) {
  // 如果是 IP 地址，直接检查
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      return true;
    }
  }
  return false;
}

// SSRF 防护：检查 URL 是否安全
function isUrlSafeForSSRF(urlString) {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname;
    
    // 检查是否为内网地址
    if (isPrivateIP(hostname)) {
      // 允许内网访问（如果环境变量配置）
      const allowPrivate = process.env.HTTP_ALLOW_PRIVATE_NETWORK === 'true';
      if (!allowPrivate) {
        return { safe: false, reason: 'Access to private networks is not allowed' };
      }
    }
    
    // 检查协议
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { safe: false, reason: 'Only HTTP and HTTPS protocols are allowed' };
    }
    
    return { safe: true };
  } catch (err) {
    return { safe: false, reason: 'Invalid URL' };
  }
}

export const httpRequestTool = {
  name: 'http_request',
  description: '发送 HTTP 请求获取数据，支持 GET、POST 等方法',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: '请求的 URL 地址'
      },
      method: {
        type: 'string',
        enum: ['GET', 'POST', 'PUT', 'DELETE'],
        description: 'HTTP 方法（默认 GET）'
      },
      headers: {
        type: 'object',
        description: '请求头（可选）'
      },
      body: {
        type: 'object',
        description: '请求体（POST/PUT 时可用）'
      },
      timeout: {
        type: 'number',
        description: '超时时间（毫秒，默认 10000）'
      }
    },
    required: ['url']
  },
  
  async execute({ url, method = 'GET', headers = {}, body, timeout = 10000 }) {
    // SSRF 防护检查
    const ssrfCheck = isUrlSafeForSSRF(url);
    if (!ssrfCheck.safe) {
      return { success: false, error: `SSRF 防护: ${ssrfCheck.reason}` };
    }

    // 基础 URL 验证
    const validation = validateUrl(url);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // 使用重试机制执行请求
    return retryHttp(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MiniClaw/0.2.0',
          ...headers
        },
        signal: controller.signal,
      };

      if (body && ['POST', 'PUT'].includes(method)) {
        options.body = JSON.stringify(body);
      }

      logger.info(`HTTP ${method} ${url}`);

      const response = await fetch(url, options);
      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type') || '';
      let data;

      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
        // 截断过长的响应
        if (data.length > 10000) {
          data = data.substring(0, 10000) + '\n... (已截断)';
        }
      }

      // 如果响应不成功，抛出错误以触发重试
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
        error.status = response.status;
        error.data = data;
        throw error;
      }

      return {
        success: true,
        status: response.status,
        statusText: response.statusText,
        data
      };
    }, {
      maxRetries: 3,
      initialDelay: 1000,
    }).catch(err => {
      // 处理最终失败
      if (err.name === 'AbortError') {
        return { success: false, error: '请求超时' };
      }
      return {
        success: false,
        error: err.message,
        status: err.status,
        data: err.data,
      };
    });
  }
};
