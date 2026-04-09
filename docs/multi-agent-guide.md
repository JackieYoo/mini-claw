# MiniClaw 多 Agent 使用教程

> 🦞 让不同的专业 Agent 处理不同的任务，实现真正的智能分工

## 📖 目录

- [什么是多 Agent](#什么是多-agent)
- [快速开始](#快速开始)
- [配置文件详解](#配置文件详解)
- [路由策略](#路由策略)
- [使用方式](#使用方式)
- [自定义 Agent](#自定义-agent)
- [最佳实践](#最佳实践)

---

## 什么是多 Agent

### 单 Agent 的问题

传统的单 Agent 模式就像一个"全能但不够精"的助手：
- 🤯 系统提示词过长，模型容易"失忆"
- 🔄 不同任务的上下文互相干扰
- ⚡ 无法针对不同场景优化参数（温度、模型等）
- 🛠️ 所有工具都对 Agent 可见，容易误调用

### 多 Agent 的优势

MiniClaw 的多 Agent 架构让专业的人做专业的事：

```
用户消息: "帮我写个 Python 爬虫"
           ↓
    [智能路由器]
           ↓
    匹配到 "code" Agent
           ↓
    代码专家为您服务
```

**优势：**
- 🎯 **专业分工** - 代码 Agent 精通编程，文档 Agent 擅长写作
- ⚙️ **独立配置** - 每个 Agent 可以有独立的模型、温度、工具
- 🔒 **工具隔离** - 代码 Agent 不能执行危险命令，运维 Agent 可以
- 💾 **会话隔离** - 不同 Agent 的会话历史互不干扰

---

## 快速开始

### 1. 创建配置文件

```bash
cp config/agents.example.yaml config/agents.yaml
```

### 2. 编辑配置

```yaml
router:
  strategy: hybrid
  default_agent: default

agents:
  default:
    name: 通用助手
    description: 处理日常对话
    model: glm-5
    system_prompt: "你是通用助手..."
    tools: [shell, file_read, web_search]
    
  code:
    name: 代码助手
    description: 专业处理编程问题
    model: gpt-4
    temperature: 0.3
    system_prompt: "你是代码专家..."
    tools: [shell, file_read, file_write]
    route:
      patterns: ["代码", "编程", "\\.js$"]
```

### 3. 启动服务

```bash
npm start
```

启动后你会看到：

```
🦞 MiniClaw
Multi-Agent AI Assistant Framework

Agent 工厂初始化完成，共 5 个 Agent
  • default - 通用助手 (glm-5)
  • code - 代码助手 (gpt-4)
  • doc - 文档助手 (glm-5)
  • ops - 运维助手 (glm-5)
  • research - 研究助手 (glm-5)

路由策略: hybrid
默认 Agent: default
```

---

## 配置文件详解

### 完整配置结构

```yaml
# ============================================
# 全局默认配置
# ============================================
defaults:
  api_key: ${MODEL_API_KEY}           # 默认 API Key
  base_url: ${MODEL_API_BASE}         # 默认 API Base
  temperature: 0.7                    # 默认温度
  max_tokens: 4096                    # 默认最大 Token
  max_history: 50                     # 默认历史消息数

# ============================================
# 路由配置
# ============================================
router:
  strategy: hybrid                    # 路由策略
  default_agent: default              # 默认 Agent
  llm:                                # LLM 路由配置
    model: glm-5
    temperature: 0
    max_tokens: 50

# ============================================
# Agent 定义
# ============================================
agents:
  # 每个 Agent 的完整配置
  <agent-id>:
    # 基本信息
    name: 显示名称
    description: 功能描述
    
    # 模型配置（继承 defaults 可覆盖）
    model: gpt-4
    api_key: ${GPT4_API_KEY}          # 可使用不同的 API Key
    base_url: https://api.openai.com/v1
    temperature: 0.3                  # 代码用低温度，创意用高温度
    max_tokens: 4096
    max_history: 100
    
    # 系统提示词
    system_prompt: |
      你是专业的代码助手...
      
    # 可用工具（白名单机制）
    tools:
      - shell
      - file_read
      - file_write
      
    # 技能（自动加载 skills/ 目录）
    skills:
      - shell
      - file
      
    # 路由规则
    route:
      priority: 10                    # 优先级（越高越优先）
      patterns:                       # 匹配规则（正则）
        - "写代码"
        - "编程"
        - "bug"
        - "\\.js$"                    # 匹配 .js 文件
        - "function\\s+\\w+"           # 匹配函数定义
```

### 配置项说明

#### `router.strategy` 路由策略

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| `pattern` | 仅使用关键词正则匹配 | 规则明确、性能优先 |
| `llm` | 使用 LLM 智能判断 | 语义复杂、准确度优先 |
| `hybrid` | 混合策略（推荐） | 兼顾性能和准确度 |

#### `route.patterns` 匹配规则

支持正则表达式和简单字符串：

```yaml
route:
  priority: 10
  patterns:
    # 简单关键词
    - "写代码"
    - "编程"
    
    # 正则表达式（忽略大小写）
    - "\\.js$"           # 匹配 .js 结尾
    - "\\.py$"           # 匹配 .py 结尾
    - "function\\s+\\w+"  # 匹配函数定义
    - "class\\s+\\w+"     # 匹配类定义
    
    # 中文正则
    - "[\\u4e00-\\u9fa5]{2,} bug"
```

#### 工具权限

```yaml
tools:
  - shell           # 执行命令（危险）
  - file_read       # 读文件
  - file_write      # 写文件
  - web_search      # 网络搜索
  - http_request    # HTTP 请求
  - memory          # 记忆管理
```

**安全建议：**
- 通用 Agent 不要给 `shell` 权限
- 运维 Agent 可以给 `shell`，但要设置 `temperature: 0.2` 降低随机性

---

## 路由策略

### 1. Pattern 模式（关键词匹配）

**原理：** 用正则表达式匹配用户消息

```yaml
router:
  strategy: pattern
```

**匹配过程：**

```
用户: "帮我写个 Python 爬虫"
      ↓
检查 "code" Agent 的 patterns:
  - "写代码" ✓ 匹配
  - "编程" ✓ 匹配
  - "\\.py$" ✗ 不匹配
      ↓
匹配成功，使用 code Agent
```

**优点：**
- ⚡ 速度快（本地正则，无需 API 调用）
- 💰 零成本
- 🔒 确定性高

**缺点：**
- 难以处理语义复杂的场景
- 需要维护规则列表

### 2. LLM 模式（智能判断）

**原理：** 用 LLM 分析用户意图

```yaml
router:
  strategy: llm
  llm:
    model: glm-5
    temperature: 0
```

**判断提示词示例：**

```
根据用户消息选择最合适的 Agent：

[default] 通用助手
  描述: 处理日常对话
  技能: file, web

[code] 代码助手
  描述: 专业处理编程问题
  技能: shell, file

用户消息: "帮我写个 Python 爬虫"

Agent ID:
```

**优点：**
- 🧠 理解语义，不受关键词限制
- 🎯 准确度高

**缺点：**
- ⏱️ 有延迟（需要一次 API 调用）
- 💸 有成本

### 3. Hybrid 模式（混合，推荐）

**原理：** 先尝试 Pattern，不确定时再用 LLM

```yaml
router:
  strategy: hybrid
```

**决策逻辑：**

```
用户消息
   ↓
Pattern 匹配
   ↓
高优先级匹配？ ──是──→ 使用匹配 Agent
   ↓ 否
短消息或无匹配？ ──是──→ LLM 判断
   ↓ 否
使用 Pattern 结果
```

**代码示例：**

```javascript
// 混合路由伪代码
function hybridRoute(message) {
  const patternResult = routeByPattern(message);
  
  // 高优先级匹配，直接使用
  if (patternResult.priority >= 8) {
    return patternResult.agentId;
  }
  
  // 短消息或不确定，用 LLM
  if (message.length < 20 || patternResult.isDefault) {
    return await routeByLLM(message);
  }
  
  return patternResult.agentId;
}
```

---

## 使用方式

### 飞书使用

#### 1. @agent 临时使用

在任意对话中 `@` 指定 Agent：

```
@code 帮我写个快速排序算法
@doc 总结一下这份文档的要点
@ops 查看服务器磁盘使用情况
```

特点：
- 仅本次消息使用指定 Agent
- 不影响当前会话绑定的 Agent

#### 2. /agent 切换当前 Agent

```
/agent code        # 切换到代码助手
/agent doc         # 切换到文档助手
/agent             # 查看当前使用的 Agent
```

特点：
- 后续消息都使用此 Agent
- 会话持久化绑定

#### 3. /agents 查看所有 Agent

```
/agents
```

输出示例：

```
🤖 可用 Agent 列表:

▶ @code - 代码助手
     专业处理编程、代码审查、调试
  @doc - 文档助手
     处理文档编辑、总结、飞书文档
  @ops - 运维助手
     服务器运维、系统管理、Docker
```

#### 4. 智能自动路由

直接发送消息，系统自动选择：

```
用户: "帮我写个 Python 爬虫"
系统: 自动路由到 code Agent

用户: "总结一下这份会议纪要"
系统: 自动路由到 doc Agent
```

### API 使用

#### 基础聊天

```bash
# 自动路由
curl -X POST http://localhost:18790/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "帮我写个 Python 爬虫"
  }'

# 返回
{
  "success": true,
  "response": "...",
  "agentId": "code",
  "agentName": "代码助手"
}
```

#### 显式指定 Agent

```bash
curl -X POST http://localhost:18790/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "帮我写个 Python 爬虫",
    "agent": "code"
  }'
```

#### 保持会话连续性

```bash
# 第一次请求
curl -X POST http://localhost:18790/chat \
  -d '{
    "message": "帮我写个爬虫",
    "context": {
      "channel": "web",
      "chatId": "user_123"
    }
  }'
# 返回: { "sessionKey": "default:web:dm:user_123" }

# 后续请求使用相同 sessionKey
curl -X POST http://localhost:18790/chat \
  -d '{
    "message": "再加个代理功能",
    "sessionKey": "default:web:dm:user_123"
  }'
```

#### 获取 Agent 列表

```bash
# 获取所有 Agent
curl http://localhost:18790/agents

# 获取指定 Agent
curl http://localhost:18790/agents/code
```

### WebSocket 使用

```javascript
const ws = new WebSocket('ws://localhost:18790/ws');

// 发送消息（自动路由）
ws.send(JSON.stringify({
  type: 'chat',
  payload: {
    message: '帮我写个函数'
  }
}));

// 发送消息（指定 Agent）
ws.send(JSON.stringify({
  type: 'chat',
  payload: {
    message: '帮我写个函数',
    agentId: 'code'
  }
}));

// 切换当前 Agent
ws.send(JSON.stringify({
  type: 'switch_agent',
  payload: {
    sessionKey: 'default:web:dm:user_123',
    agentId: 'doc'
  }
}));

// 获取所有 Agent
ws.send(JSON.stringify({
  type: 'agents'
}));
```

---

## 自定义 Agent

### 创建新 Agent

在 `config/agents.yaml` 中添加：

```yaml
agents:
  # ... 其他 Agent
  
  data-analyst:
    name: 数据分析师
    description: 专业数据分析、可视化、SQL 查询
    model: gpt-4
    temperature: 0.2
    system_prompt: |
      你是专业的数据分析师，精通 SQL、Python 数据分析、可视化。
      
      规则：
      1. 写 SQL 时先分析表结构
      2. 提供数据洞察而不仅是结果
      3. 使用 matplotlib/seaborn 做可视化
      
    tools:
      - shell
      - file_read
      - file_write
      - web_search
      
    route:
      priority: 9
      patterns:
        - "数据分析"
        - "SQL"
        - "可视化"
        - "pandas"
        - "dataframe"
        - "图表"
        - "统计"
```

### Agent 模板

```yaml
<agent-id>:
  name: 显示名称
  description: 一句话描述（用于 LLM 路由）
  model: 模型名称
  temperature: 0.3-0.7
  max_tokens: 4096
  
  system_prompt: |
    你是...（角色定义）
    
    你的专长：
    1. xxx
    2. xxx
    
    规则：
    - xxx
    - xxx
    
  tools:
    - shell
    - file_read
    - file_write
    - web_search
    - http_request
    - memory
    
  skills:
    - <skill-name>
    
  route:
    priority: 5-10
    patterns:
      - "关键词"
      - "正则.*模式"
```

### 使用不同模型

```yaml
agents:
  # 使用本地模型（便宜、快速）
  default:
    model: glm-5
    base_url: https://one-api.hailiangedu.com/v1
    
  # 使用 GPT-4（能力强、贵）
  code:
    model: gpt-4
    api_key: ${OPENAI_API_KEY}
    base_url: https://api.openai.com/v1
    
  # 使用 Claude（创意写作）
  writer:
    model: claude-3-opus
    api_key: ${ANTHROPIC_API_KEY}
    base_url: https://api.anthropic.com/v1
```

---

## 最佳实践

### 1. 合理划分 Agent

**好的划分：**
- ✅ `code` - 编程相关
- ✅ `doc` - 文档相关
- ✅ `ops` - 运维相关
- ✅ `research` - 研究调研

**避免：**
- ❌ 划分太细（`frontend-code`, `backend-code`, `sql-code`）
- ❌ 划分太粗（`everything`）

### 2. 优化匹配规则

**好的规则：**
```yaml
patterns:
  - "\\.js$"           # 文件扩展名
  - "function\\s+"     # 代码特征
  - "bug|debug|错误"   # 场景关键词
```

**避免：**
```yaml
patterns:
  - "."                # 太宽泛，会匹配所有
  - "问题"             # 太常见，容易误触发
```

### 3. 设置合理的优先级

```yaml
agents:
  # 高优先级 - 特定场景
  ops:
    route:
      priority: 10      # 服务器、docker 等强特征
      
  # 中优先级 - 专业场景
  code:
    route:
      priority: 8
      
  # 低优先级 - 兜底
  default:
    route:
      priority: 0       # 最后匹配
```

### 4. 会话管理

**绑定会话到 Agent：**

```javascript
// 用户明确选择了代码助手
// 后续相关对话都继续用它
agentFactory.bindSession(sessionKey, 'code');
```

**定期清理：**

```javascript
// 长时间未活跃的会话解绑
setInterval(() => {
  for (const [key, session] of sessions) {
    if (Date.now() - session.updatedAt > 30 * 60 * 1000) {
      agentFactory.unbindSession(key);
    }
  }
}, 60000);
```

### 5. 监控和调试

**查看路由决策：**

```bash
# 开启调试日志
DEBUG_MESSAGES=true npm start

# 查看日志
npm start 2>&1 | grep "路由"
```

**测试路由：**

```bash
curl http://localhost:18790/agents

# 手动测试
curl -X POST http://localhost:18790/chat \
  -d '{"message":"写个函数"}' \
  -v
```

---

## 常见问题

### Q: Agent 切换后历史消息还在吗？

**A:** 每个 Agent 有独立的会话历史。切换到新 Agent 后：
- 旧 Agent 的历史保留
- 新 Agent 开始新的对话

### Q: 如何让多个 Agent 协作？

**A:** 使用委派功能：

```javascript
// 主 Agent 委派任务给子 Agent
const result = await agentFactory.delegate(
  'research',    // 主 Agent
  'code',        // 子 Agent
  {
    description: '实现数据爬取',
    prompt: '根据调研结果，写个爬虫...'
  }
);
```

### Q: 临时 Agent 有什么用？

**A:** 临时 Agent 用于特定任务：

```javascript
// 为用户 A 创建临时数据分析 Agent
const tempAgent = agentFactory.createTemp({
  name: '用户A的数据助手',
  system_prompt: '你熟悉用户A的业务数据...',
  tools: ['sql', 'file_read'],
  ttl: 3600000  // 1小时后自动清理
});
```

### Q: 路由不准确怎么办？

**A:** 优化策略：

1. **添加更精确的 patterns**
```yaml
patterns:
  - "\\.jsx?$"           # 更精确的文件扩展名
  - "React\\.Component"  # 框架特征
```

2. **调整优先级**
```yaml
route:
  priority: 9  # 提高优先级
```

3. **使用 hybrid 模式**
```yaml
router:
  strategy: hybrid  # 让 LLM 处理模糊情况
```

---

## 示例场景

### 场景 1: 开发团队助手

```yaml
agents:
  architect:
    name: 架构师
    description: 系统设计、技术选型
    tools: [web_search, file_read]
    
  code-reviewer:
    name: 代码审查员
    description: 代码审查、最佳实践
    tools: [file_read]
    
  dev-helper:
    name: 开发助手
    description: 写代码、调试
    tools: [shell, file_read, file_write]
    
  tester:
    name: 测试助手
    description: 写测试用例、Bug 分析
    tools: [file_read, shell]
```

### 场景 2: 内容创作团队

```yaml
agents:
  researcher:
    name: 研究员
    description: 资料搜集、竞品分析
    tools: [web_search, memory]
    
  writer:
    name: 撰稿人
    description: 文章撰写、润色
    tools: [file_read, file_write]
    
  editor:
    name: 编辑
    description: 内容审查、排版
    tools: [file_read, file_write]
    
  illustrator:
    name: 插画师
    description: 配图建议、视觉设计
    tools: [web_search]
```

---

## 更多资源

- [OpenClaw 文档](https://docs.openclaw.ai)
- [飞书开放平台](https://open.feishu.cn/document)
- [OpenAI API 文档](https://platform.openai.com/docs)

---

**Happy Multi-Agent-ing! 🦞**
