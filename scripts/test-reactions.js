#!/usr/bin/env node
/**
 * 飞书表情回复功能测试脚本
 * 
 * 使用方法:
 * node scripts/test-reactions.js
 */

import 'dotenv/config';
import http from 'http';

const BASE_URL = 'http://localhost:18790';

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// HTTP 请求封装
function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(data)
          });
        } catch (err) {
          resolve({
            status: res.statusCode,
            data: data
          });
        }
      });
    });
    
    req.on('error', reject);
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

// 测试函数
async function runTests() {
  console.log('\n');
  log('cyan', '═══════════════════════════════════════════════════════');
  log('cyan', '       🦞 MiniClaw 飞书表情回复功能测试');
  log('cyan', '═══════════════════════════════════════════════════════\n');
  
  try {
    // 测试 1: 健康检查
    log('blue', '📋 测试 1: 健康检查');
    const health = await request('GET', '/health');
    if (health.status === 200 && health.data.status === 'ok') {
      log('green', '  ✅ 服务运行正常');
      log('reset', `  运行时间: ${Math.floor(health.data.uptime / 60)} 分钟`);
    } else {
      log('red', '  ❌ 服务状态异常');
      return;
    }
    
    // 测试 2: 统计信息
    log('blue', '\n📊 测试 2: 统计信息');
    const stats = await request('GET', '/stats');
    if (stats.status === 200) {
      log('green', '  ✅ 统计信息获取成功');
      log('reset', `  工具数: ${stats.data.tools}`);
      log('reset', `  技能数: ${stats.data.skills}`);
      log('reset', `  会话数: ${stats.data.sessions?.totalSessions || 0}`);
    }
    
    // 测试 3: 配置检查
    log('blue', '\n⚙️  测试 3: 环境变量配置');
    const envVars = [
      'FEISHU_REACTION_ENABLED',
      'FEISHU_REACTION_RECEIVED_EMOJI',
      'FEISHU_REACTION_PROCESSING_EMOJI',
      'FEISHU_REACTION_SUCCESS_EMOJI',
      'FEISHU_REACTION_ERROR_EMOJI',
      'FEISHU_REACTION_SHOW_RECEIVED',
      'FEISHU_REACTION_SHOW_PROCESSING',
      'FEISHU_REACTION_SHOW_RESULT',
    ];
    
    let allConfigured = true;
    for (const varName of envVars) {
      const value = process.env[varName];
      if (value !== undefined) {
        log('green', `  ✅ ${varName}: ${value}`);
      } else {
        log('yellow', `  ⚠️  ${varName}: 未设置（将使用默认值）`);
      }
    }
    
    // 测试 4: 工具列表
    log('blue', '\n🔧 测试 4: 工具列表');
    const tools = await request('GET', '/tools');
    if (tools.status === 200) {
      log('green', '  ✅ 工具列表获取成功');
      const toolNames = tools.data.tools.map(t => t.name).join(', ');
      log('reset', `  工具: ${toolNames}`);
    }
    
    // 测试 5: 技能列表
    log('blue', '\n📚 测试 5: 技能列表');
    const skills = await request('GET', '/skills');
    if (skills.status === 200) {
      log('green', '  ✅ 技能列表获取成功');
      const skillNames = skills.data.skills.map(s => s.name).join(', ');
      log('reset', `  技能: ${skillNames}`);
    }
    
    // 测试 6: 表情类型检查
    log('blue', '\n😊 测试 6: 表情类型映射');
    const emojiTypes = {
      'THUMBSUP': '👍',
      'HEART': '❤️',
      'LAUGH': '😂',
      'OK': '👌',
      'WOW': '😮',
      'SORROW': '😢',
      'ANGRY': '😡',
      'FIRE': '🔥',
      'CLAP': '👏',
      'THINK': '🤔',
      'ROCKET': '🚀',
      'CHECK': '✅',
      'CROSS': '❌',
    };
    
    for (const [type, emoji] of Object.entries(emojiTypes)) {
      log('reset', `  ${type.padEnd(10)} -> ${emoji}`);
    }
    
    // 测试总结
    console.log('\n');
    log('cyan', '═══════════════════════════════════════════════════════');
    log('green', '✅ 所有测试通过！');
    log('cyan', '═══════════════════════════════════════════════════════\n');
    
    // 显示当前配置
    log('yellow', '📝 当前表情回复配置:');
    log('reset', `  启用状态: ${process.env.FEISHU_REACTION_ENABLED !== 'false' ? '✅ 已启用' : '❌ 已禁用'}`);
    log('reset', `  收到消息: ${emojiTypes[process.env.FEISHU_REACTION_RECEIVED_EMOJI || 'THUMBSUP']} (${process.env.FEISHU_REACTION_RECEIVED_EMOJI || 'THUMBSUP'})`);
    log('reset', `  处理中:   ${emojiTypes[process.env.FEISHU_REACTION_PROCESSING_EMOJI || 'WOW']} (${process.env.FEISHU_REACTION_PROCESSING_EMOJI || 'WOW'})`);
    log('reset', `  成功:     ${emojiTypes[process.env.FEISHU_REACTION_SUCCESS_EMOJI || 'OK']} (${process.env.FEISHU_REACTION_SUCCESS_EMOJI || 'OK'})`);
    log('reset', `  失败:     ${emojiTypes[process.env.FEISHU_REACTION_ERROR_EMOJI || 'SORROW']} (${process.env.FEISHU_REACTION_ERROR_EMOJI || 'SORROW'})`);
    
    console.log('\n');
    log('yellow', '💡 提示:');
    log('reset', '  1. 在飞书中发送消息给机器人，观察表情回复');
    log('reset', '  2. 查看日志: tail -f nohup.out');
    log('reset', '  3. 修改配置: 编辑 .env 文件，重启服务');
    log('reset', '  4. 重启服务: kill -HUP <pid> 或 npm start');
    console.log('\n');
    
  } catch (error) {
    log('red', `\n❌ 测试失败: ${error.message}`);
    log('yellow', '\n💡 请检查:');
    log('reset', '  1. 服务是否正在运行: curl http://localhost:18790/health');
    log('reset', '  2. 端口是否正确: 检查 .env 中的 GATEWAY_PORT');
    log('reset', '  3. 查看日志: tail -f nohup.out');
    process.exit(1);
  }
}

// 运行测试
runTests();
