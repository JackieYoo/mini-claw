/**
 * Memory Tool - 记忆管理
 * 学习 OpenClaw 的记忆系统设计
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('memory');

export function createMemoryTool(memoryDir = './memory') {
  // 确保记忆目录存在
  if (!existsSync(memoryDir)) {
    mkdirSync(memoryDir, { recursive: true });
  }
  
  return {
    name: 'memory',
    description: '管理长期记忆，可以保存、读取、搜索记忆内容',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['save', 'read', 'search', 'list', 'delete'],
          description: '操作类型：save(保存), read(读取), search(搜索), list(列表), delete(删除)'
        },
        key: {
          type: 'string',
          description: '记忆的键名（用于 save/read/delete）'
        },
        content: {
          type: 'string',
          description: '要保存的内容（用于 save）'
        },
        query: {
          type: 'string',
          description: '搜索关键词（用于 search）'
        }
      },
      required: ['action']
    },
    
    async execute({ action, key, content, query }) {
      try {
        switch (action) {
          case 'save': {
            if (!key || !content) {
              return { success: false, error: 'key 和 content 必填' };
            }
            
            const file = join(memoryDir, `${key}.md`);
            const timestamp = new Date().toISOString();
            const entry = `# ${key}\n\n保存时间: ${timestamp}\n\n${content}\n\n---\n\n`;
            
            if (existsSync(file)) {
              appendFileSync(file, entry);
            } else {
              writeFileSync(file, entry);
            }
            
            logger.info(`保存记忆: ${key}`);
            return { success: true, message: `记忆已保存: ${key}` };
          }
          
          case 'read': {
            if (!key) {
              return { success: false, error: 'key 必填' };
            }
            
            const file = join(memoryDir, `${key}.md`);
            if (!existsSync(file)) {
              return { success: false, error: `记忆不存在: ${key}` };
            }
            
            const data = readFileSync(file, 'utf-8');
            return { success: true, content: data };
          }
          
          case 'search': {
            if (!query) {
              return { success: false, error: 'query 必填' };
            }
            
            const { readdirSync } = await import('fs');
            const files = readdirSync(memoryDir).filter(f => f.endsWith('.md'));
            const results = [];
            
            for (const file of files) {
              const data = readFileSync(join(memoryDir, file), 'utf-8');
              if (data.toLowerCase().includes(query.toLowerCase())) {
                results.push({
                  key: file.replace('.md', ''),
                  snippet: data.substring(0, 200) + '...'
                });
              }
            }
            
            return { success: true, results, count: results.length };
          }
          
          case 'list': {
            const { readdirSync } = await import('fs');
            const files = readdirSync(memoryDir).filter(f => f.endsWith('.md'));
            const list = files.map(f => f.replace('.md', ''));
            
            return { success: true, memories: list, count: list.length };
          }
          
          case 'delete': {
            if (!key) {
              return { success: false, error: 'key 必填' };
            }
            
            const { unlinkSync } = await import('fs');
            const file = join(memoryDir, `${key}.md`);
            
            if (!existsSync(file)) {
              return { success: false, error: `记忆不存在: ${key}` };
            }
            
            unlinkSync(file);
            logger.info(`删除记忆: ${key}`);
            return { success: true, message: `记忆已删除: ${key}` };
          }
          
          default:
            return { success: false, error: `未知操作: ${action}` };
        }
      } catch (err) {
        logger.error('Memory 操作失败:', err);
        return { success: false, error: err.message };
      }
    }
  };
}
