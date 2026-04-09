# MiniClaw 多 Agent 速查表

## 🚀 快速开始

```bash
# 1. 创建配置
cp config/agents.example.yaml config/agents.yaml

# 2. 编辑配置（参考下方模板）
vim config/agents.yaml

# 3. 启动
npm start
```

---

## 📋 配置模板

### 最小配置

```yaml
router:
  strategy: pattern
  default_agent: default

agents:
  default:
    name: 通用助手
    model: ${MODEL_NAME}
    system_prompt: "你是助手"
    tools: [file_read, web_search]
```

### 推荐配置（5个 Agent）

```yaml
router:
  strategy: hybrid
  default_agent: default

agents:
  default:
    name: 通用助手
    model: glm-5
    system_prompt: "你是通用助手"
    tools: [shell, file_read, web_search]

  code:
    name: 代码助手
    model: gpt-4
    temperature: 0.3
    system_prompt: "你是代码专家"
    tools: [shell, file_read, file_write]
    route:
      priority: 10
      patterns: ["代码", "编程", "bug", "\\.js$", "\\.py$"]

  doc:
    name: 文档助手
    model: glm-5
    system_prompt: "你是文档专家"
    tools: [file_read, file_write]
    route:
      priority: 8
      patterns: ["文档", "总结", "会议纪要", "飞书"]

  ops:
    name: 运维助手
    model: glm-5
    temperature: 0.2
    system_prompt: "你是运维专家"
    tools: [shell, file_read]
    route:
      priority: 9
      patterns: ["服务器", "docker", "nginx", "部署", "日志"]

  research:
    name: 研究助手
    model: glm-5
    system_prompt: "你是研究专家"
    tools: [web_search, file_read, file_write]
    route:
      priority: 7
      patterns: ["搜索", "调研", "资料", "竞品"]
```

---

## 💬 飞书命令

| 命令 | 作用 |
|------|------|
| `@code 消息` | 临时使用 code Agent |
| `/agent code` | 切换到 code Agent |
| `/agents` | 查看所有 Agent |
| `/reset` | 重置会话并解绑 Agent |

---

## 🔌 API 调用

### 自动路由

```bash
curl -X POST http://localhost:18790/chat \
  -d '{"message":"写个 Python 爬虫"}'
```

### 指定 Agent

```bash
curl -X POST http://localhost:18790/chat \
  -d '{"message":"写个爬虫","agent":"code"}'
```

### 获取 Agent 列表

```bash
curl http://localhost:18790/agents
```

---

## 🎯 路由策略对比

| 策略 | 速度 | 准确度 | 成本 | 适用场景 |
|------|------|--------|------|----------|
| `pattern` | ⚡ 快 | ⭐⭐ | 免费 | 规则明确 |
| `llm` | 🐢 慢 | ⭐⭐⭐⭐⭐ | 收费 | 语义复杂 |
| `hybrid` | ⚡ 快 | ⭐⭐⭐⭐ | 低 | **推荐** |

---

## 🛠️ 工具权限矩阵

| Agent 类型 | shell | file_read | file_write | web_search | http_request |
|------------|-------|-----------|------------|------------|--------------|
| 通用助手 | ❌ | ✅ | ❌ | ✅ | ✅ |
| 代码助手 | ✅ | ✅ | ✅ | ✅ | ❌ |
| 文档助手 | ❌ | ✅ | ✅ | ✅ | ❌ |
| 运维助手 | ✅ | ✅ | ❌ | ❌ | ✅ |
| 研究助手 | ❌ | ✅ | ✅ | ✅ | ✅ |

---

## 🔧 调试命令

```bash
# 诊断授权问题
npm run diagnose

# 测试多 Agent 功能
npm run test:agents

# 查看路由日志
DEBUG_MESSAGES=true npm start 2>&1 | grep "路由"

# 检查配置文件
node -e "import('./src/utils/config.js').then(m => m.loadAgentsConfig().then(c => console.log(JSON.stringify(c, null, 2))))"
```

---

## 📊 性能优化建议

1. **使用 `pattern` 策略** - 避免 LLM 路由的 API 调用
2. **设置合理的 priority** - 高优先级 Agent 优先匹配
3. **限制历史消息** - `max_history: 30` 减少 Token 消耗
4. **使用轻量级模型** - 通用对话用 glm-5，复杂任务用 gpt-4

---

## 🚨 常见问题速查

| 问题 | 解决方案 |
|------|----------|
| 路由不准确 | 添加更精确的 `patterns` 或提高 `priority` |
| Agent 切换不生效 | 检查 `sessionKey` 是否一致 |
| 授权失败 | 运行 `npm run diagnose` |
| Agent 无法加载 | 检查 YAML 格式，确认 `agents` 字段存在 |
| 工具调用失败 | 检查 Agent 的 `tools` 白名单 |

---

## 📁 文件结构

```
mini-claw/
├── config/
│   ├── config.yaml          # 主配置
│   └── agents.yaml          # 多 Agent 配置 ⭐
├── src/
│   ├── agent/
│   │   ├── index.js         # Agent 核心
│   │   ├── factory.js       # Agent 工厂 ⭐
│   │   └── router.js        # 智能路由 ⭐
│   ├── channels/
│   │   └── feishu.js        # 飞书多 Agent 支持 ⭐
│   └── utils/
│       └── session.js       # Agent 隔离会话 ⭐
└── docs/
    ├── multi-agent-guide.md     # 完整教程
    └── multi-agent-cheatsheet.md # 本文件
```

---

## 🎓 学习路径

1. **入门** - 复制 `agents.example.yaml`，启动服务
2. **实践** - 在飞书中使用 `@agent` 和 `/agent`
3. **定制** - 修改配置，添加自己的 patterns
4. **进阶** - 创建自定义 Agent，使用不同模型
5. **精通** - 使用 API 集成到自己的工作流

---

**需要更多帮助？** 查看完整教程：`docs/multi-agent-guide.md`
