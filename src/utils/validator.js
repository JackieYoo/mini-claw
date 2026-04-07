/**
 * Input Validator - 安全输入验证
 * 防止注入攻击和危险操作
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger('validator');

// 危险命令黑名单
const DANGEROUS_COMMANDS = [
  /rm\s+-rf\s+\//,           // rm -rf /
  /rm\s+-rf\s+~/,           // rm -rf ~
  />\s*\/dev\/(sda|hda|nvme)/, // 写入磁盘设备
  /mkfs/,                    // 格式化
  /dd\s+if=/,               // dd 命令
  /:(){ :|:& };:/,          // Fork bomb
  /chmod\s+(-R\s+)?777\s+\//, // 危险权限
  /chown\s+(-R\s+)?/,       // 批量修改所有者
  /shutdown/,               // 关机
  /reboot/,                 // 重启
  /init\s+0/,               // 关机
  /init\s+6/,               // 重启
  /curl.*\|.*sh/,           // curl | sh 远程执行
  /wget.*\|.*sh/,           // wget | sh 远程执行
];

// 危险字符模式（命令替换、注入等）
const DANGEROUS_PATTERNS = [
  /\$\([^)]*\)/,            // $(command) 命令替换
  /`[^`]*`/,                // `command` 反引号命令替换
  /\$\{[^}]*\}/,            // ${var} 变量展开（可能危险）
  /\|\s*sh/,                // | sh 管道执行
  /\|\s*bash/,              // | bash 管道执行
  /;\s*rm/,                 // ; rm 命令链接
  /&&\s*rm/,                // && rm 命令链接
  /\|\|\s*rm/,              // || rm 命令链接
];

// 敏感文件路径
const SENSITIVE_PATHS = [
  /^\/etc\/passwd/,
  /^\/etc\/shadow/,
  /^\/etc\/sudoers/,
  /^\/\.ssh/,
  /^\/\.env/,
  /^.*\.pem$/,
  /^.*\.key$/,
  /^.*\.p12$/,
];

// 允许的文件路径（白名单）
const ALLOWED_PATHS = [
  /^\/Users\//,      // macOS 用户目录
  /^\/home\//,       // Linux 用户目录
  /^\/tmp\//,        // 临时目录
  /^\/var\/tmp\//,   // 临时目录
  /^\.\//,           // 相对路径
  /^[^\/]/,          // 相对路径（不以 / 开头）
];

/**
 * 验证 Shell 命令
 */
export function validateShellCommand(command) {
  if (!command || typeof command !== 'string') {
    return { valid: false, error: '命令不能为空' };
  }

  // 检查命令长度
  if (command.length > 10000) {
    return { valid: false, error: '命令过长' };
  }

  // 检查换行符注入
  if (command.includes('\n') || command.includes('\r')) {
    logger.warn(`拒绝包含换行符的命令`);
    return { valid: false, error: '命令不能包含换行符' };
  }

  // 检查危险命令
  for (const pattern of DANGEROUS_COMMANDS) {
    if (pattern.test(command)) {
      logger.warn(`拒绝危险命令: ${command.substring(0, 50)}...`);
      return { valid: false, error: '命令包含危险操作，已被拒绝' };
    }
  }

  // 检查危险模式（命令替换、注入等）
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      logger.warn(`拒绝危险模式: ${command.substring(0, 50)}...`);
      return { valid: false, error: '命令包含危险的命令替换或注入模式' };
    }
  }

  // 检查管道和链式命令中的危险操作
  const subCommands = command.split(/[|;&]/);
  for (const subCmd of subCommands) {
    const trimmed = subCmd.trim();
    
    for (const pattern of DANGEROUS_COMMANDS) {
      if (pattern.test(trimmed)) {
        logger.warn(`拒绝危险命令: ${trimmed.substring(0, 50)}...`);
        return { valid: false, error: '命令包含危险操作，已被拒绝' };
      }
    }
    
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(trimmed)) {
        logger.warn(`拒绝危险模式: ${trimmed.substring(0, 50)}...`);
        return { valid: false, error: '命令包含危险的命令替换或注入模式' };
      }
    }
  }

  return { valid: true };
}

/**
 * 验证文件路径
 */
export function validateFilePath(path, operation = 'read') {
  if (!path || typeof path !== 'string') {
    return { valid: false, error: '路径不能为空' };
  }

  // 检查路径长度
  if (path.length > 4096) {
    return { valid: false, error: '路径过长' };
  }

  // 检查空字节注入
  if (path.includes('\0')) {
    logger.warn(`拒绝包含空字节的路径: ${path}`);
    return { valid: false, error: '路径包含非法字符' };
  }

  // 检查路径遍历攻击
  if (path.includes('..')) {
    // 规范化路径后再次检查
    const normalized = normalizePath(path);
    if (normalized.includes('..')) {
      logger.warn(`拒绝路径遍历攻击: ${path}`);
      return { valid: false, error: '路径遍历攻击已被阻止' };
    }
    if (!isPathAllowed(normalized)) {
      return { valid: false, error: '路径不在允许范围内' };
    }
  }

  // 检查敏感文件
  for (const pattern of SENSITIVE_PATHS) {
    if (pattern.test(path)) {
      logger.warn(`拒绝访问敏感文件: ${path}`);
      return { valid: false, error: '无法访问敏感文件' };
    }
  }

  // 检查是否在允许路径内
  if (!isPathAllowed(path)) {
    return { valid: false, error: '路径不在允许范围内' };
  }

  return { valid: true };
}

/**
 * 规范化路径
 */
function normalizePath(path) {
  return path
    .replace(/\/+/g, '/')
    .replace(/\/\.\//g, '/')
    .replace(/\/[^\/]+\/\.\.\//g, '/');
}

/**
 * 检查路径是否在允许范围内
 */
function isPathAllowed(path) {
  // 相对路径始终允许
  if (!path.startsWith('/')) {
    return true;
  }

  // 检查白名单
  for (const pattern of ALLOWED_PATHS) {
    if (pattern.test(path)) {
      return true;
    }
  }

  return false;
}

/**
 * 验证 URL
 */
export function validateUrl(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL 不能为空' };
  }

  try {
    const parsed = new URL(url);
    
    // 只允许 http 和 https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: '只支持 HTTP 和 HTTPS 协议' };
    }

    // 防止访问内网地址（可选）
    const hostname = parsed.hostname;
    const privatePatterns = [
      /^localhost$/i,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^::1$/,
      /^fc00:/i,
      /^fe80:/i,
    ];

    // 注意：这里不阻止内网访问，因为可能需要访问内部服务
    // 如果需要阻止，可以取消注释以下代码
    // for (const pattern of privatePatterns) {
    //   if (pattern.test(hostname)) {
    //     return { valid: false, error: '无法访问内网地址' };
    //   }
    // }

    return { valid: true };
  } catch (err) {
    return { valid: false, error: 'URL 格式无效' };
  }
}

/**
 * 验证 JSON
 */
export function validateJson(str, maxLength = 1024 * 1024) {
  if (!str || typeof str !== 'string') {
    return { valid: false, error: 'JSON 字符串不能为空' };
  }

  if (str.length > maxLength) {
    return { valid: false, error: 'JSON 数据过长' };
  }

  try {
    JSON.parse(str);
    return { valid: true };
  } catch (err) {
    return { valid: false, error: 'JSON 格式无效' };
  }
}

/**
 * 清理用户输入（防止 XSS 等）
 */
export function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
}

/**
 * 创建验证中间件
 */
export function createValidator(options = {}) {
  const {
    allowPrivateNetworks = true,
    maxCommandLength = 10000,
    maxPathLength = 4096,
  } = options;

  return {
    validateShellCommand,
    validateFilePath,
    validateUrl,
    validateJson,
    sanitizeInput,
  };
}
