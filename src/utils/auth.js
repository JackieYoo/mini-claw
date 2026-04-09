/**
 * Auth Middleware - API 认证中间件
 *
 * 支持 API Key 认证
 */

import crypto from 'crypto';
import { createLogger } from './logger.js';

const logger = createLogger('auth');

/**
 * Constant-time string comparison to prevent timing attacks
 */
function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Lengths differ — still do a compare to keep constant time
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * 创建 API Key 认证中间件
 */
export function createApiKeyAuth(options = {}) {
  const {
    apiKeys = process.env.API_KEYS?.split(',').filter(Boolean) || [],
    headerName = 'x-api-key',
    queryParam = 'api_key',
  } = options;

  if (apiKeys.length === 0) {
    logger.warn('未配置 API Keys，认证已禁用');
    return async (request, reply) => {}; // 空中间件
  }

  return async (request, reply) => {
    // 从 header 或 query 获取 API key
    const apiKey = request.headers[headerName] || request.query[queryParam];

    if (!apiKey) {
      reply.status(401).send({
        error: 'Unauthorized',
        message: 'API key is required',
      });
      return;
    }

    // 验证 API key (constant-time comparison)
    const valid = apiKeys.some(k => safeEqual(apiKey, k));
    if (!valid) {
      logger.warn(`无效的 API Key: ${apiKey.substring(0, 8)}...`);
      reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid API key',
      });
      return;
    }

    // 记录认证信息
    request.auth = {
      type: 'apikey',
      apiKey: apiKey.substring(0, 8) + '...',
    };
  };
}

/**
 * 创建认证中间件
 */
export function createAuth(options = {}) {
  const {
    enableApiKey = true,
    publicPaths = ['/health', '/'], // 公开路径
    ...authOptions
  } = options;

  const apiKeyAuth = enableApiKey ? createApiKeyAuth(authOptions) : null;

  return async (request, reply) => {
    // 检查是否为公开路径
    const path = request.routerPath || request.url.split('?')[0];
    if (publicPaths.includes(path)) {
      return;
    }

    // 如果没有启用任何认证，直接通过
    if (!apiKeyAuth) {
      return;
    }

    // 进行 API Key 认证
    await apiKeyAuth(request, reply);
  };
}

/**
 * 创建 API Key（使用 crypto 生成安全随机字符串）
 */
export function generateApiKey() {
  const prefix = 'sk-';
  const randomBytes = crypto.randomBytes(32);
  const key = prefix + randomBytes.toString('base64url');
  return key;
}

/**
 * 验证 API Key 格式
 */
export function validateApiKeyFormat(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }

  // 检查前缀和长度
  return apiKey.startsWith('sk-') && apiKey.length >= 40;
}