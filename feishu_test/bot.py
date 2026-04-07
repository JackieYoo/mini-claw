

# 飞书长连接机器人 - 2024最新版
import os
import json

# ========== 在这里填写你的配置 ==========
FEISHU_APP_ID = "cli_a92fdd8b95f99cc4"           # 改成你的
FEISHU_APP_SECRET = "OjGHayDt8MUAJO7czWrp4gnTrT2QYTQJ"       # 改成你的
# =======================================

print("🤖 飞书长连接机器人启动中...")
print(f"App ID: {FEISHU_APP_ID[:15]}...")

# 导入飞书SDK（最新版 API）
import lark_oapi as lark
from lark_oapi import EventDispatcherHandler, ws, JSON, im, LogLevel

# 处理接收到的消息（v2.0事件）
def do_p2_im_message_receive_v1(data: lark.im.v1.P2ImMessageReceiveV1) -> None:
    print(f"\n📩 收到消息事件")
    
    # 解析消息内容
    data_dict = json.loads(JSON.marshal(data))
    message = data_dict.get("event", {}).get("message", {})
    
    chat_id = message.get("chat_id")
    msg_type = message.get("message_type")
    content_str = message.get("content", "{}")
    message_id = message.get("message_id")
    
    # 解析文本内容
    try:
        content = json.loads(content_str)
        text = content.get("text", "")
    except:
        text = content_str
    
    print(f"   内容: {text}")
    print(f"   群聊ID: {chat_id}")
    print(f"   消息类型: {msg_type}")
    
    # 简单的自动回复（这里只是打印，如需真正回复需要调用API）
    print(f"   🤖 准备回复: 收到你的消息: {text[:50]}")

# 处理 v1.0 版本的事件（可选）
def do_message_event(data: lark.CustomizedEvent) -> None:
    print(f"[ do_customized_event access ], data: {JSON.marshal(data, indent=4)}")

def main():
    # 创建事件处理器（两个参数必须填空字符串！）
    event_handler = EventDispatcherHandler.builder("", "") \
        .register_p2_im_message_receive_v1(do_p2_im_message_receive_v1) \
        .register_p1_customized_event("message", do_message_event) \
        .build()
    
    # 创建长连接客户端
    cli = ws.Client(
        FEISHU_APP_ID, 
        FEISHU_APP_SECRET,
        event_handler=event_handler,
        log_level=LogLevel.DEBUG  # 调试时开启，稳定后可改为 INFO
    )
    
    print("✅ 正在连接飞书服务器...")
    print("   提示：连接成功后这里会阻塞，按 Ctrl+C 停止")
    print("-" * 50)
    
    # 启动连接（阻塞运行）
    cli.start()

if __name__ == "__main__":
    main()
