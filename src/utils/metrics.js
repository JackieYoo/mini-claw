/**
 * Metrics Collection - Prometheus-style metrics
 * 
 * Features:
 * - Counter, Gauge, Histogram metrics
 * - Prometheus format export
 * - Real-time statistics
 */

import { createLogger } from './logger.js';

const logger = createLogger('metrics');

/**
 * Metrics Registry
 */
export class MetricsRegistry {
  constructor() {
    this.counters = new Map();
    this.gauges = new Map();
    this.histograms = new Map();
    this.startTime = Date.now();
  }
  
  /**
   * Increment counter
   */
  incrementCounter(name, value = 1, labels = {}) {
    const key = this.getLabelKey(name, labels);
    const current = this.counters.get(key) || { value: 0, labels };
    current.value += value;
    this.counters.set(key, current);
  }
  
  /**
   * Set gauge value
   */
  setGauge(name, value, labels = {}) {
    const key = this.getLabelKey(name, labels);
    this.gauges.set(key, { value, labels });
  }
  
  /**
   * Observe histogram value
   */
  observeHistogram(name, value, labels = {}) {
    const key = this.getLabelKey(name, labels);
    
    if (!this.histograms.has(key)) {
      this.histograms.set(key, {
        values: [],
        labels,
        buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300],
      });
    }
    
    const histogram = this.histograms.get(key);
    histogram.values.push(value);
    
    // Keep only last 1000 values
    if (histogram.values.length > 1000) {
      histogram.values = histogram.values.slice(-1000);
    }
  }
  
  /**
   * Get label key
   */
  getLabelKey(name, labels) {
    const labelStr = Object.entries(labels)
      .sort()
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return labelStr ? `${name}{${labelStr}}` : name;
  }
  
  /**
   * Get counter value
   */
  getCounter(name, labels = {}) {
    const key = this.getLabelKey(name, labels);
    return this.counters.get(key)?.value || 0;
  }
  
  /**
   * Get gauge value
   */
  getGauge(name, labels = {}) {
    const key = this.getLabelKey(name, labels);
    return this.gauges.get(key)?.value || 0;
  }
  
  /**
   * Get histogram statistics
   */
  getHistogramStats(name, labels = {}) {
    const key = this.getLabelKey(name, labels);
    const histogram = this.histograms.get(key);
    
    if (!histogram || histogram.values.length === 0) {
      return null;
    }
    
    const values = histogram.values;
    const sorted = [...values].sort((a, b) => a - b);
    
    return {
      count: values.length,
      sum: values.reduce((a, b) => a + b, 0),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: values.reduce((a, b) => a + b, 0) / values.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p90: sorted[Math.floor(sorted.length * 0.9)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }
  
  /**
   * Export Prometheus format
   */
  exportPrometheus() {
    let output = '';
    
    // Uptime
    output += `# HELP miniclaw_uptime_seconds Service uptime in seconds\n`;
    output += `# TYPE miniclaw_uptime_seconds gauge\n`;
    output += `miniclaw_uptime_seconds ${Math.floor((Date.now() - this.startTime) / 1000)}\n\n`;
    
    // Counters
    for (const [key, data] of this.counters) {
      const name = key.split('{')[0];
      output += `# HELP ${name} total\n`;
      output += `# TYPE ${name} counter\n`;
      output += `${key} ${data.value}\n`;
    }
    
    if (this.counters.size > 0) output += '\n';
    
    // Gauges
    for (const [key, data] of this.gauges) {
      const name = key.split('{')[0];
      output += `# HELP ${name} current value\n`;
      output += `# TYPE ${name} gauge\n`;
      output += `${key} ${data.value}\n`;
    }
    
    if (this.gauges.size > 0) output += '\n';
    
    // Histograms
    for (const [key, histogram] of this.histograms) {
      const name = key.split('{')[0];
      const stats = this.getHistogramStats(name, histogram.labels);
      
      if (stats) {
        output += `# HELP ${name} observations\n`;
        output += `# TYPE ${name} histogram\n`;
        output += `${key}_count ${stats.count}\n`;
        output += `${key}_sum ${stats.sum.toFixed(2)}\n`;
        output += `${key}_min ${stats.min.toFixed(2)}\n`;
        output += `${key}_max ${stats.max.toFixed(2)}\n`;
        output += `${key}_mean ${stats.mean.toFixed(2)}\n`;
        output += `${key}_p50 ${stats.p50.toFixed(2)}\n`;
        output += `${key}_p90 ${stats.p90.toFixed(2)}\n`;
        output += `${key}_p95 ${stats.p95.toFixed(2)}\n`;
        output += `${key}_p99 ${stats.p99.toFixed(2)}\n`;
      }
    }
    
    return output;
  }
  
  /**
   * Export JSON format
   */
  exportJSON() {
    return {
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      counters: Object.fromEntries(
        Array.from(this.counters.entries()).map(([key, data]) => [
          key,
          data.value
        ])
      ),
      gauges: Object.fromEntries(this.gauges),
      histograms: Object.fromEntries(
        Array.from(this.histograms.entries()).map(([key, histogram]) => [
          key,
          this.getHistogramStats(key.split('{')[0], histogram.labels)
        ])
      ),
    };
  }
  
  /**
   * Reset all metrics
   */
  reset() {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.startTime = Date.now();
  }
}

/**
 * Global metrics instance
 */
export const metrics = new MetricsRegistry();

/**
 * Metrics middleware for Fastify
 */
export function createMetricsMiddleware(metricsRegistry = metrics) {
  return async (request, reply) => {
    const start = Date.now();
    
    // Increment request counter
    metricsRegistry.incrementCounter('http_requests_total', 1, {
      method: request.method,
      path: request.routeOptions?.url || request.url,
    });
    
    // Add hook to record response time
    reply.addHook('onSend', async () => {
      const duration = Date.now() - start;
      
      // Record response time
      metricsRegistry.observeHistogram('http_request_duration_ms', duration, {
        method: request.method,
        path: request.routeOptions?.url || request.url,
        status: reply.statusCode,
      });
      
      // Increment response counter
      metricsRegistry.incrementCounter('http_responses_total', 1, {
        method: request.method,
        status: reply.statusCode,
      });
    });
  };
}

/**
 * Common metrics helpers
 */
export const metricHelpers = {
  recordToolExecution(toolName, duration, success) {
    metrics.incrementCounter('tool_executions_total', 1, {
      tool: toolName,
      success: success.toString(),
    });
    
    metrics.observeHistogram('tool_execution_duration_ms', duration, {
      tool: toolName,
    });
  },
  
  recordModelCall(model, tokens, duration) {
    metrics.incrementCounter('model_calls_total', 1, {
      model: model,
    });
    
    metrics.incrementCounter('model_tokens_total', tokens, {
      model: model,
    });
    
    metrics.observeHistogram('model_call_duration_ms', duration, {
      model: model,
    });
  },
  
  recordMessage(channel, chatType) {
    metrics.incrementCounter('messages_total', 1, {
      channel: channel,
      chat_type: chatType,
    });
  },
  
  recordReaction(channel, emojiType, success) {
    metrics.incrementCounter('reactions_total', 1, {
      channel: channel,
      emoji: emojiType,
      success: success.toString(),
    });
  },
  
  updateActiveSessions(count) {
    metrics.setGauge('active_sessions', count);
  },
  
  updateMemoryUsage() {
    const used = process.memoryUsage();
    metrics.setGauge('memory_heap_used_bytes', used.heapUsed);
    metrics.setGauge('memory_heap_total_bytes', used.heapTotal);
    metrics.setGauge('memory_rss_bytes', used.rss);
  },
};
