# MiniClaw 安全加固指南

本文档说明 MiniClaw 的安全措施和最佳实践。

## 🔐 已实施的安全措施

### 1. 命令注入防护

**位置**: `src/utils/validator.js`

**措施**:
- 危险命令黑名单（`rm -rf /`、`mkfs`、`dd` 等）
- 命令替换检测（`$()`、反引号）
- 换行符注入检测
- 管道和链式命令深度检查
- 远程代码执行防护（`curl | sh`、`wget | sh`）

```javascript
// 示例：被拒绝的危险命令
'rm -rf /'          // ❌ 拒绝
'echo $(whoami)'    // ❌ 拒绝
'ls | bash'         // ❌ 拒绝
'ls; rm -rf /'      // ❌ 拒绝
```

### 2. 环境变量隔离

**位置**: `src/tools/shell.js`

**措施**:
- 环境变量白名单机制
- 仅传递必要的环境变量（`PATH`、`HOME`、`USER` 等）
- 敏感信息（API Key、Secret）自动隔离

### 3. 路径遍历防护

**位置**: `src/utils/validator.js`

**措施**:
- `..` 路径遍历检测
- 空字节注入防护
- 敏感文件保护（`.ssh`、`.env`、`.pem` 等）
- 路径白名单机制

### 4. SSRF 防护

**位置**: `src/tools/http_request.js`

**措施**:
- 内网 IP 检测（`127.0.0.1`、`10.x.x.x`、`192.168.x.x` 等）
- 云元数据端点保护（`169.254.169.254`）
- 可配置的内网访问策略

```bash
# 禁止内网访问（默认）
HTTP_ALLOW_PRIVATE_NETWORK=false

# 允许内网访问（内部服务场景）
HTTP_ALLOW_PRIVATE_NETWORK=true
```

### 5. WebSocket 认证

**位置**: `src/gateway/index.js`

**措施**:
- Token 认证支持
- 可选的认证机制

```bash
# 配置 WebSocket 认证
WS_AUTH_TOKEN=your-secure-token-here

# 连接时携带 token
ws://localhost:18790/ws?token=your-secure-token-here
```

### 6. Rate Limiting

**位置**: `src/gateway/index.js`

**措施**:
- IP 级别的请求限流
- 默认 30 次/分钟
- 自动清理过期记录

### 7. 会话数据加密

**位置**: `src/utils/session.js` + `src/utils/security.js`

**措施**:
- 会话数据加密存储
- 文件权限限制（0o600）
- 可配置的加密密钥

```bash
# 配置会话加密密钥（推荐至少 32 字符）
SESSION_ENCRYPTION_KEY=your-encryption-key-at-least-32-chars
```

### 8. 输入大小限制

**位置**: `src/gateway/index.js`

**措施**:
- 消息大小限制（100KB）
- 文件读写限制（1MB 读、10MB 写）
- HTTP 响应截断（10KB）

## 🛠️ 配置建议

### 生产环境必配置项

```bash
# 1. 设置 Node.js 生产模式
NODE_ENV=production

# 2. 配置 WebSocket 认证
WS_AUTH_TOKEN=your-secure-random-token

# 3. 配置会话加密
SESSION_ENCRYPTION_KEY=your-encryption-key-at-least-32-chars

# 4. 禁止内网 HTTP 访问
HTTP_ALLOW_PRIVATE_NETWORK=false

# 5. 降低日志级别
LOG_LEVEL=warn
```

### 安全加固检查清单

- [ ] 设置 `NODE_ENV=production`
- [ ] 配置 `WS_AUTH_TOKEN`
- [ ] 配置 `SESSION_ENCRYPTION_KEY`
- [ ] 检查 `.env` 文件权限（应为 600）
- [ ] 确保 `.env` 不在版本控制中
- [ ] 配置 HTTPS（生产环境必须）
- [ ] 设置适当的文件权限
- [ ] 配置防火墙规则
- [ ] 定期更新依赖包

## ⚠️ 已知限制

1. **加密算法**: 当前使用简单 XOR 加密，生产环境建议使用 `crypto` 模块的 AES 加密
2. **DNS 重绑定**: SSRF 防护不处理 DNS 重绑定攻击
3. **符号链接**: 文件路径检查不处理符号链接
4. **TOCTOU**: 文件操作存在时间-检查-时间-使用竞争条件

## 📚 安全最佳实践

### 1. 环境变量管理

```bash
# 正确设置文件权限
chmod 600 .env

# 不要在日志中打印敏感信息
LOG_LEVEL=warn  # 生产环境
```

### 2. 网络安全

```bash
# 使用 HTTPS
# 配置反向代理（nginx/caddy）

# 限制访问 IP（示例）
# 仅允许内网访问
allow 10.0.0.0/8;
deny all;
```

### 3. 定期审计

```bash
# 检查依赖漏洞
npm audit

# 更新依赖
npm update

# 查看过期依赖
npm outdated
```

## 🚨 安全事件响应

如果发现安全漏洞：

1. **立即行动**: 禁用受影响的功能
2. **评估影响**: 确定受影响的数据和用户
3. **修复漏洞**: 应用补丁或更新配置
4. **通知用户**: 如有必要，通知受影响的用户
5. **记录事件**: 记录漏洞详情和修复措施

## 📖 参考资料

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [OpenClaw Security Guidelines](https://docs.openclaw.ai/security)
