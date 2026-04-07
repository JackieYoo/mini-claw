/**
 * Security Utilities - 安全工具函数
 */

import { createLogger } from './logger.js';

const logger = createLogger('security');

/**
 * 脱敏敏感信息
 */
export function maskSensitive(text, patterns = null) {
  if (!text || typeof text !== 'string') return text;
  
  const defaultPatterns = [
    // API Keys
    { pattern: /(api[_-]?key\s*[=:]\s*['"]?)([^\s'"]+)/gi, replacement: '$1***' },
    // Passwords
    { pattern: /(password\s*[=:]\s*['"]?)([^\s'"]+)/gi, replacement: '$1***' },
    // Secrets
    { pattern: /(secret\s*[=:]\s*['"]?)([^\s'"]+)/gi, replacement: '$1***' },
    // Tokens
    { pattern: /(token\s*[=:]\s*['"]?)([^\s'"]+)/gi, replacement: '$1***' },
    // Authorization headers
    { pattern: /(authorization\s*:\s*bearer\s+)([^\s]+)/gi, replacement: '$1***' },
    // Connection strings
    { pattern: /(mongodb|postgres|mysql|redis):\/\/[^:]+:[^@]+@/gi, replacement: '$1://***:***@' },
  ];
  
  const allPatterns = patterns || defaultPatterns;
  let result = text;
  
  for (const { pattern, replacement } of allPatterns) {
    result = result.replace(pattern, replacement);
  }
  
  return result;
}

/**
 * 安全的错误消息（避免泄露内部细节）
 */
export function safeErrorMessage(error, defaultMessage = '操作失败') {
  // 生产环境返回通用错误
  if (process.env.NODE_ENV === 'production') {
    return defaultMessage;
  }
  
  // 开发环境返回详细错误（但脱敏）
  const message = error.message || defaultMessage;
  return maskSensitive(message);
}

/**
 * 验证文件权限
 */
export function checkFilePermission(filePath, mode = 'read') {
  const fs = require('fs');
  
  try {
    if (mode === 'read') {
      fs.accessSync(filePath, fs.constants.R_OK);
    } else if (mode === 'write') {
      fs.accessSync(filePath, fs.constants.W_OK);
    }
    return { allowed: true };
  } catch (err) {
    return { allowed: false, error: `Permission denied: ${mode}` };
  }
}

/**
 * 创建安全的错误响应
 */
export function createSafeErrorResponse(error, context = {}) {
  const isDev = process.env.NODE_ENV !== 'production';
  
  const response = {
    success: false,
    error: safeErrorMessage(error),
    timestamp: new Date().toISOString(),
  };
  
  // 开发环境添加更多调试信息
  if (isDev) {
    response.details = {
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 3),
      context,
    };
  }
  
  return response;
}

/**
 * 输入清理（防止日志注入等）
 */
export function sanitizeForLog(input) {
  if (typeof input !== 'string') return input;
  
  return input
    // 移除控制字符
    .replace(/[\x00-\x1F\x7F]/g, '')
    // 限制长度
    .substring(0, 1000)
    // 转义可能的日志格式字符
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

/**
 * 会话数据加密（简单实现，生产环境应使用更安全的方案）
 */
export function encryptSessionData(data, secret) {
  if (!secret) {
    logger.warn('未配置加密密钥，会话数据将以明文存储');
    return JSON.stringify(data);
  }
  
  // 简单的 XOR 加密（生产环境应使用 crypto 模块）
  const str = JSON.stringify(data);
  const key = secret.padEnd(32, '0').substring(0, 32);
  let encrypted = '';
  
  for (let i = 0; i < str.length; i++) {
    encrypted += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  
  return Buffer.from(encrypted).toString('base64');
}

/**
 * 会话数据解密
 */
export function decryptSessionData(encrypted, secret) {
  if (!secret) {
    return JSON.parse(encrypted);
  }
  
  try {
    const key = secret.padEnd(32, '0').substring(0, 32);
    const str = Buffer.from(encrypted, 'base64').toString();
    let decrypted = '';
    
    for (let i = 0; i < str.length; i++) {
      decrypted += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    
    return JSON.parse(decrypted);
  } catch (err) {
    logger.error('解密会话数据失败:', err);
    return null;
  }
}
