# MiniClaw 优化方案

## 📊 当前状态

- **代码量**: ~4000 行
- **架构**: Gateway + Agent + Channels + Tools + Skills
- **已完成**: 测试、PM2、安全增强、飞书表情

## 🎯 优化方向

### 1️⃣ 代码质量优化 (优先级: 高)

#### 1.1 TypeScript 迁移
**收益**: 类型安全、更好的 IDE 支持、减少运行时错误

**步骤**:
```bash
# 安装依赖
npm install -D typescript @types/node tsx

# 添加 tsconfig.json
# 逐步迁移 .js -> .ts
```

#### 1.2 错误处理标准化
**当前问题**: 错误处理分散，缺少统一错误类型

**解决方案**:
```javascript
// src/utils/errors.js (已存在，需增强)
class AppError extends Error {
  constructor(message, code, statusCode = 500) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

class ToolExecutionError extends AppError {
  constructor(toolName, message) {
    super(`Tool ${toolName} failed: ${message}`, 'TOOL_ERROR', 500);
  }
}

class SessionError extends AppError {
  constructor(message) {
    super(message, 'SESSION_ERROR', 400);
  }
}
```

#### 1.3 日志轮转优化
**当前问题**: 日志文件可能无限增长

**解决方案**:
```javascript
// src/utils/logger-rotate.js
import pino from 'pino';
import { createWriteStream } from 'pino-multi-stream';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

export function createRotatingLogger(name, options = {}) {
  const logDir = options.logDir || 'logs';
  
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
  
  const streams = [
    // 控制台输出
    { level: 'info', stream: process.stdout },
    // 文件输出（按日期）
    {
      level: 'info',
      stream: createWriteStream({
        file: join(logDir, `${name}-%DATE%.log`),
        size: '10m',
        keep: 7,
      })
    }
  ];
  
  return pino({ name }, pino.multistream(streams));
}
```

---

### 2️⃣ 性能优化 (优先级: 高)

#### 2.1 会话缓存优化
**当前问题**: 会话数据全在内存，重启丢失

**优化方案**:
```javascript
// 使用 Redis 或文件缓存
import { createClient } from 'redis';

class SessionCache {
  constructor(redisClient) {
    this.redis = redisClient;
    this.local = new Map(); // 本地缓存
  }
  
  async get(key) {
    // 先查本地缓存
    if (this.local.has(key)) {
      return this.local.get(key);
    }
    
    // 再查 Redis
    const data = await this.redis.get(`session:${key}`);
    if (data) {
      const session = JSON.parse(data);
      this.local.set(key, session);
      return session;
    }
    
    return null;
  }
  
  async set(key, session) {
    this.local.set(key, session);
    await this.redis.setex(
      `session:${key}`,
      86400, // 1天过期
      JSON.stringify(session)
    );
  }
}
```

#### 2.2 工具调用缓存
**收益**: 减少重复计算，提升响应速度

```javascript
// src/utils/cache.js
export class ToolCache {
  constructor(ttl = 300000) { // 5分钟
    this.cache = new Map();
    this.ttl = ttl;
  }
  
  generateKey(toolName, args) {
    return `${toolName}:${JSON.stringify(args)}`;
  }
  
  get(toolName, args) {
    const key = this.generateKey(toolName, args);
    const item = this.cache.get(key);
    
    if (item && Date.now() - item.timestamp < this.ttl) {
      return item.data;
    }
    
    return null;
  }
  
  set(toolName, args, data) {
    const key = this.generateKey(toolName, args);
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }
  
  clear() {
    this.cache.clear();
  }
}
```

#### 2.3 并发请求优化
**当前问题**: 工具调用串行执行

**优化方案**:
```javascript
// 在 agent/index.js 中
// 并行执行多个工具调用
if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 1) {
  const results = await Promise.all(
    assistantMessage.tool_calls.map(async (toolCall) => {
      // 并行执行
      return await executeToolCall(toolCall);
    })
  );
}
```

---

### 3️⃣ 功能增强 (优先级: 中)

#### 3.1 健康检查增强
**当前**: 只有基础 /health 端点

**增强方案**:
```javascript
// src/utils/health.js (已存在，需增强)
export function createHealthCheck(deps) {
  const { agent, channelManager, toolRegistry } = deps;
  
  return {
    async check() {
      const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        checks: {
          memory: this.checkMemory(),
          sessions: this.checkSessions(),
          channels: await this.checkChannels(),
          tools: this.checkTools(),
        }
      };
      
      // 如果任何检查失败，状态为 degraded
      const failedChecks = Object.values(health.checks)
        .filter(c => c.status !== 'ok');
      
      if (failedChecks.length > 0) {
        health.status = 'degraded';
      }
      
      return health;
    },
    
    checkMemory() {
      const used = process.memoryUsage();
      const heapUsedMB = used.heapUsed / 1024 / 1024;
      
      return {
        status: heapUsedMB < 500 ? 'ok' : 'warning',
        heapUsedMB: Math.round(heapUsedMB),
        heapTotalMB: Math.round(used.heapTotal / 1024 / 1024),
      };
    },
    
    checkSessions() {
      const stats = agent.sessionManager.getStats();
      return {
        status: 'ok',
        total: stats.totalSessions,
        max: stats.maxSessions,
      };
    },
    
    async checkChannels() {
      const channels = {};
      for (const [name, handler] of channelManager.handlers) {
        channels[name] = {
          connected: handler.isConnected?.() || false
        };
      }
      return { status: 'ok', channels };
    },
    
    checkTools() {
      return {
        status: 'ok',
        count: toolRegistry.getTools().length
      };
    }
  };
}
```

#### 3.2 指标收集
**新增功能**: Prometheus 格式的指标

```javascript
// src/utils/metrics.js
export class Metrics {
  constructor() {
    this.counters = new Map();
    this.gauges = new Map();
    this.histograms = new Map();
  }
  
  incrementCounter(name, labels = {}) {
    const key = this.getKey(name, labels);
    this.counters.set(key, (this.counters.get(key) || 0) + 1);
  }
  
  setGauge(name, value, labels = {}) {
    const key = this.getKey(name, labels);
    this.gauges.set(key, value);
  }
  
  observeHistogram(name, value, labels = {}) {
    const key = this.getKey(name, labels);
    if (!this.histograms.has(key)) {
      this.histograms.set(key, []);
    }
    this.histograms.get(key).push(value);
  }
  
  getKey(name, labels) {
    const labelStr = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return labelStr ? `${name}{${labelStr}}` : name;
  }
  
  // Prometheus 格式输出
  export() {
    let output = '';
    
    for (const [key, value] of this.counters) {
      output += `# TYPE ${key.split('{')[0]} counter\n`;
      output += `${key} ${value}\n`;
    }
    
    for (const [key, value] of this.gauges) {
      output += `# TYPE ${key.split('{')[0]} gauge\n`;
      output += `${key} ${value}\n`;
    }
    
    return output;
  }
}

// 在 Gateway 中添加 /metrics 端点
fastify.get('/metrics', async () => {
  return metrics.export();
});
```

#### 3.3 工具扩展
**新增工具**:

```javascript
// src/tools/feishu-doc.js - 飞书文档操作
export const feishuDocTool = {
  name: 'feishu-doc',
  description: '读取和编辑飞书文档',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['read', 'create', 'update'] },
      docId: { type: 'string' },
      content: { type: 'string' }
    },
    required: ['action']
  },
  async execute(args, context) {
    // 实现飞书文档操作
  }
};

// src/tools/database.js - 数据库操作
export const databaseTool = {
  name: 'database',
  description: '数据库查询和操作',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      params: { type: 'array' }
    },
    required: ['query']
  },
  async execute(args) {
    // 实现数据库操作
  }
};
```

---

### 4️⃣ 架构优化 (优先级: 中)

#### 4.1 插件系统
**目标**: 工具和通道可插拔

```javascript
// src/plugins/index.js
export class PluginManager {
  constructor() {
    this.plugins = new Map();
  }
  
  async loadPlugin(pluginPath) {
    const plugin = await import(pluginPath);
    this.plugins.set(plugin.name, plugin);
    
    // 注册工具
    if (plugin.tools) {
      plugin.tools.forEach(tool => {
        toolRegistry.register(tool);
      });
    }
    
    // 注册通道
    if (plugin.channels) {
      plugin.channels.forEach(channel => {
        channelManager.register(channel);
      });
    }
  }
  
  async loadFromDirectory(dir) {
    // 自动加载插件目录
  }
}
```

#### 4.2 配置热更新
**目标**: 无需重启更新配置

```javascript
// src/utils/config-watcher.js
import { watch } from 'fs';

export function watchConfig(configPath, callback) {
  let debounceTimer;
  
  watch(configPath, (eventType) => {
    if (eventType === 'change') {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        try {
          const newConfig = await loadConfig();
          callback(newConfig);
          logger.info('配置已重新加载');
        } catch (err) {
          logger.error('配置重载失败:', err);
        }
      }, 1000);
    }
  });
}
```

---

### 5️⃣ 测试和文档 (优先级: 中)

#### 5.1 测试覆盖率提升
**目标**: 覆盖率 > 80%

**需要添加的测试**:
- `tests/agent.test.js` - Agent 核心逻辑
- `tests/gateway.test.js` - Gateway API
- `tests/channels/feishu.test.js` - 飞书通道
- `tests/integration.test.js` - 集成测试

#### 5.2 API 文档
**使用 Swagger/OpenAPI**:

```javascript
// src/gateway/swagger.js
import swagger from '@fastify/swagger';

fastify.register(swagger, {
  swagger: {
    info: {
      title: 'MiniClaw API',
      version: '0.2.0'
    }
  }
});

// 访问 /documentation 查看 API 文档
```

---

## 📋 实施计划

### Phase 1: 基础优化 (1-2周)
- [ ] 错误处理标准化
- [ ] 日志轮转
- [ ] 健康检查增强
- [ ] 测试覆盖率提升

### Phase 2: 性能优化 (2-3周)
- [ ] 会话缓存优化
- [ ] 工具调用缓存
- [ ] 并发优化
- [ ] 指标收集

### Phase 3: 功能增强 (2-3周)
- [ ] 新工具开发
- [ ] 插件系统
- [ ] 配置热更新
- [ ] API 文档

### Phase 4: 架构升级 (3-4周)
- [ ] TypeScript 迁移
- [ ] 微服务拆分（可选）
- [ ] Docker 化
- [ ] CI/CD 流程

---

## 🔧 快速优化脚本

我可以帮您立即实施以下优化：

1. **日志轮转增强** - 添加日志轮转功能
2. **错误处理统一** - 创建标准错误类
3. **健康检查增强** - 完善健康检查
4. **缓存机制** - 添加工具缓存
5. **指标收集** - 添加性能指标

需要我帮您实施哪些优化？请告诉我优先级！
