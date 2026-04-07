/**
 * Update Feishu Reaction Config - 更新飞书表情回复配置
 * 
 * 运行方式: node scripts/update_reaction_config.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🦞 MiniClaw 飞书表情回复配置更新\n');

// 配置选项
const questions = [
  {
    name: 'FEISHU_REACTION_ENABLED',
    message: '是否启用表情回复？',
    default: 'true',
    type: 'boolean',
  },
  {
    name: 'FEISHU_REACTION_RECEIVED_EMOJI',
    message: '收到消息时的表情 (THUMBSUP/HEART/LAUGH/WOW)',
    default: 'THUMBSUP',
    type: 'emoji',
  },
  {
    name: 'FEISHU_REACTION_PROCESSING_EMOJI',
    message: '处理中的表情 (WOW/LAUGH/THINK)',
    default: 'WOW',
    type: 'emoji',
  },
  {
    name: 'FEISHU_REACTION_SUCCESS_EMOJI',
    message: '处理成功的表情 (OK/THUMBSUP/HEART)',
    default: 'OK',
    type: 'emoji',
  },
  {
    name: 'FEISHU_REACTION_ERROR_EMOJI',
    message: '处理失败的表情 (SORROW/ANGRY)',
    default: 'SORROW',
    type: 'emoji',
  },
  {
    name: 'FEISHU_REACTION_SHOW_RECEIVED',
    message: '是否显示"收到消息"表情？',
    default: 'true',
    type: 'boolean',
  },
  {
    name: 'FEISHU_REACTION_SHOW_PROCESSING',
    message: '是否显示"处理中"表情？',
    default: 'true',
    type: 'boolean',
  },
  {
    name: 'FEISHU_REACTION_SHOW_RESULT',
    message: '是否显示"处理结果"表情？',
    default: 'true',
    type: 'boolean',
  },
];

// 表情映射
const EMOJI_MAP = {
  'THUMBSUP': '👍',
  'HEART': '❤️',
  'LAUGH': '😂',
  'OK': '👌',
  'WOW': '😮',
  'SORROW': '😢',
  'ANGRY': '😡',
  'THINK': '🤔',
};

// 读取当前配置
function readCurrentConfig() {
  const envPath = path.join(__dirname, '..', '.env');
  
  if (!fs.existsSync(envPath)) {
    console.log('⚠️  .env 文件不存在，将创建新文件\n');
    return {};
  }
  
  const content = fs.readFileSync(envPath, 'utf-8');
  const config = {};
  
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        config[key.trim()] = valueParts.join('=').trim();
      }
    }
  });
  
  return config;
}

// 写入配置
function writeConfig(config) {
  const envPath = path.join(__dirname, '..', '.env');
  
  const lines = [];
  lines.push('# Gateway');
  lines.push(`GATEWAY_PORT=${config.GATEWAY_PORT || 18790}`);
  lines.push('');
  lines.push('# Model (OpenAI-compatible API)');
  lines.push(`MODEL_API_BASE=${config.MODEL_API_BASE || ''}`);
  lines.push(`MODEL_API_KEY=${config.MODEL_API_KEY || ''}`);
  lines.push(`MODEL_NAME=${config.MODEL_NAME || ''}`);
  lines.push('');
  lines.push('# Feishu (长连接模式)');
  lines.push(`FEISHU_APP_ID=${config.FEISHU_APP_ID || ''}`);
  lines.push(`FEISHU_APP_SECRET=${config.FEISHU_APP_SECRET || ''}`);
  lines.push('');
  lines.push('# Feishu Reaction (表情回复配置)');
  lines.push(`FEISHU_REACTION_ENABLED=${config.FEISHU_REACTION_ENABLED || 'true'}`);
  lines.push(`FEISHU_REACTION_RECEIVED_EMOJI=${config.FEISHU_REACTION_RECEIVED_EMOJI || 'THUMBSUP'}`);
  lines.push(`FEISHU_REACTION_PROCESSING_EMOJI=${config.FEISHU_REACTION_PROCESSING_EMOJI || 'WOW'}`);
  lines.push(`FEISHU_REACTION_SUCCESS_EMOJI=${config.FEISHU_REACTION_SUCCESS_EMOJI || 'OK'}`);
  lines.push(`FEISHU_REACTION_ERROR_EMOJI=${config.FEISHU_REACTION_ERROR_EMOJI || 'SORROW'}`);
  lines.push(`FEISHU_REACTION_SHOW_RECEIVED=${config.FEISHU_REACTION_SHOW_RECEIVED || 'true'}`);
  lines.push(`FEISHU_REACTION_SHOW_PROCESSING=${config.FEISHU_REACTION_SHOW_PROCESSING || 'true'}`);
  lines.push(`FEISHU_REACTION_SHOW_RESULT=${config.FEISHU_REACTION_SHOW_RESULT || 'true'}`);
  lines.push('');
  lines.push('# Logging');
  lines.push(`LOG_LEVEL=${config.LOG_LEVEL || 'info'}`);
  lines.push('');
  
  fs.writeFileSync(envPath, lines.join('\n'));
  console.log('✅ 配置已保存到 .env 文件\n');
}

// 显示配置摘要
function showSummary(config) {
  console.log('📋 配置摘要:\n');
  console.log(`  表情回复: ${config.FEISHU_REACTION_ENABLED === 'true' ? '✅ 已启用' : '❌ 已禁用'}`);
  
  if (config.FEISHU_REACTION_ENABLED === 'true') {
    console.log(`  收到消息: ${EMOJI_MAP[config.FEISHU_REACTION_RECEIVED_EMOJI]} (${config.FEISHU_REACTION_RECEIVED_EMOJI})`);
    console.log(`  处理中: ${EMOJI_MAP[config.FEISHU_REACTION_PROCESSING_EMOJI]} (${config.FEISHU_REACTION_PROCESSING_EMOJI})`);
    console.log(`  成功: ${EMOJI_MAP[config.FEISHU_REACTION_SUCCESS_EMOJI]} (${config.FEISHU_REACTION_SUCCESS_EMOJI})`);
    console.log(`  失败: ${EMOJI_MAP[config.FEISHU_REACTION_ERROR_EMOJI]} (${config.FEISHU_REACTION_ERROR_EMOJI})`);
    console.log(`  显示收到: ${config.FEISHU_REACTION_SHOW_RECEIVED === 'true' ? '✅' : '❌'}`);
    console.log(`  显示处理中: ${config.FEISHU_REACTION_SHOW_PROCESSING === 'true' ? '✅' : '❌'}`);
    console.log(`  显示结果: ${config.FEISHU_REACTION_SHOW_RESULT === 'true' ? '✅' : '❌'}`);
  }
  
  console.log('');
}

// 主函数
async function main() {
  // 读取当前配置
  const currentConfig = readCurrentConfig();
  
  console.log('📝 当前配置:\n');
  showSummary(currentConfig);
  
  console.log('💡 配置说明:\n');
  console.log('  - 表情回复让用户知道消息处理状态');
  console.log('  - 收到消息: 立即反馈，让用户知道消息已被接收');
  console.log('  - 处理中: 减少等待焦虑');
  console.log('  - 结果: 快速了解处理成功或失败');
  console.log('');
  
  console.log('🎨 表情选项:\n');
  Object.entries(EMOJI_MAP).forEach(([code, emoji]) => {
    console.log(`  ${emoji}  ${code}`);
  });
  console.log('');
  
  console.log('💡 提示: 直接编辑 .env 文件可以更灵活地配置\n');
  
  // 显示示例配置
  console.log('📄 示例配置:\n');
  console.log('  # 启用表情回复');
  console.log('  FEISHU_REACTION_ENABLED=true');
  console.log('  ');
  console.log('  # 收到消息: 👍');
  console.log('  FEISHU_REACTION_RECEIVED_EMOJI=THUMBSUP');
  console.log('  FEISHU_REACTION_SHOW_RECEIVED=true');
  console.log('  ');
  console.log('  # 处理中: 😮');
  console.log('  FEISHU_REACTION_PROCESSING_EMOJI=WOW');
  console.log('  FEISHU_REACTION_SHOW_PROCESSING=true');
  console.log('  ');
  console.log('  # 成功: 👌');
  console.log('  FEISHU_REACTION_SUCCESS_EMOJI=OK');
  console.log('  FEISHU_REACTION_SHOW_RESULT=true');
  console.log('  ');
  console.log('  # 失败: 😢');
  console.log('  FEISHU_REACTION_ERROR_EMOJI=SORROW');
  console.log('');
  
  console.log('🔄 更新配置后，重启服务生效:\n');
  console.log('  pm2 restart mini-claw');
  console.log('  # 或');
  console.log('  npm run restart');
  console.log('');
}

// 运行
main().catch(console.error);
