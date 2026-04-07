#!/bin/bash

# MiniClaw 启动脚本

cd "$(dirname "$0")"

# 检查 node_modules
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
fi

# 检查 .env 文件
if [ ! -f ".env" ]; then
    echo "⚠️  .env 文件不存在，请先配置"
    echo "   cp .env.example .env"
    exit 1
fi

# 创建日志目录
mkdir -p logs

# 启动模式
case "$1" in
    dev)
        echo "🚀 启动开发模式..."
        npm run dev
        ;;
    pm2)
        echo "🚀 启动 PM2 模式..."
        npm run pm2:start
        npm run pm2:monit
        ;;
    *)
        echo "🚀 启动生产模式..."
        npm start
        ;;
esac
