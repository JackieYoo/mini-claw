/**
 * Skills Loader - 加载 AgentSkills 格式的技能
 * 学习 OpenClaw 的技能加载机制
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createLogger } from './logger.js';

const logger = createLogger('skills');

/**
 * 解析 SKILL.md 文件
 * 支持 AgentSkills 格式的 YAML frontmatter
 */
export function parseSkillFile(content, filePath) {
  // 匹配 YAML frontmatter
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);
  
  if (!match) {
    return null;
  }
  
  const frontmatterStr = match[1];
  const instructions = match[2].trim();
  
  // 解析 YAML frontmatter (简单解析，不支持复杂 YAML)
  const frontmatter = {};
  const lines = frontmatterStr.split('\n');
  let currentKey = null;
  let currentObj = null;
  
  for (const line of lines) {
    const trimmed = line.trimEnd();
    
    // 跳过空行
    if (!trimmed) continue;
    
    // 检测缩进
    const indent = line.search(/\S/);
    const isIndented = indent > 0;
    
    if (!isIndented) {
      // 顶级 key: value
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0) {
        const key = trimmed.substring(0, colonIndex).trim();
        let value = trimmed.substring(colonIndex + 1).trim();
        
        // 处理 JSON 对象值 (如 metadata)
        if (value.startsWith('{')) {
          try {
            value = JSON.parse(value);
          } catch (e) {
            // 保持字符串
          }
        } else if (value === 'true') {
          value = true;
        } else if (value === 'false') {
          value = false;
        }
        
        frontmatter[key] = value;
        currentKey = key;
        currentObj = null;
      }
    }
  }
  
  return {
    ...frontmatter,
    instructions,
    filePath,
  };
}

/**
 * 技能加载器
 */
export function createSkillsLoader(skillsDir) {
  const skills = new Map();
  
  /**
   * 加载所有技能
   */
  function loadAll() {
    if (!existsSync(skillsDir)) {
      logger.warn(`技能目录不存在: ${skillsDir}`);
      return [];
    }
    
    const entries = readdirSync(skillsDir, { withFileTypes: true });
    let loaded = 0;
    
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      
      const skillPath = join(skillsDir, entry.name);
      const skillFile = join(skillPath, 'SKILL.md');
      
      if (!existsSync(skillFile)) {
        logger.debug(`跳过无 SKILL.md 的目录: ${entry.name}`);
        continue;
      }
      
      try {
        const content = readFileSync(skillFile, 'utf-8');
        const skill = parseSkillFile(content, skillFile);
        
        if (skill && skill.name) {
          // 检查是否满足要求
          if (checkRequirements(skill)) {
            skills.set(skill.name, {
              ...skill,
              path: skillPath,
            });
            loaded++;
            logger.debug(`加载技能: ${skill.name}`);
          } else {
            logger.debug(`技能不满足要求，跳过: ${skill.name}`);
          }
        }
      } catch (err) {
        logger.error(`加载技能失败: ${entry.name}`, err.message);
      }
    }
    
    logger.info(`已加载 ${loaded} 个技能`);
    return Array.from(skills.values());
  }
  
  /**
   * 检查技能要求
   */
  function checkRequirements(skill) {
    const metadata = skill.metadata?.openclaw || {};
    const requires = metadata.requires || {};
    
    // 检查环境变量
    if (requires.env) {
      for (const envVar of requires.env) {
        if (!process.env[envVar]) {
          logger.debug(`技能 ${skill.name} 缺少环境变量: ${envVar}`);
          return false;
        }
      }
    }
    
    // 检查配置
    if (requires.config) {
      // 这里可以检查全局配置
      // 暂时跳过
    }
    
    return true;
  }
  
  /**
   * 获取技能
   */
  function get(name) {
    return skills.get(name);
  }
  
  /**
   * 获取所有技能
   */
  function getAll() {
    return Array.from(skills.values());
  }
  
  /**
   * 获取技能描述（用于注入到系统提示）
   */
  function getSkillsPrompt() {
    const allSkills = getAll();
    if (allSkills.length === 0) {
      return '';
    }
    
    const skillsList = allSkills.map(s => 
      `- **${s.name}**: ${s.description}`
    ).join('\n');
    
    return `
## 可用技能

${skillsList}

使用技能时，模型会自动调用相应的工具函数。
`;
  }
  
  return {
    loadAll,
    get,
    getAll,
    getSkillsPrompt,
  };
}
