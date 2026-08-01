import React, { useState, useRef, useEffect } from "react";
import { streamChat, ChatMessage } from "@/utils/chatStream";
import ChatMarkdown from "./ChatMarkDown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const AIChatWindow: React.FC = () => {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

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
      sessionId: currentSessionId ?? undefined,
      signal: controller.signal,
      onChunk: (chunk) => {
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
      onMeta: ({ sessionId }) => {
        setCurrentSessionId(sessionId);
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
    // 1. 整体容器：改为 flex-col 纵向布局，锁定全屏高度，禁止整体滚动
    <div className="flex flex-col h-screen w-full bg-background text-foreground overflow-hidden">
      {/* 2. 聊天消息区域：占据剩余空间 (flex-1)，内容溢出时内部滚动 */}
      <main className="flex-1 overflow-y-auto p-6 relative custom-scrollbar">
        {messages.map((msg, index) => {
          const isUser = msg.role === "user";
          const isPendingAssistant =
            !isUser &&
            msg.content === "" &&
            isLoading &&
            index === messages.length - 1; // 最后一条消息是正在生成的 AI 消息

          return (
            <div
              key={index}
              className={`flex mb-4 ${isUser ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`
                max-w-[100%] px-4 py-3 rounded-lg text-sm leading-relaxed shadow-sm
                /* 用户消息样式：淡蓝背景 + 深色文字 */
                ${
                  isUser
                    ? "bg-blue-50 text-slate-900 border border-blue-100"
                    : "bg-muted/50 border border-border"
                }
              `}
              >
                {isPendingAssistant ? (
                  <span className="text-muted-foreground animate-pulse">
                    正在思考中...
                  </span>
                ) : isUser ? (
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                ) : (
                  <ChatMarkdown content={msg.content} />
                )}
              </div>
            </div>
          );
        })}
        {/* 自动滚动锚点 */}
        <div ref={messagesEndRef} />
      </main>

      {/* 3. 底部输入区域：固定在下方，不随上方滚动 */}
      <footer className="p-4 bg-card border-t border-border shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10">
        <div className="flex gap-2 items-end max-w-4xl mx-auto">
          <Textarea
            value={input}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              setInput(e.target.value)
            }
            placeholder="向 AI 提问关于这篇笔记的问题..."
            className="min-h-[60px] resize-none flex-1 bg-background" // 稍微调低一点最小高度以适应横向布局
          />

          {/* 按钮根据状态切换 */}
          {isLoading ? (
            <Button
              variant="destructive"
              onClick={handleStop}
              className="h-[60px] shrink-0 px-6"
            >
              停止
            </Button>
          ) : (
            <Button
              onClick={handleSend}
              disabled={!input.trim()}
              className="h-[60px] shrink-0 px-6"
            >
              发送
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
};

export default AIChatWindow;
