import React, { useState, useRef, useEffect } from "react";
import { streamChat, ChatMessage } from "@/utils/chatStream";
import ChatMarkdown from "./ChatMarkDown";
import { Input, Button, Space, Layout } from "antd";
import { SendOutlined, StopOutlined } from "@ant-design/icons";
import { Content } from "antd/es/layout/layout";

const AIChatWindow: React.FC = () => {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 用于控制请求中断
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    // 1. 准备消息历史
    const userMsg: ChatMessage = { role: "user", content: trimmedInput };
    const updatedHistory = [...messages, userMsg];

    // 2. 更新 UI：显示用户消息 + 占位的 AI 消息
    setMessages([...updatedHistory, { role: "assistant", content: "" }]);
    setInput("");
    setIsLoading(true);

    // 3. 创建新的 AbortController
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // 4. 调用流式接口
    await streamChat({
      messages: updatedHistory,
      signal: controller.signal,
      onChunk: (chunk) => {
        // 核心：将接收到的片段实时追加到最后一条 AI 消息中
        // 🌟 核心修改：只要接收到第一个非空字符，立刻取消 Loading
        if (isLoading && chunk.trim().length > 0) {
          setIsLoading(false);
        }
        setMessages((prev) => {
          const newMessages = [...prev];
          const lastMsg = newMessages[newMessages.length - 1];
          if (lastMsg && lastMsg.role === "assistant") {
            lastMsg.content += chunk;
          }
          return newMessages;
        });
      },
      onComplete: () => {
        setIsLoading(false);
        abortControllerRef.current = null;
      },
      onError: (err) => {
        console.error("流式请求出错:", err);
        setIsLoading(false);
        abortControllerRef.current = null;
      },
    });
  };

  // 停止生成
  const handleStop = () => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
  };

  return (
    <Layout
      style={{
        height: "100vh", // 1. 设置整体容器高度为视口高度
        display: "flex",
        flexDirection: "column", // 2. 核心：使用 Flex 纵向布局
      }}
    >
      <Content
        style={{
          flex: 1, // 3. 核心：占据父容器除固定高度外的所有剩余空间
          overflow: "auto", // 4. 防止内容过多时撑破布局，超出部分显示滚动条
          padding: "24px",
          backgroundColor: "#fff",
        }}
      >
        {messages.map((msg, index) => {
          const isUser = msg.role === "user";
          // 判断是否是正在生成中的 AI 消息
          const isPendingAssistant = !isUser && msg.content === "" && isLoading;

          return (
            <div
              key={index}
              style={{
                display: "flex",
                justifyContent: isUser ? "flex-end" : "flex-start",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  maxWidth: isUser ? "80%" : "90%", // 限制最大宽度，防止超长内容撑满屏幕
                  padding: "12px 16px",
                  borderRadius: 8,
                  fontSize: 14,
                  lineHeight: 1.6,
                  backgroundColor: isUser ? "#e6f4ff" : "transparent", // 淡蓝色背景 (Antd 默认主题色淡色)
                  color: isUser ? "#000" : "#333", // 用户消息文字颜色
                }}
              >
                {/* 1. 占位状态：显示 Loading */}
                {isPendingAssistant ? (
                  <span className="loading-dots" style={{ color: "#999" }}>
                    正在思考中
                  </span>
                ) : /* 2. 正常状态：渲染内容 */
                isUser ? (
                  msg.content
                ) : (
                  <ChatMarkdown content={msg.content} />
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </Content>
      <div
        style={{
          height: "100px", // 5. 明确指定底部容器高度
          width: "100%", // 6. 宽度自适应
          backgroundColor: "#f0f2f5",
          padding: "24px",
          boxSizing: "border-box", // 7. 防止 padding 导致高度超出 100px
        }}
      >
        <Space.Compact style={{ width: "100%" }}>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPressEnter={handleSend}
            placeholder="向 AI 提问关于这篇笔记的问题..."
          />
          {isLoading ? (
            <Button
              type="primary"
              danger
              onClick={handleStop}
              icon={<StopOutlined />}
            />
          ) : (
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSend}
              disabled={!input.trim()}
            />
          )}
        </Space.Compact>
      </div>
    </Layout>
  );
};

export default AIChatWindow;
