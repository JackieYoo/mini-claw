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
  
  try {
    const Lark = await import('@larksuiteoapi/node-sdk');
    
    const client = new Lark.Client({
      appId: appId,
      appSecret: appSecret,
      appType: Lark.AppType.SelfBuild,
    });
    
    console.log('   🔄 测试飞书连接...');
    
    const result = await client.bot.userInfo.get();
    
    if (result.code === 0) {
      console.log('   ✅ 飞书连接成功');
      console.log(`   🤖 机器人: ${result.data?.bot?.app_name}`);
    } else {
      console.log('   ❌ 飞书连接失败');
      console.log(`   错误码: ${result.code}`);
      console.log(`   错误信息: ${result.msg}`);
      
      if (result.code === 40001) {
        console.log('\n   💡 排查建议:');
        console.log('      1. 检查 App ID 和 App Secret 是否正确');
        console.log('      2. 登录飞书开放平台: https://open.feishu.cn/app');
        console.log('      3. 确认应用状态为"已发布"');
        console.log('      4. 检查企业是否已安装此应用');
        console.log('      5. 如果使用自建应用，确保有正确的权限');
      }
    }
    
  } catch (err) {
    console.log('   ❌ 飞书测试异常');
    console.log(`   错误: ${err.message}`);
  }
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
