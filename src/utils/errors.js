/**
 * Error Classes - Standardized error handling
 * 
 * Error hierarchy:
 * - AppError (base)
 *   - ValidationError
 *   - AuthenticationError
 *   - AuthorizationError
 *   - NotFoundError
 *   - RateLimitError
 *   - ToolExecutionError
 *   - SessionError
 *   - ChannelError
 *   - ModelError
 */

import { createLogger } from './logger.js';

const logger = createLogger('errors');

/**
 * Base Application Error
 */
export class AppError extends Error {
  constructor(message, code = 'APP_ERROR', statusCode = 500, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();
    
    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
    
    // Log error
    logger.error({
      error: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
    });
  }
  
  toJSON() {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp,
    };
  }
}

/**
 * Validation Error (400)
 */
export class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

/**
 * Authentication Error (401)
 */
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 'AUTH_ERROR', 401);
  }
}

/**
 * Authorization Error (403)
 */
export class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 'FORBIDDEN', 403);
  }
}

/**
 * Not Found Error (404)
 */
export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 'NOT_FOUND', 404);
  }
}

/**
 * Rate Limit Error (429)
 */
export class RateLimitError extends AppError {
  constructor(retryAfter = 60) {
    super('Too many requests', 'RATE_LIMIT', 429, { retryAfter });
  }
}

/**
 * Tool Execution Error (500)
 */
export class ToolExecutionError extends AppError {
  constructor(toolName, message, details = null) {
    super(
      `Tool '${toolName}' execution failed: ${message}`,
      'TOOL_ERROR',
      500,
      { toolName, ...details }
    );
  }
}

/**
 * Session Error (400)
 */
export class SessionError extends AppError {
  constructor(message, sessionId = null) {
    super(message, 'SESSION_ERROR', 400, { sessionId });
  }
}

/**
 * Channel Error (500)
 */
export class ChannelError extends AppError {
  constructor(channelName, message, details = null) {
    super(
      `Channel '${channelName}' error: ${message}`,
      'CHANNEL_ERROR',
      500,
      { channelName, ...details }
    );
  }
}

/**
 * Model/API Error (500)
 */
export class ModelError extends AppError {
  constructor(message, provider = null, details = null) {
    super(message, 'MODEL_ERROR', 500, { provider, ...details });
  }
}

/**
 * Configuration Error (500)
 */
export class ConfigError extends AppError {
  constructor(message, details = null) {
    super(message, 'CONFIG_ERROR', 500, details);
  }
}

/**
 * Timeout Error (408)
 */
export class TimeoutError extends AppError {
  constructor(operation = 'Operation', timeout = null) {
    super(
      `${operation} timed out`,
      'TIMEOUT',
      408,
      { timeout }
    );
  }
}

/**
 * Error Handler Middleware
 */
export function createErrorHandler() {
  return async (error, request, reply) => {
    // 如果是 AppError，直接返回
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        success: false,
        error: error.toJSON(),
      });
    }
    
    // Fastify 验证错误
    if (error.validation) {
      const validationError = new ValidationError(
        'Validation failed',
        error.validation
      );
      return reply.status(400).send({
        success: false,
        error: validationError.toJSON(),
      });
    }
    
    // 其他错误
    logger.error('Unhandled error:', error);
    
    return reply.status(500).send({
      success: false,
      error: {
        name: 'InternalServerError',
        code: 'INTERNAL_ERROR',
        message: process.env.NODE_ENV === 'production' 
          ? 'An internal error occurred' 
          : error.message,
        statusCode: 500,
      },
    });
  };
}

/**
 * Async Error Wrapper
 * 用于包装异步函数，自动捕获错误
 */
export function asyncHandler(fn) {
  return async (request, reply) => {
    try {
      return await fn(request, reply);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      
      // 将未知错误转换为 AppError
      throw new AppError(
        error.message,
        'ASYNC_ERROR',
        500,
        { originalError: error.stack }
      );
    }
  };
}

/**
 * Try-Catch Helper
 */
export async function tryCatch(fn, errorHandler = null) {
  try {
    return { success: true, data: await fn() };
  } catch (error) {
    if (errorHandler) {
      return errorHandler(error);
    }
    
    logger.error('Try-catch error:', error);
    return { 
      success: false, 
      error: error instanceof AppError ? error : new AppError(error.message) 
    };
  }
}
