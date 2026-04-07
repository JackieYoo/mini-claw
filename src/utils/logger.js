/**
 * Logger - Structured logging with pino
 */

import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export function createLogger(name) {
  return pino({
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
}
