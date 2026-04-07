# 飞书表情回复功能

## 功能说明

MiniClaw 现在支持对飞书消息进行表情回复，用于：

- ✅ 表示消息已收到（思考中）
- ✅ 表示处理完成
- ❌ 表示处理失败
- ❓ 表示需要更多信息

## 表情类型

| 表情 | 类型常量 | 说明 |
|------|----------|------|
| 👍 | `THUMBSUP` | 赞 |
| 👌 | `OK` | OK |
| ❤️ | `HEART` | 爱心 |
| 😄 | `SMILE` | 微笑 |
| 🤔 | `THINK` | 思考中 |
| 😢 | `CRY` | 哭泣 |
| 😠 | `ANGRY` | 生气 |
| 🎉 | `PARTY` | 庆祝 |
| 🔥 | `FIRE` | 火 |
| 👏 | `CLAP` | 鼓掌 |
| 🚀 | `ROCKET` | 火箭 |
| ✅ | `CHECK` | 完成 |
| ❌ | `CROSS` | 错误 |
| ❓ | `QUESTION` | 疑问 |
| 💡 | `LIGHT` | 灯泡 |
| ⭐ | `STAR` | 星星 |

## 使用方式

### 1. 自动表情回复

MiniClaw 会自动对消息进行表情回复：

```
收到消息 → 🤔 (思考中)
处理成功 → ✅ (完成)
处理失败 → ❌ (错误)
```

### 2. 手动调用

在代码中可以手动调用表情回复：

```javascript
const feishuChannel = createFeishuChannel(config);

// 添加表情回复
await feishuChannel.addReaction(messageId, 'THUMBSUP');

// 使用预定义常量
await feishuChannel.addReaction(messageId, feishuChannel.EMOJI_TYPES.CHECK);

// 获取消息的表情列表
const reactions = await feishuChannel.getReactions(messageId);

// 删除表情回复
await feishuChannel.deleteReaction(messageId, reactionId);
```

### 3. 自定义表情回复逻辑

可以在消息处理回调中自定义表情回复：

```javascript
feishuChannel.onMessage(async ({ content, senderId, chatId, rawMessage }) => {
  const messageId = rawMessage.message_id;
  
  // 根据内容判断回复不同表情
  if (content.includes('谢谢')) {
    await feishuChannel.addReaction(messageId, 'HEART');
  } else if (content.includes('太棒了')) {
    await feishuChannel.addReaction(messageId, 'FIRE');
  }
});
```

## API 接口

### addReaction(messageId, emojiType)

添加表情回复

**参数：**
- `messageId` (string): 消息 ID
- `emojiType` (string): 表情类型

**返回：**
```javascript
{
  code: 0,          // 0 表示成功
  msg: 'success',
  data: {
    reaction_id: 'xxx'
  }
}
```

### deleteReaction(messageId, reactionId)

删除表情回复

**参数：**
- `messageId` (string): 消息 ID
- `reactionId` (string): 表情回复 ID

### getReactions(messageId)

获取消息的表情回复列表

**参数：**
- `messageId` (string): 消息 ID

**返回：**
```javascript
{
  code: 0,
  data: {
    items: [
      {
        reaction_type: 'THUMBSUP',
        operator: { open_id: 'ou_xxx' },
        create_time: '1234567890'
      }
    ]
  }
}
```

## 权限要求

确保飞书应用已开启以下权限：

- `im:reaction` - 表情回复权限
- `im:reaction:readonly` - 获取表情回复列表（只读）

## 示例场景

### 场景 1：消息处理状态

```
用户: 帮我分析这个文件
机器人: 🤔 (思考中)
... 处理中 ...
机器人: 分析完成，结果如下...
机器人: ✅ (完成)
```

### 场景 2：点赞互动

```
用户: 你真棒！
机器人: ❤️ (爱心)
机器人: 谢谢你的鼓励！
```

### 场景 3：错误提示

```
用户: 执行危险命令
机器人: ❌ (错误)
机器人: 抱歉，这个命令被拒绝了
```

## 注意事项

1. **权限检查**：确保应用有表情回复权限
2. **频率限制**：飞书对表情回复有频率限制，避免频繁调用
3. **消息类型**：只能对文本消息、富文本消息等进行表情回复
4. **表情数量**：每条消息的表情回复数量有限制
5. **删除权限**：只能删除自己添加的表情回复

## 调试

开启调试日志查看表情回复详情：

```bash
LOG_LEVEL=debug npm start
```

日志示例：
```
[feishu] 收到消息 [p2p] user123: 你好
[feishu] 表情回复成功: THINK
[feishu] Agent 回复: 你好！有什么可以帮助你的吗？
[feishu] 表情回复成功: CHECK
```
