/**
 * Security Utilities - 安全工具函数
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual as _tse } from 'crypto';
import { accessSync, constants } from 'fs';
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
  try {
    if (mode === 'read') {
      accessSync(filePath, constants.R_OK);
    } else if (mode === 'write') {
      accessSync(filePath, constants.W_OK);
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

const AES_ALGO = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * 从 secret 派生加密密钥
 */
function deriveKey(secret) {
  return scryptSync(secret, 'miniclaw-session-salt', KEY_LENGTH);
}

/**
 * 会话数据加密（AES-256-GCM）
 */
export function encryptSessionData(data, secret) {
  const payload = JSON.stringify(data);

  if (!secret) {
    logger.warn('未配置加密密钥，会话数据将以明文存储');
    return payload;
  }

  const key = deriveKey(secret);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(AES_ALGO, key, iv);

  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // 格式: iv(16) + authTag(16) + ciphertext
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

/**
 * 会话数据解密
 */
export function decryptSessionData(encrypted, secret) {
  if (!secret) {
    try {
      return JSON.parse(encrypted);
    } catch {
      return null;
    }
  }

  try {
    const raw = Buffer.from(encrypted, 'base64');

    const iv = raw.subarray(0, IV_LENGTH);
    const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const key = deriveKey(secret);
    const decipher = createDecipheriv(AES_ALGO, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch (err) {
    logger.error('解密会话数据失败:', err.message);
    return null;
  }
}
