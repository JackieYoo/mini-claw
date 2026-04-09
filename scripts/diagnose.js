#!/usr/bin/env node
/**
 * 授权诊断工具
 * 帮助排查 Authorization failed 问题
 */

import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

console.log('\n🔍 MiniClaw 授权诊断工具\n');
console.log('═══════════════════════════════════════\n');

// 1. 检查 .env 文件
console.log('1️⃣  检查环境变量配置\n');
const envPath = join(process.cwd(), '.env');
if (!existsSync(envPath)) {
  console.log('   ❌ .env 文件不存在');
  console.log('   💡 请复制 .env.example 为 .env 并填写配置\n');
} else {
  console.log('   ✅ .env 文件存在');
  
  // 检查关键配置
  const requiredVars = [
    'MODEL_API_KEY',
    'MODEL_API_BASE',
    'MODEL_NAME',
    'FEISHU_APP_ID',
    'FEISHU_APP_SECRET',
  ];
  
  for (const varName of requiredVars) {
    const value = process.env[varName];
    if (!value) {
      console.log(`   ⚠️  ${varName} 未设置`);
    } else if (value.includes('your-') || value.includes('xxx') || value === '') {
      console.log(`   ⚠️  ${varName} 可能是默认值: ${value.substring(0, 20)}...`);
    } else {
      const masked = value.length > 8 
        ? value.substring(0, 4) + '****' + value.substring(value.length - 4)
        : '****';
      console.log(`   ✅ ${varName}: ${masked}`);
    }
  }
}

console.log('\n2️⃣  检查配置文件\n');

// 检查主配置
const configPaths = [
  join(process.cwd(), 'config', 'config.yaml'),
  join(process.cwd(), 'config.yaml'),
];

let configExists = false;
for (const path of configPaths) {
  if (existsSync(path)) {
    console.log(`   ✅ 主配置: ${path}`);
    configExists = true;
    break;
  }
}
if (!configExists) {
  console.log('   ❌ 主配置文件未找到');
}

// 检查多 Agent 配置
const agentsConfigPath = join(process.cwd(), 'config', 'agents.yaml');
if (existsSync(agentsConfigPath)) {
  console.log(`   ✅ 多 Agent 配置: ${agentsConfigPath}`);
} else {
  console.log('   ℹ️  多 Agent 配置文件未找到（可选）');
}

console.log('\n3️⃣  测试 API 连接\n');

async function testAPI() {
  const apiKey = process.env.MODEL_API_KEY;
  const apiBase = process.env.MODEL_API_BASE;
  const model = process.env.MODEL_NAME;
  
  if (!apiKey || !apiBase) {
    console.log('   ⏭️  跳过 API 测试（配置不完整）');
    return;
  }
  
  try {
    const { default: OpenAI } = await import('openai');
    
    const client = new OpenAI({
      apiKey: apiKey,
      baseURL: apiBase,
    });
    
    console.log(`   🔄 测试 API: ${apiBase}...`);
    
    const response = await client.chat.completions.create({
      model: model || 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 5,
    });
    
    console.log('   ✅ API 连接成功');
    console.log(`   📊 模型: ${response.model}`);
    
  } catch (err) {
    console.log('   ❌ API 连接失败');
    console.log(`   错误: ${err.message}`);
    
    if (err.status === 401) {
      console.log('\n   💡 可能原因:');
      console.log('      • API Key 无效或已过期');
      console.log('      • API Key 未正确复制（包含空格或特殊字符）');
      console.log('      • 账户余额不足');
    } else if (err.status === 404) {
      console.log('\n   💡 可能原因:');
      console.log('      • API Base URL 错误');
      console.log('      • 模型名称不存在');
    } else if (err.code === 'ECONNREFUSED') {
      console.log('\n   💡 可能原因:');
      console.log('      • 网络连接问题');
      console.log('      • API Base URL 无法访问');
    }
  }
}

async function testFeishu() {
  console.log('\n4️⃣  测试飞书连接\n');

  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;

  if (!appId || !appSecret) {
    console.log('   ⏭️  跳过飞书测试（配置不完整）');
    return;
  }

  // 检查凭证格式
  if (appId.includes('your-') || appSecret.includes('your-')) {
    console.log('   ⚠️  飞书凭证使用了占位符');
    console.log('   💡 请在 .env 文件中配置真实的 FEISHU_APP_ID 和 FEISHU_APP_SECRET');
    return;
  }

  console.log(`   🔄 飞书 App ID: ${appId.substring(0, 8)}...`);
  console.log('   ✅ 飞书配置格式正确');
  console.log('   💡 实际连接测试将在启动时进行');

  // SDK 1.59.0+ 中 client.bot API 已被移除，无法预先测试
  // WebSocket 连接会在启动时自动尝试
}

async function main() {
  await testAPI();
  await testFeishu();
  
  console.log('\n═══════════════════════════════════════\n');
  console.log('💡 常见问题解决:\n');
  console.log('1. Authorization failed (飞书)');
  console.log('   → 检查 FEISHU_APP_ID 和 FEISHU_APP_SECRET');
  console.log('   → 确认应用已发布并安装到企业\n');
  console.log('2. 401 Unauthorized (API)');
  console.log('   → 检查 MODEL_API_KEY 是否正确');
  console.log('   → 确认 API Key 未过期\n');
  console.log('3. 404 Not Found');
  console.log('   → 检查 MODEL_API_BASE 是否正确');
  console.log('   → 确认模型名称存在\n');
  
  console.log('📚 更多信息:');
  console.log('   • 飞书文档: https://open.feishu.cn/document');
  console.log('   • 项目文档: README.md\n');
}

main().catch(console.error);
