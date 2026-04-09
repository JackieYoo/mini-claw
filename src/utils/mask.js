/**
 * 敏感信息脱敏工具
 * 用于日志输出、配置展示等场景
 */

// 敏感字段关键词（不区分大小写）
const SENSITIVE_KEYWORDS = [
  'api_key', 'apikey', 'api-key',
  'app_secret', 'appsecret', 'app-secret', 'secret',
  'password', 'passwd', 'pwd',
  'token', 'access_token', 'refresh_token',
  'credential', 'auth', 'private_key', 'privatekey',
  'key', 'certificate', 'cert'
];

/**
 * 脱敏敏感数据
 * @param {*} data - 任意数据类型
 * @param {Object} options - 配置选项
 * @param {string[]} options.keys - 额外的敏感字段名
 * @param {number} options.visibleChars - 保留的可见字符数（默认 3）
 * @param {string} options.mask - 掩码字符（默认 ***）
 * @returns {*} 脱敏后的数据
 */
export function maskSensitiveData(data, options = {}) {
  const {
    keys = [],
    visibleChars = 3,
    mask = '***'
  } = options;

  const sensitiveKeys = new Set([...SENSITIVE_KEYWORDS, ...keys].map(k => k.toLowerCase()));

  // 检查字段名是否敏感
  function isSensitiveKey(key) {
    const lowerKey = key.toLowerCase();
    return sensitiveKeys.has(lowerKey) ||
           sensitiveKeys.has(lowerKey.replace(/[_-]/g, '')) ||
           sensitiveKeys.has(lowerKey.replace(/_/g, '-')) ||
           sensitiveKeys.has(lowerKey.replace(/-/g, '_'));
  }

  // 脱敏字符串值
  function maskString(str) {
    if (!str || typeof str !== 'string') return str;
    if (str.length <= visibleChars) return mask;

    // 保留前几位，其余用掩码替代
    const prefix = str.slice(0, visibleChars);
    return `${prefix}${mask}`;
  }

  // 递归处理
  function process(value, depth = 0) {
    // 防止循环引用
    if (depth > 10) return '[Circular]';

    if (value === null || value === undefined) {
      return value;
    }

    // 处理字符串
    if (typeof value === 'string') {
      return value;
    }

    // 处理数字、布尔值
    if (typeof value !== 'object') {
      return value;
    }

    // 处理数组
    if (Array.isArray(value)) {
      return value.map(item => process(item, depth + 1));
    }

    // 处理对象
    const result = {};
    for (const [key, val] of Object.entries(value)) {
      if (isSensitiveKey(key)) {
        // 敏感字段脱敏
        if (typeof val === 'string') {
          result[key] = maskString(val);
        } else if (val === null || val === undefined) {
          result[key] = val;
        } else {
          result[key] = mask;
        }
      } else {
        // 非敏感字段递归处理
        result[key] = process(val, depth + 1);
      }
    }
    return result;
  }

  return process(data);
}

/**
 * 快速脱敏 - 用于简单场景
 * @param {*} data - 需要脱敏的数据
 * @returns {string} 脱敏后的 JSON 字符串
 */
export function maskAndStringify(data) {
  const masked = maskSensitiveData(data);
  return JSON.stringify(masked, null, 2);
}

/**
 * 安全日志输出
 * 将数据脱敏后输出到日志
 * @param {Object} logger - 日志实例
 * @param {string} level - 日志级别
 * @param {string} message - 消息
 * @param {*} data - 需要脱敏的数据
 */
export function logSafe(logger, level, message, data) {
  if (!logger || typeof logger[level] !== 'function') {
    return;
  }

  const masked = maskSensitiveData(data);
  logger[level](message, masked);
}
