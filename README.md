# MiniClaw 🦞

一个精简版的 AI 助手框架，学习 OpenClaw 的核心架构设计。

**🎉 新功能：支持多 Agent 智能路由！**

## 🏗️ 架构

### 多 Agent 架构 (New!)

```
┌─────────────────────────────────────────────────────────────┐
│                        Gateway                               │
│                   (路由 + 负载均衡)                           │
└──────────────┬──────────────────────────────────────────────┘
               │
    ┌──────────┼──────────┬──────────┐
    ▼          ▼          ▼          ▼
┌───────┐  ┌───────┐  ┌───────┐  ┌───────┐
│Agent-1│  │Agent-2│  │Agent-3│  │Agent-N│  │← Agent Registry
│通用助手│  │代码助手│  │文档助手│  │自定义 │
└───────┘  └───────┘  └───────┘  └───────┘
    │          │          │           │
    └──────────┴──────────┴───────────┘
                   │
            ┌──────────────┐
            │ Session Store│  │← 按 agentId 隔离会话
            │ (agent+user) │
            └──────────────┘
```

### 路由策略

- **pattern**: 关键词正则匹配（最快）
- **llm**: LLM 智能判断（最准）
- **hybrid**: 混合策略（推荐）

### 📚 多 Agent 文档

| 文档 | 说明 |
|------|------|
| [多 Agent 完整教程](docs/multi-agent-guide.md) | 详细的使用指南 |
| [速查表](docs/multi-agent-cheatsheet.md) | 快速参考卡片 |
| [实战案例](docs/multi-agent-examples.md) | 各行业应用示例 |

## ✨ 功能特性

### 🎯 学习自 OpenClaw

| 特性 | 说明 |
|------|------|
| **会话管理** | 多种 DM 隔离模式，自动清理过期会话，持久化存储 |
| **技能系统** | AgentSkills 格式，YAML frontmatter，需求检查 |
| **工具系统** | 6 个内置工具，支持自定义扩展 |
| **通道设计** | 飞书长连接，命令支持，事件处理 |
| **Gateway** | RESTful API + WebSocket，健康检查，统计信息 |

### 🛠️ 内置工具

| 工具 | 功能 |
|------|------|
| `shell` | 执行系统命令 |
| `file_read` | 读取文件 |
| `file_write` | 写入文件 |
| `web_search` | 网络搜索 |
| `http_request` | HTTP 请求 |
| `memory` | 记忆管理 |

## 🚀 快速开始

### 1. 安装

```bash
cd ~/projects/mini-claw
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 填入 MODEL_API_KEY 等配置
```

### 3. 配置多 Agent（可选但推荐）

```bash
# 复制示例配置
cp config/agents.example.yaml config/agents.yaml

# 编辑配置，添加你的 Agent
vim config/agents.yaml
```

### 4. 启动

```bash
# 启动服务
npm start

# 或使用开发模式（自动重启）
npm run dev
```

### 5. 验证安装

```bash
# 诊断授权问题
npm run diagnose

# 测试多 Agent 功能
npm run test:agents
```

## 📡 API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/stats` | GET | 统计信息 |
| `/sessions` | GET | 会话列表 |
| `/tools` | GET | 工具列表 |
| `/skills` | GET | 技能列表 |
| `/chat` | POST | 发送消息 |
| `/tools/:name` | POST | 调用工具 |
| `/sessions/:key` | DELETE | 重置会话 |
| `/ws` | WS | WebSocket 连接 |

## 🤖 多 Agent 使用指南

### 配置文件 (`config/agents.yaml`)

```yaml
# 路由策略: pattern | llm | hybrid
router:
  strategy: hybrid
  default_agent: default

# Agent 定义
agents:
  default:
    name: 通用助手
    description: 处理日常对话
    model: ${MODEL_NAME}
    system_prompt: "你是通用助手..."
    tools: [shell, file_read, web_search]
    route:
      priority: 0
      patterns: []

  code:
    name: 代码助手
    description: 处理编程问题
    model: gpt-4
    temperature: 0.3
    system_prompt: "你是代码专家..."
    tools: [shell, file_read, file_write]
    route:
      priority: 10
      patterns:
        - "写代码"
        - "编程"
        - "\\.js$"
        - "\\.py$"
```

### 飞书多 Agent 命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `@agent-name` | 临时使用某 Agent | `@code 帮我写个函数` |
| `/agent <name>` | 切换当前 Agent | `/agent code` |
| `/agents` | 查看所有 Agent | - |
| `/reset` | 重置会话并解绑 Agent | - |

### API 多 Agent 支持

```bash
# 显式指定 Agent
POST /chat
{
  "message": "帮我写个函数",
  "agent": "code"
}

# 让系统自动路由
POST /chat
{
  "message": "帮我写个函数"
}

# 获取所有 Agent
GET /agents

# 获取指定 Agent 信息
GET /agents/:agentId
```

## 📁 项目结构

```
mini-claw/
├── src/
│   ├── index.js              # 入口（支持多 Agent）
│   ├── gateway/index.js      # Gateway 服务（多 Agent API）
│   ├── agent/
│   │   ├── index.js          # Agent 核心
│   │   ├── factory.js        # Agent 工厂 ⭐
│   │   └── router.js         # 智能路由 ⭐
│   ├── channels/
│   │   ├── index.js          # 通道管理
│   │   └── feishu.js         # 飞书通道（@agent 支持）⭐
│   ├── tools/
│   │   ├── index.js          # 工具注册
│   │   ├── shell.js          # Shell 工具
│   │   ├── file_read.js      # 文件读取
│   │   ├── file_write.js     # 文件写入
│   │   ├── web_search.js     # 网络搜索
│   │   ├── http_request.js   # HTTP 请求
│   │   └── memory.js         # 记忆管理
│   └── utils/
│       ├── config.js         # 配置加载（支持 agents.yaml）⭐
│       ├── logger.js         # 日志系统
│       ├── session.js        # 会话管理（Agent 隔离）⭐
│       └── skills.js         # 技能加载
├── skills/                   # 技能目录
├── config/                   # 配置文件
│   ├── agents.yaml           # 多 Agent 配置 ⭐
│   └── agents.example.yaml   # 配置示例
├── docs/                     # 文档
│   ├── multi-agent-guide.md      # 完整教程
│   ├── multi-agent-cheatsheet.md # 速查表
│   └── multi-agent-examples.md   # 实战案例
├── scripts/                  # 工具脚本
│   ├── diagnose.js           # 授权诊断工具 ⭐
│   └── test-multi-agent.js   # 多 Agent 测试
├── .env.example              # 环境变量模板
└── README.md
```

⭐ 表示多 Agent 功能新增或修改的文件

## ⚙️ 配置说明

### 环境变量

```bash
# Gateway
GATEWAY_PORT=18790

# Model (OpenAI 兼容)
MODEL_API_BASE=https://one-api.hailiangedu.com/v1
MODEL_API_KEY=your-api-key
MODEL_NAME=glm-5

# Feishu
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx

# Logging
LOG_LEVEL=info
```

## 🔧 扩展开发

### 添加新工具

```javascript
// src/tools/my_tool.js
export const myTool = {
  name: 'my_tool',
  description: '工具描述',
  parameters: {
    type: 'object',
    properties: { /* ... */ },
    required: ['param1']
  },
  async execute(args) {
    return { success: true };
  }
};
```

### 添加新技能

```markdown
# skills/my-skill/SKILL.md
---
name: my-skill
description: 技能描述
---

详细说明...
```

## 📊 与 OpenClaw 对比

| 特性 | OpenClaw | MiniClaw |
|------|----------|----------|
| 通道支持 | 10+ | 飞书 |
| 会话管理 | ✅ 完整 | ✅ 简化 |
| 技能系统 | ✅ 完整 | ✅ 简化 |
| 工具系统 | ✅ 丰富 | ✅ 6个 |
| 多 Agent | ✅ 支持 | ❌ 单 Agent |
| 持久化 | ✅ 完整 | ✅ 文件 |
| 代码量 | ~50k 行 | ~3k 行 |

## 📚 学习资源

- [OpenClaw 文档](https://docs.openclaw.ai)
- [OpenClaw 源码](https://github.com/openclaw/openclaw)
- [飞书开放平台](https://open.feishu.cn/document)

## License

MIT
