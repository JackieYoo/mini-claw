---
name: shell
description: 执行 shell 命令，用于系统操作和自动化任务
user-invocable: true
---

# Shell 工具

允许 AI 助手执行系统 shell 命令。

## 功能

- 执行任意 shell 命令
- 支持超时控制
- 返回标准输出和错误输出

## 使用场景

- 查看系统信息
- 文件操作
- 运行脚本
- 系统管理

## 注意事项

- 执行前会显示命令内容
- 危险操作需要用户确认
- 超时默认 30 秒

## 示例

用户: "查看当前目录"
AI: 调用 shell 工具执行 `ls -la`

用户: "查看磁盘空间"
AI: 调用 shell 工具执行 `df -h`
