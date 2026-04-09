/**
 * Configuration Manager - Enhanced config loading with validation
 * 
 * Features:
 * - Environment variable substitution (${VAR_NAME})
 * - Configuration validation
 * - Default values
 * - Multi-environment support
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';
import { createLogger } from './logger.js';
import { maskSensitiveData } from './mask.js';

const logger = createLogger('config');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 替换环境变量
 * 支持 ${VAR_NAME} 和 ${VAR_NAME:-default} 格式
 */
function substituteEnvVars(value) {
  if (typeof value === 'string') {
    // 匹配 ${VAR_NAME} 或 ${VAR_NAME:-default}
    return value.replace(/\$\{([^}]+)\}/g, (match, expr) => {
      const parts = expr.split(':-');
      const varName = parts[0].trim();
      const defaultValue = parts[1] ? parts[1].trim() : '';
      
      const envValue = process.env[varName];
      
      if (envValue !== undefined) {
        return envValue;
      }
      
      if (defaultValue) {
        return defaultValue;
      }
      
      logger.warn(`环境变量 ${varName} 未设置且无默认值`);
      return match;
    });
  }
  
  if (Array.isArray(value)) {
    return value.map(substituteEnvVars);
  }
  
  if (typeof value === 'object' && value !== null) {
    const result = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = substituteEnvVars(val);
    }
    return result;
  }
  
  return value;
}

/**
 * 配置验证规则
 */
const validationRules = {
  gateway: {
    port: { type: 'number', min: 1024, max: 65535, required: true },
    host: { type: 'string', required: false, default: '0.0.0.0' },
  },
  model: {
    provider: { type: 'string', required: false, default: 'openai-compatible' },
    base_url: { type: 'string', required: true },
    api_key: { type: 'string', required: true },
    model: { type: 'string', required: true },
    temperature: { type: 'number', min: 0, max: 2, required: false, default: 0.7 },
    max_tokens: { type: 'number', min: 1, max: 128000, required: false, default: 4096 },
  },
  channels: {
    feishu: {
      enabled: { type: 'boolean', required: false, default: true },
      app_id: { type: 'string', required: true },
      app_secret: { type: 'string', required: true },
      domain: { type: 'string', required: false, default: 'feishu' },
    },
  },
};

/**
 * 验证配置
 */
function validateConfig(config, rules, path = '') {
  const errors = [];
  const warnings = [];
  
  for (const [key, rule] of Object.entries(rules)) {
    const fullPath = path ? `${path}.${key}` : key;
    const value = config[key];
    
    // 检查必填项
    if (rule.required && (value === undefined || value === null || value === '')) {
      if (rule.default !== undefined) {
        config[key] = rule.default;
        warnings.push(`${fullPath} 未设置，使用默认值: ${rule.default}`);
      } else {
        errors.push(`${fullPath} 是必填项`);
      }
      continue;
    }
    
    // 如果值未设置且有默认值，使用默认值
    if (value === undefined && rule.default !== undefined) {
      config[key] = rule.default;
      continue;
    }
    
    // 如果值未设置，跳过验证
    if (value === undefined) {
      continue;
    }
    
    // 类型检查
    if (rule.type === 'number' && typeof value !== 'number') {
      // 尝试转换
      const num = Number(value);
      if (!isNaN(num)) {
        config[key] = num;
      } else {
        errors.push(`${fullPath} 必须是数字，当前值: ${value}`);
      }
    }
    
    if (rule.type === 'string' && typeof value !== 'string') {
      errors.push(`${fullPath} 必须是字符串`);
    }
    
    if (rule.type === 'boolean' && typeof value !== 'boolean') {
      // 尝试转换
      if (value === 'true' || value === '1') {
        config[key] = true;
      } else if (value === 'false' || value === '0') {
        config[key] = false;
      } else {
        errors.push(`${fullPath} 必须是布尔值`);
      }
    }
    
    // 范围检查
    const actualValue = config[key];
    if (rule.type === 'number') {
      if (rule.min !== undefined && actualValue < rule.min) {
        errors.push(`${fullPath} 不能小于 ${rule.min}，当前值: ${actualValue}`);
      }
      if (rule.max !== undefined && actualValue > rule.max) {
        errors.push(`${fullPath} 不能大于 ${rule.max}，当前值: ${actualValue}`);
      }
    }
    
    // 嵌套验证
    if (rule.type === 'object' && typeof actualValue === 'object') {
      const nestedResult = validateConfig(actualValue, rule.properties || {}, fullPath);
      errors.push(...nestedResult.errors);
      warnings.push(...nestedResult.warnings);
    }
  }
  
  return { errors, warnings };
}

/**
 * 加载配置文件
 */
export async function loadConfig() {
  // 查找主配置文件
  const configPaths = [
    join(process.cwd(), 'config', 'config.yaml'),
    join(process.cwd(), 'config.yaml'),
    join(__dirname, '../../config/config.yaml'),
  ];
  
  let configPath = null;
  for (const path of configPaths) {
    if (existsSync(path)) {
      configPath = path;
      break;
    }
  }
  
  if (!configPath) {
    throw new Error('配置文件未找到，请创建 config/config.yaml');
  }
  
  logger.info(`加载配置文件: ${configPath}`);
  
  try {
    // 读取并解析 YAML
    const content = readFileSync(configPath, 'utf-8');
    let config = parse(content);
    
    // 替换环境变量
    config = substituteEnvVars(config);
    
    // 验证配置
    const validation = validateConfig(config, validationRules);
    
    if (validation.errors.length > 0) {
      logger.error('配置验证失败:');
      validation.errors.forEach(err => logger.error(`  - ${err}`));
      throw new Error('配置验证失败');
    }
    
    if (validation.warnings.length > 0) {
      logger.warn('配置警告:');
      validation.warnings.forEach(warn => logger.warn(`  - ${warn}`));
    }
    
    // 添加运行时配置
    config.env = process.env.NODE_ENV || 'development';
    config.isProduction = config.env === 'production';
    config.isDevelopment = config.env === 'development';

    // 环境变量覆盖配置（优先级最高）
    if (process.env.PORT) {
      const portNum = parseInt(process.env.PORT, 10);
      if (!isNaN(portNum) && portNum >= 1024 && portNum <= 65535) {
        config.gateway.port = portNum;
        logger.info(`端口被环境变量覆盖: ${portNum}`);
      } else {
        logger.warn(`环境变量 PORT 无效: ${process.env.PORT}，使用配置值`);
      }
    }

    if (process.env.HOST) {
      config.gateway.host = process.env.HOST;
      logger.info(`主机被环境变量覆盖: ${process.env.HOST}`);
    }

    // 尝试加载多 Agent 配置
    const agentsConfig = await loadAgentsConfig();
    if (agentsConfig) {
      config.agents = agentsConfig;
    }

    logger.info('配置加载成功');

    return config;
    
  } catch (err) {
    logger.error('配置加载失败:', err.message);
    throw err;
  }
}

/**
 * 加载多 Agent 配置
 */
export async function loadAgentsConfig() {
  const agentsConfigPaths = [
    join(process.cwd(), 'config', 'agents.yaml'),
    join(process.cwd(), 'agents.yaml'),
    join(__dirname, '../../config/agents.yaml'),
  ];
  
  let configPath = null;
  for (const path of agentsConfigPaths) {
    if (existsSync(path)) {
      configPath = path;
      break;
    }
  }
  
  if (!configPath) {
    logger.debug('多 Agent 配置文件未找到，使用单 Agent 模式');
    return null;
  }
  
  logger.info(`加载多 Agent 配置: ${configPath}`);
  
  try {
    const content = readFileSync(configPath, 'utf-8');
    let config = parse(content);
    
    // 替换环境变量
    config = substituteEnvVars(config);
    
    // 验证必要的配置项
    if (!config.agents || Object.keys(config.agents).length === 0) {
      logger.warn('多 Agent 配置中没有定义任何 Agent');
      return null;
    }
    
    logger.info(`已加载 ${Object.keys(config.agents).length} 个 Agent 配置`);
    return config;
    
  } catch (err) {
    logger.warn('加载多 Agent 配置失败:', err.message);
    return null;
  }
}

/**
 * 创建配置快照（脱敏）
 */
export function createConfigSnapshot(config) {
  return maskSensitiveData(config);
}
