/**
 * Logger with Rotation - Enhanced logging with file rotation
 * 
 * Features:
 * - Daily log rotation
 * - Size-based rotation
 * - Automatic cleanup of old logs
 * - Structured JSON logging
 */

import pino from 'pino';
import { mkdirSync, existsSync, statSync, renameSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { createLogger } from './logger.js';

const logger = createLogger('logger-rotate');

/**
 * 创建带轮转的日志写入流
 */
class RotatingFileStream {
  constructor(options = {}) {
    this.logDir = options.logDir || 'logs';
    this.baseName = options.baseName || 'mini-claw';
    this.maxSize = options.maxSize || 10 * 1024 * 1024; // 10MB
    this.maxFiles = options.maxFiles || 7; // 保留7天
    this.currentDate = this.getCurrentDate();
    this.currentStream = null;
    this.currentFile = null;
    this.currentSize = 0;
    
    // 确保日志目录存在
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }
    
    // 初始化日志文件
    this.initStream();
    
    // 定期清理旧日志
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldLogs();
    }, 24 * 60 * 60 * 1000); // 每天清理一次
  }
  
  getCurrentDate() {
    return new Date().toISOString().split('T')[0];
  }
  
  getLogFileName(date = null) {
    const dateStr = date || this.currentDate;
    return join(this.logDir, `${this.baseName}-${dateStr}.log`);
  }
  
  initStream() {
    const { createWriteStream } = require('fs');
    this.currentFile = this.getLogFileName();
    
    // 如果文件已存在，获取当前大小
    if (existsSync(this.currentFile)) {
      const stats = statSync(this.currentFile);
      this.currentSize = stats.size;
    } else {
      this.currentSize = 0;
    }
    
    this.currentStream = createWriteStream(this.currentFile, { flags: 'a' });
  }
  
  write(data) {
    // 检查是否需要轮转（日期变化或文件大小超限）
    const newDate = this.getCurrentDate();
    if (newDate !== this.currentDate || this.currentSize > this.maxSize) {
      this.rotate(newDate);
    }
    
    // 写入数据
    this.currentStream.write(data);
    this.currentSize += data.length;
  }
  
  rotate(newDate) {
    // 关闭当前流
    if (this.currentStream) {
      this.currentStream.end();
    }
    
    // 更新日期
    this.currentDate = newDate;
    
    // 创建新的日志文件
    this.initStream();
    
    logger.info(`日志轮转: ${this.currentFile}`);
    
    // 清理旧日志
    this.cleanupOldLogs();
  }
  
  cleanupOldLogs() {
    try {
      const files = readdirSync(this.logDir)
        .filter(f => f.startsWith(this.baseName) && f.endsWith('.log'))
        .sort()
        .reverse();
      
      // 保留最新的 maxFiles 个文件
      const filesToDelete = files.slice(this.maxFiles);
      
      for (const file of filesToDelete) {
        const filePath = join(this.logDir, file);
        unlinkSync(filePath);
        logger.info(`删除旧日志: ${file}`);
      }
    } catch (err) {
      logger.error('清理旧日志失败:', err.message);
    }
  }
  
  end() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.currentStream) {
      this.currentStream.end();
    }
  }
}

/**
 * 创建带轮转的 Logger
 */
export function createRotatingLogger(name, options = {}) {
  const isDev = process.env.NODE_ENV !== 'production';
  
  const streams = [];
  
  // 控制台输出
  if (isDev) {
    streams.push({
      level: options.level || 'info',
      stream: pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname'
        }
      })
    });
  }
  
  // 文件输出（带轮转）
  if (options.file !== false) {
    const rotatingStream = new RotatingFileStream({
      logDir: options.logDir || 'logs',
      baseName: name,
      maxSize: options.maxSize || 10 * 1024 * 1024,
      maxFiles: options.maxFiles || 7,
    });
    
    streams.push({
      level: options.level || 'info',
      stream: rotatingStream
    });
  }
  
  // 创建多流 logger
  return pino({
    name,
    level: options.level || process.env.LOG_LEVEL || 'info',
  }, pino.multistream(streams));
}

/**
 * 创建请求日志中间件
 */
export function createRequestLogger(logger) {
  return async (request, reply) => {
    const start = Date.now();
    
    request.log = logger.child({
      req: {
        method: request.method,
        url: request.url,
        remoteAddress: request.ip,
      }
    });
    
    request.log.info('请求开始');
    
    reply.addHook('onSend', async () => {
      const duration = Date.now() - start;
      request.log.info({
        res: {
          statusCode: reply.statusCode,
        },
        responseTime: duration,
      }, '请求完成');
    });
  };
}

export { RotatingFileStream };
