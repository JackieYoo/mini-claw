/**
 * File Read Tool - Read file contents (with security validation)
 */

import { readFile } from 'fs/promises';
import { validateFilePath } from '../utils/validator.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('file');

export const fileReadTool = {
  name: 'file_read',
  description: 'Read the contents of a file',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The file path to read'
      },
      encoding: {
        type: 'string',
        enum: ['utf-8', 'base64', 'hex'],
        description: 'File encoding (default: utf-8)'
      }
    },
    required: ['path']
  },
  
  async execute({ path, encoding = 'utf-8' }) {
    // 安全验证
    const validation = validateFilePath(path, 'read');
    if (!validation.valid) {
      logger.warn(`文件读取被拒绝: ${validation.error}`);
      return {
        success: false,
        error: validation.error
      };
    }

    try {
      logger.info(`读取文件: ${path}`);
      
      const content = await readFile(path, encoding);
      
      // 限制返回内容大小
      const maxSize = 1024 * 1024; // 1MB
      if (typeof content === 'string' && content.length > maxSize) {
        return {
          success: true,
          content: content.substring(0, maxSize),
          truncated: true,
          originalLength: content.length
        };
      }
      
      return {
        success: true,
        content,
        truncated: false,
        originalLength: typeof content === 'string' ? content.length : Buffer.byteLength(content)
      };
    } catch (err) {
      logger.error(`文件读取失败: ${err.message}`);
      return {
        success: false,
        error: err.message
      };
    }
  }
};
