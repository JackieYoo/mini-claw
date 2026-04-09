/**
 * Logger - Structured logging with pino (with instance caching)
 */

import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';
const loggerCache = new Map();

export function createLogger(name) {
  if (loggerCache.has(name)) {
    return loggerCache.get(name);
  }

  const logger = pino({
    name,
    level: process.env.LOG_LEVEL || 'info',
    transport: isDev ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname'
      }
    } : undefined
  });

  loggerCache.set(name, logger);
  return logger;
}
