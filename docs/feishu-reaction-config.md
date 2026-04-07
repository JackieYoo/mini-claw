# 飞书表情回复功能配置指南

## 📋 功能说明

MiniClaw 机器人收到消息后，会自动添加表情回复，让用户知道消息处理状态：

```
用户发送消息 → 👀 (已收到) → ⏳ (处理中) → ✅ (成功) / ❌ (失败)
```

## ⚙️ 配置项

### 环境变量配置

在 `.env` 文件中添加以下配置：

```bash
# 表情回复总开关
FEISHU_REACTION_ENABLED=true

# 收到消息时的表情
FEISHU_REACTION_RECEIVED_EMOJI=THUMBSUP
FEISHU_REACTION_SHOW_RECEIVED=true

# 处理中的表情
FEISHU_REACTION_PROCESSING_EMOJI=WOW
FEISHU_REACTION_SHOW_PROCESSING=true

# 处理成功的表情
FEISHU_REACTION_SUCCESS_EMOJI=OK
FEISHU_REACTION_SHOW_RESULT=true

# 处理失败的表情
FEISHU_REACTION_ERROR_EMOJI=SORROW
```

### 支持的表情类型

| 表情代码 | 显示 | 说明 |
|---------|------|------|
| `THUMBSUP` | 👍 | 点赞（默认） |
| `HEART` | ❤️ | 爱心 |
| `LAUGH` | 😂 | 笑脸 |
| `OK` | 👌 | OK手势 |
| `WOW` | 😮 | 惊讶 |
| `SORROW` | 😢 | 难过 |
| `ANGRY` | 😡 | 生气 |

## 🎯 使用场景

### 场景 1：收到消息立即反馈

```javascript
// 用户发送消息
用户: "@机器人 帮我分析这个文件"

// 机器人自动添加表情
机器人: 👍 (已收到)
```

### 场景 2：处理中状态

```javascript
// 机器人开始处理
机器人: 😮 (处理中...)

// 这让用户知道机器人正在工作
```

### 场景 3：处理结果反馈

```javascript
// 处理成功
机器人: 👌 (成功)
机器人: "文件分析完成..."

// 处理失败
机器人: 😢 (失败)
机器人: "❌ 文件不存在"
```

## 📊 表情回复流程

```
┌─────────────┐
│ 用户发送消息 │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ 检查是否需要回复 │
│ - 私聊消息      │
│ - @机器人消息   │
└──────┬──────────┘
       │
       ▼
┌──────────────────┐     FEISHU_REACTION_SHOW_RECEIVED=true
│ 添加"已收到"表情 │◄──────────────────────────────────┘
│ (THUMBSUP 👍)    │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐     FEISHU_REACTION_SHOW_PROCESSING=true
│ 添加"处理中"表情 │◄──────────────────────────────────┘
│ (WOW 😮)         │
└──────┬───────────┘
       │
       ▼
┌──────────────┐
│ Agent 处理消息│
└──────┬───────┘
       │
       ▼
   ┌───┴───┐
   │ 成功？ │
   └───┬───┘
       │
    ┌──┴──┐
    │     │
   是    否
    │     │
    ▼     ▼
┌────┐ ┌────┐
│ OK │ │失败│
└────┘ └────┘
```

## 🔧 高级配置

### 自定义表情序列

```bash
# 使用不同的表情组合
FEISHU_REACTION_RECEIVED_EMOJI=HEART      # 收到消息: ❤️
FEISHU_REACTION_PROCESSING_EMOJI=LAUGH    # 处理中: 😂
FEISHU_REACTION_SUCCESS_EMOJI=THUMBSUP    # 成功: 👍
FEISHU_REACTION_ERROR_EMOJI=ANGRY         # 失败: 😡
```

### 禁用特定阶段

```bash
# 只显示最终结果，不显示中间状态
FEISHU_REACTION_SHOW_RECEIVED=false
FEISHU_REACTION_SHOW_PROCESSING=false
FEISHU_REACTION_SHOW_RESULT=true
```

### 完全禁用表情回复

```bash
FEISHU_REACTION_ENABLED=false
```

## 💻 代码实现

### 在 feishu.js 中的实现

```javascript
// 1. 收到消息时
if (reaction.enabled && reaction.showReceived) {
  await addReaction(messageId, reaction.receivedEmoji);
}

// 2. 开始处理时
if (reaction.enabled && reaction.showProcessing) {
  await addReaction(messageId, reaction.processingEmoji);
}

// 3. 处理成功时
if (reaction.enabled && reaction.showResult) {
  await addReaction(messageId, reaction.successEmoji);
}

// 4. 处理失败时
if (reaction.enabled && reaction.showResult) {
  await addReaction(messageId, reaction.errorEmoji);
}
```

## 🧪 测试方法

### 方法 1：在飞书中测试

1. 在群聊中 @ 机器人发送消息
2. 观察消息上的表情变化

```
用户: "@机器人 你好"
机器人: 👍 → 😮 → 👌
机器人: "你好！有什么可以帮助你的吗？"
```

### 方法 2：使用测试脚本

```bash
node feishu_test/test_reaction.js
```

### 方法 3：查看日志

```bash
# 实时查看日志
pm2 logs mini-claw

# 或
tail -f logs/mini-claw-out.log
```

日志示例：
```
[feishu] 收到消息 [p2p] user: 你好
[feishu] 添加表情回复: 👍
[feishu] 添加表情回复: 😮
[feishu] Agent 回复: 你好！有什么可以帮助你的吗？
[feishu] 添加表情回复: 👌
```

## 🎨 最佳实践

### 1. 表情选择建议

- **收到消息**: `THUMBSUP` 👍 或 `HEART` ❤️ - 表示确认收到
- **处理中**: `WOW` 😮 或 `LAUGH` 😂 - 表示正在努力处理
- **成功**: `OK` 👌 或 `THUMBSUP` 👍 - 表示完成
- **失败**: `SORROW` 😢 - 表示遗憾

### 2. 性能考虑

- 表情回复是异步操作，不会阻塞消息处理
- 如果不需要中间状态反馈，可以禁用以减少 API 调用

### 3. 用户体验

- 表情回复提供了即时反馈，让用户知道消息已被接收
- 处理中的表情可以减少用户的等待焦虑
- 最终状态表情让用户快速了解处理结果

## ❓ 常见问题

### Q: 表情回复失败怎么办？

A: 检查以下事项：
1. 飞书应用是否有 `im:message.reaction` 权限
2. 消息 ID 是否正确
3. 表情类型是否在支持列表中

### Q: 可以添加自定义表情吗？

A: 飞书目前只支持预设的表情类型，不支持自定义表情。

### Q: 表情回复会重复添加吗？

A: 不会。飞书会自动去重，同一用户对同一消息的同一表情只会显示一次。

### Q: 如何查看消息的所有表情？

A: 使用 `getReactions(messageId)` API：

```javascript
const reactions = await channel.getReactions(messageId);
console.log(reactions);
// 输出: [{ emoji_type: 'THUMBSUP', user_count: 2 }, ...]
```

## 📚 相关文档

- [飞书消息表情回复 API](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message-reactions/create)
- [MiniClaw 配置说明](../README.md#配置)
- [飞书机器人开发指南](https://open.feishu.cn/document/home/introduction-to-feishu-bot/index)

## 🔄 更新日志

### v1.0.0 (2026-03-06)
- ✅ 实现基础表情回复功能
- ✅ 支持配置化表情类型
- ✅ 支持多阶段表情反馈
- ✅ 添加配置文档

---

需要帮助？请查看 [GitHub Issues](https://github.com/your-repo/mini-claw/issues) 或联系维护者。
