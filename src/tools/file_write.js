/**
 * File Write Tool - Write content to file (with security validation)
 */

import { writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { validateFilePath } from '../utils/validator.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('file');

export const fileWriteTool = {
  name: 'file_write',
  description: 'Write content to a file (creates directories if needed)',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The file path to write'
      },
      content: {
        type: 'string',
        description: 'The content to write'
      },
      encoding: {
        type: 'string',
        enum: ['utf-8', 'base64', 'hex'],
        description: 'File encoding (default: utf-8)'
      }
    },
    required: ['path', 'content']
  },
  
  async execute({ path, content, encoding = 'utf-8' }) {
    // 安全验证
    const validation = validateFilePath(path, 'write');
    if (!validation.valid) {
      logger.warn(`文件写入被拒绝: ${validation.error}`);
      return {
        success: false,
        error: validation.error
      };
    }

    // 内容大小限制
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (content.length > maxSize) {
      return {
        success: false,
        error: '内容过大，最大支持 10MB'
      };
    }

    try {
      logger.info(`写入文件: ${path}`);
      
      // 创建目录（如果不存在）
      const dir = dirname(path);
      await mkdir(dir, { recursive: true });
      
      await writeFile(path, content, encoding);
      
      return {
        success: true,
        bytesWritten: Buffer.byteLength(content, encoding)
      };
    } catch (err) {
      logger.error(`文件写入失败: ${err.message}`);
      return {
        success: false,
        error: err.message
      };
    }
  }
};
