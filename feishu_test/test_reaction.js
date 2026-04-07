/**
 * Feishu Reaction Test - 测试表情回复功能
 * 
 * 运行方式: node feishu_test/test_reaction.js
 */

import dotenv from 'dotenv';
import * as Lark from '@larksuiteoapi/node-sdk';

dotenv.config();

// 表情类型映射
const EMOJI_TYPES = {
  'THUMBSUP': '👍',
  'HEART': '❤️',
  'LAUGH': '😂',
  'OK': '👌',
  'WOW': '😮',
  'SORROW': '😢',
  'ANGRY': '😡',
};

// 配置
const config = {
  app_id: process.env.FEISHU_APP_ID,
  app_secret: process.env.FEISHU_APP_SECRET,
  reaction: {
    enabled: process.env.FEISHU_REACTION_ENABLED === 'true',
    receivedEmoji: process.env.FEISHU_REACTION_RECEIVED_EMOJI || 'THUMBSUP',
    processingEmoji: process.env.FEISHU_REACTION_PROCESSING_EMOJI || 'WOW',
    successEmoji: process.env.FEISHU_REACTION_SUCCESS_EMOJI || 'OK',
    errorEmoji: process.env.FEISHU_REACTION_ERROR_EMOJI || 'SORROW',
  }
};

console.log('🦞 MiniClaw 飞书表情回复测试\n');

// 验证配置
if (!config.app_id || !config.app_secret) {
  console.error('❌ 缺少飞书配置，请检查 .env 文件');
  process.exit(1);
}

console.log('📋 配置信息:');
console.log(`  App ID: ${config.app_id}`);
console.log(`  表情回复: ${config.reaction.enabled ? '已启用' : '已禁用'}`);
console.log(`  收到消息表情: ${EMOJI_TYPES[config.reaction.receivedEmoji]} (${config.reaction.receivedEmoji})`);
console.log(`  处理中表情: ${EMOJI_TYPES[config.reaction.processingEmoji]} (${config.reaction.processingEmoji})`);
console.log(`  成功表情: ${EMOJI_TYPES[config.reaction.successEmoji]} (${config.reaction.successEmoji})`);
console.log(`  失败表情: ${EMOJI_TYPES[config.reaction.errorEmoji]} (${config.reaction.errorEmoji})`);
console.log('');

// 创建客户端
const client = new Lark.Client({
  appId: config.app_id,
  appSecret: config.app_secret,
  appType: Lark.AppType.SelfBuild,
  domain: Lark.Domain.Feishu,
});

/**
 * 测试添加表情回复
 */
async function testAddReaction(messageId, emojiType) {
  try {
    console.log(`\n测试添加表情: ${EMOJI_TYPES[emojiType]} (${emojiType})`);
    
    const result = await client.im.messageReaction.create({
      path: {
        message_id: messageId,
      },
      params: {
        user_id_type: 'open_id',
      },
      data: {
        reaction_type: {
          emoji_type: emojiType
        }
      }
    });
    
    if (result.code === 0) {
      console.log('✅ 添加成功');
      return true;
    } else {
      console.log(`❌ 添加失败: ${result.msg}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ 添加异常: ${error.message}`);
    return false;
  }
}

/**
 * 测试获取表情列表
 */
async function testGetReactions(messageId) {
  try {
    console.log('\n测试获取表情列表:');
    
    const result = await client.im.messageReaction.list({
      path: {
        message_id: messageId,
      },
      params: {
        user_id_type: 'open_id',
      },
    });
    
    if (result.code === 0) {
      const items = result.data?.items || [];
      console.log(`✅ 获取成功，共 ${items.length} 个表情`);
      
      items.forEach((item, index) => {
        const emoji = EMOJI_TYPES[item.reaction_type?.emoji_type] || item.reaction_type?.emoji_type;
        console.log(`  ${index + 1}. ${emoji} (${item.reaction_type?.emoji_type}) - ${item.user_count} 人`);
      });
      
      return items;
    } else {
      console.log(`❌ 获取失败: ${result.msg}`);
      return [];
    }
  } catch (error) {
    console.log(`❌ 获取异常: ${error.message}`);
    return [];
  }
}

/**
 * 测试移除表情回复
 */
async function testRemoveReaction(messageId, emojiType) {
  try {
    console.log(`\n测试移除表情: ${EMOJI_TYPES[emojiType]} (${emojiType})`);
    
    const result = await client.im.messageReaction.delete({
      path: {
        message_id: messageId,
      },
      params: {
        user_id_type: 'open_id',
      },
      data: {
        reaction_type: {
          emoji_type: emojiType
        }
      }
    });
    
    if (result.code === 0) {
      console.log('✅ 移除成功');
      return true;
    } else {
      console.log(`❌ 移除失败: ${result.msg}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ 移除异常: ${error.message}`);
    return false;
  }
}

/**
 * 运行测试
 */
async function runTests() {
  console.log('🧪 开始测试表情回复功能\n');
  console.log('=' .repeat(60));
  
  // 提示用户输入消息 ID
  console.log('\n📝 测试说明:');
  console.log('  1. 在飞书中给机器人发送一条消息');
  console.log('  2. 复制消息 ID（在飞书开发者工具中查看）');
  console.log('  3. 使用消息 ID 进行测试\n');
  
  // 如果提供了消息 ID，直接测试
  const testMessageId = process.argv[2];
  
  if (testMessageId) {
    console.log(`使用消息 ID: ${testMessageId}\n`);
    
    // 测试添加表情
    await testAddReaction(testMessageId, 'THUMBSUP');
    
    // 等待一下
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 测试获取表情列表
    await testGetReactions(testMessageId);
    
    // 等待一下
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 测试移除表情
    await testRemoveReaction(testMessageId, 'THUMBSUP');
    
  } else {
    console.log('💡 提示: 使用以下命令测试特定消息:');
    console.log('  node feishu_test/test_reaction.js <message_id>\n');
    
    // 测试获取机器人信息
    console.log('📡 测试获取机器人信息...');
    try {
      const result = await client.bot.userInfo.get();
      if (result.code === 0 && result.data?.bot) {
        console.log('✅ 机器人信息:');
        console.log(`  名称: ${result.data.bot.app_name}`);
        console.log(`  Open ID: ${result.data.bot.open_id}`);
      } else {
        console.log(`❌ 获取失败: ${result.msg}`);
      }
    } catch (error) {
      console.log(`❌ 获取异常: ${error.message}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ 测试完成\n');
}

// 运行测试
runTests().catch(console.error);
