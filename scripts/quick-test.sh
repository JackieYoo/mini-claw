#!/bin/bash
# 多 Agent 快速测试脚本

PORT=${1:-18792}

echo "🧪 MiniClaw 多 Agent 快速测试"
echo "═══════════════════════════════════════"
echo ""

# 检查端口是否被占用
if lsof -ti:$PORT >/dev/null 2>&1; then
  echo "❌ 端口 $PORT 被占用，尝试释放..."
  kill $(lsof -ti:$PORT) 2>/dev/null
  sleep 1
fi

# 临时修改端口
export GATEWAY_PORT=$PORT

echo "1️⃣  启动服务 (端口: $PORT)..."
echo ""

# 后台启动服务
timeout 30s node src/index.js &
SERVER_PID=$!

# 等待服务启动
sleep 5

# 检查服务是否启动
if ! curl -s http://localhost:$PORT/health >/dev/null 2>&1; then
  echo "⏳ 等待服务启动..."
  sleep 5
fi

echo "2️⃣  测试健康检查"
curl -s http://localhost:$PORT/health | head -1
echo ""

echo "3️⃣  测试 Agent 列表"
curl -s http://localhost:$PORT/agents | head -c 500
echo ""
echo ""

echo "4️⃣  测试路由分析"
curl -s -X POST http://localhost:$PORT/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"帮我写个Python函数"}' 2>/dev/null | head -c 300
echo ""
echo ""

echo "5️⃣  停止服务"
kill $SERVER_PID 2>/dev/null
pkill -f "node src/index.js" 2>/dev/null

echo ""
echo "✅ 测试完成"
