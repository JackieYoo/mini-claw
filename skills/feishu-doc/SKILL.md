---
name: feishu-doc
description: 飞书文档操作，支持读取和编辑飞书文档
user-invocable: true
metadata:
  {
    "openclaw":
      {
        "requires": { "env": ["FEISHU_APP_ID", "FEISHU_APP_SECRET"] },
        "emoji": "📄"
      }
  }
---

# 飞书文档工具

允许 AI 助手操作飞书文档。

## 功能

- 读取飞书文档内容
- 写入/追加文档内容
- 创建新文档
- 表格操作

## 使用场景

- 自动化文档生成
- 会议纪要整理
- 数据录入
- 报告生成

## 配置要求

需要配置飞书应用凭证：

```env
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
```

## 权限要求

飞书应用需要以下权限：

- `docs:document:readonly` - 读取文档
- `docs:document` - 编辑文档
- `drive:drive` - 访问云空间

## 示例

用户: "读取这个飞书文档 https://..."
AI: 调用 feishu_doc read 工具读取内容

用户: "在飞书文档中追加一段内容"
AI: 调用 feishu_doc append 工具追加内容
