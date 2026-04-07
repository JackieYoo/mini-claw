/**
 * Retry Manager - 实现指数退避的重试策略
 *
 * Features:
 * - 指数退避算法
 * - 最大重试次数限制
 * - 自定义重试条件
 * - 抖动（jitter）支持
 */

import { createLogger } from './logger.js';

const logger = createLogger('retry');

/**
 * 默认重试配置
 */
const DEFAULT_OPTIONS = {
  maxRetries: 3,
  initialDelay: 1000, // 1秒
  maxDelay: 30000, // 30秒
  factor: 2, // 指数因子
  jitter: true, // 是否添加随机抖动
  shouldRetry: (err) => true, // 默认总是重试
};

/**
 * 计算重试延迟
 */
function calculateDelay(attempt, options) {
  const { initialDelay, maxDelay, factor, jitter } = options;

  // 指数退避
  let delay = Math.min(initialDelay * Math.pow(factor, attempt - 1), maxDelay);

  // 添加抖动（0-25%的随机延迟）
  if (jitter) {
    const jitterAmount = delay * 0.25 * Math.random();
    delay += jitterAmount;
  }

  return Math.floor(delay);
}

/**
 * 等待指定时间
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 执行带重试的异步操作
 *
 * @param {Function} fn - 要执行的异步函数
 * @param {Object} options - 重试配置
 * @returns {Promise} 操作结果
 */
export async function retry(fn, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { maxRetries, shouldRetry } = opts;

  let lastError;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      logger.debug(`执行尝试 ${attempt}/${maxRetries + 1}`);
      const result = await fn();

      // 成功，返回结果
      if (attempt > 1) {
        logger.info(`重试成功，第 ${attempt} 次尝试`);
      }
      return result;
    } catch (err) {
      lastError = err;

      // 检查是否应该重试
      if (attempt > maxRetries || !shouldRetry(err)) {
        logger.error(`放弃重试: ${err.message}`);
        throw err;
      }

      // 计算延迟
      const delay = calculateDelay(attempt, opts);
      logger.warn(`操作失败 (尝试 ${attempt}/${maxRetries + 1}): ${err.message}`);
      logger.info(`等待 ${delay}ms 后重试...`);

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * 创建重试包装器
 *
 * @param {Object} options - 默认重试配置
 * @returns {Function} 重试函数
 */
export function createRetry(options = {}) {
  const defaultOpts = { ...DEFAULT_OPTIONS, ...options };

  return function retryWithDefaults(fn, overrides = {}) {
    return retry(fn, { ...defaultOpts, ...overrides });
  };
}

/**
 * HTTP 请求的重试条件
 *
 * @param {Error} err - 错误对象
 * @returns {boolean} 是否应该重试
 */
export function shouldRetryHttp(err) {
  // 网络错误
  if (err.code === 'ECONNREFUSED' ||
      err.code === 'ENOTFOUND' ||
      err.code === 'ETIMEDOUT' ||
      err.code === 'ECONNRESET') {
    return true;
  }

  // HTTP 状态码
  if (err.status) {
    // 5xx 服务器错误 - 重试
    if (err.status >= 500) return true;

    // 429 Too Many Requests - 重试
    if (err.status === 429) return true;

    // 408 Request Timeout - 重试
    if (err.status === 408) return true;

    // 其他 4xx 错误不重试
    if (err.status >= 400 && err.status < 500) return false;
  }

  // 默认重试
  return true;
}

/**
 * API 调用的重试条件
 *
 * @param {Error} err - 错误对象
 * @returns {boolean} 是否应该重试
 */
export function shouldRetryApi(err) {
  // 认证错误不重试
  if (err.status === 401 || err.code === 'invalid_api_key') {
    return false;
  }

  // 参数错误不重试
  if (err.status === 400 || err.type === 'invalid_request_error') {
    return false;
  }

  // 资源不存在不重试
  if (err.status === 404) {
    return false;
  }

  // 其他情况使用 HTTP 重试逻辑
  return shouldRetryHttp(err);
}

/**
 * 为函数添加重试装饰器
 *
 * @param {Function} fn - 原函数
 * @param {Object} options - 重试配置
 * @returns {Function} 带重试的函数
 */
export function withRetry(fn, options = {}) {
  return async function retriedFunction(...args) {
    return retry(() => fn.apply(this, args), options);
  };
}

/**
 * 为类方法添加重试装饰器
 *
 * @param {Object} options - 重试配置
 * @returns {Function} 装饰器函数
 */
export function retryable(options = {}) {
  return function (target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args) {
      return retry(() => originalMethod.apply(this, args), options);
    };

    return descriptor;
  };
}

// 导出预配置的重试函数
export const retryHttp = createRetry({ shouldRetry: shouldRetryHttp });
export const retryApi = createRetry({ shouldRetry: shouldRetryApi });