/**
 * Health Check - Enhanced health monitoring
 * 
 * Features:
 * - Multiple health checks
 * - Detailed status reporting
 * - Dependency health
 * - Performance metrics
 */

import { createLogger } from './logger.js';

const logger = createLogger('health');

/**
 * Health Check Manager
 */
export class HealthCheckManager {
  constructor(deps = {}) {
    this.deps = deps;
    this.checks = new Map();
    this.lastCheck = null;
    this.checkInterval = null;
    
    // Register default checks
    this.registerDefaultChecks();
  }
  
  /**
   * Register default health checks
   */
  registerDefaultChecks() {
    this.register('memory', this.checkMemory.bind(this));
    this.register('sessions', this.checkSessions.bind(this));
    this.register('tools', this.checkTools.bind(this));
    this.register('channels', this.checkChannels.bind(this));
  }
  
  /**
   * Register a health check
   */
  register(name, checkFn, options = {}) {
    this.checks.set(name, {
      name,
      check: checkFn,
      timeout: options.timeout || 5000,
      critical: options.critical !== false,
    });
  }
  
  /**
   * Run a single health check
   */
  async runCheck(name) {
    const check = this.checks.get(name);
    if (!check) {
      return { name, status: 'unknown', error: 'Check not found' };
    }
    
    const start = Date.now();
    
    try {
      // Run with timeout
      const result = await Promise.race([
        check.check(),
        this.timeout(check.timeout),
      ]);
      
      const duration = Date.now() - start;
      
      return {
        name,
        status: 'ok',
        duration,
        ...result,
      };
    } catch (error) {
      const duration = Date.now() - start;
      
      return {
        name,
        status: 'error',
        duration,
        error: error.message,
        critical: check.critical,
      };
    }
  }
  
  /**
   * Run all health checks
   */
  async runAll() {
    const start = Date.now();
    const results = {};
    
    // Run all checks in parallel
    const checkPromises = Array.from(this.checks.keys()).map(name => 
      this.runCheck(name)
    );
    
    const checkResults = await Promise.all(checkPromises);
    
    for (const result of checkResults) {
      results[result.name] = result;
    }
    
    // Determine overall status
    let status = 'ok';
    const errors = [];
    
    for (const [name, result] of Object.entries(results)) {
      if (result.status !== 'ok') {
        if (result.critical) {
          status = 'unhealthy';
        } else if (status === 'ok') {
          status = 'degraded';
        }
        errors.push({ name, error: result.error });
      }
    }
    
    this.lastCheck = {
      status,
      timestamp: new Date().toISOString(),
      duration: Date.now() - start,
      checks: results,
      errors,
    };
    
    return this.lastCheck;
  }
  
  /**
   * Quick health check (liveness probe)
   */
  async liveness() {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    };
  }
  
  /**
   * Readiness check (ready to serve traffic)
   */
  async readiness() {
    const health = await this.runAll();
    
    return {
      status: health.status === 'unhealthy' ? 'not_ready' : 'ready',
      timestamp: health.timestamp,
      uptime: Math.floor(process.uptime()),
    };
  }
  
  /**
   * Check memory usage
   */
  checkMemory() {
    const used = process.memoryUsage();
    const heapUsedMB = used.heapUsed / 1024 / 1024;
    const heapTotalMB = used.heapTotal / 1024 / 1024;
    const rssMB = used.rss / 1024 / 1024;
    
    // Warning if heap usage > 80%
    const heapUsagePercent = (heapUsedMB / heapTotalMB) * 100;
    const status = heapUsagePercent > 90 ? 'warning' : 'ok';
    
    return {
      status,
      heapUsedMB: Math.round(heapUsedMB),
      heapTotalMB: Math.round(heapTotalMB),
      heapUsagePercent: Math.round(heapUsagePercent),
      rssMB: Math.round(rssMB),
      externalMB: Math.round(used.external / 1024 / 1024),
    };
  }
  
  /**
   * Check sessions
   */
  checkSessions() {
    const sessionManager = this.deps.agent?.sessionManager;
    
    if (!sessionManager) {
      return { status: 'ok', message: 'Session manager not available' };
    }
    
    const stats = sessionManager.getStats();
    const usagePercent = (stats.totalSessions / stats.maxSessions) * 100;
    
    return {
      status: usagePercent > 90 ? 'warning' : 'ok',
      total: stats.totalSessions,
      max: stats.maxSessions,
      usagePercent: Math.round(usagePercent),
    };
  }
  
  /**
   * Check tools
   */
  checkTools() {
    const toolRegistry = this.deps.toolRegistry;
    
    if (!toolRegistry) {
      return { status: 'ok', message: 'Tool registry not available' };
    }
    
    const tools = toolRegistry.getTools();
    
    return {
      status: 'ok',
      count: tools.length,
      names: tools.map(t => t.name),
    };
  }
  
  /**
   * Check channels
   */
  async checkChannels() {
    const channelManager = this.deps.channelManager;
    
    if (!channelManager) {
      return { status: 'ok', message: 'Channel manager not available' };
    }
    
    const channels = {};
    
    for (const [name, handler] of channelManager.handlers || []) {
      channels[name] = {
        connected: handler.isConnected?.() || false,
      };
    }
    
    return {
      status: 'ok',
      channels,
    };
  }
  
  /**
   * Timeout helper
   */
  timeout(ms) {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Health check timeout')), ms);
    });
  }
  
  /**
   * Start periodic health checks
   */
  startPeriodicCheck(interval = 60000) {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    
    this.checkInterval = setInterval(async () => {
      try {
        const health = await this.runAll();
        if (health.status !== 'ok') {
          logger.warn('Health check issues:', health.errors);
        }
      } catch (err) {
        logger.error('Health check failed:', err);
      }
    }, interval);
  }
  
  /**
   * Stop periodic checks
   */
  stopPeriodicCheck() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

/**
 * Create health check middleware
 */
export function createHealthMiddleware(healthManager) {
  return {
    // Liveness probe - is the service running?
    async liveness(request, reply) {
      const health = await healthManager.liveness();
      return reply.send(health);
    },
    
    // Readiness probe - is the service ready to serve traffic?
    async readiness(request, reply) {
      const health = await healthManager.readiness();
      const statusCode = health.status === 'ready' ? 200 : 503;
      return reply.status(statusCode).send(health);
    },
    
    // Full health check
    async health(request, reply) {
      const health = await healthManager.runAll();
      const statusCode = health.status === 'unhealthy' ? 503 : 200;
      return reply.status(statusCode).send(health);
    },
  };
}

/**
 * Create health check manager
 */
export function createHealthManager(deps) {
  return new HealthCheckManager(deps);
}
