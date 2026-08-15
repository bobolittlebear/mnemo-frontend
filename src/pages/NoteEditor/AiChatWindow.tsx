import React, { useState, useRef, useEffect } from "react";
import { streamChat, ChatMessage } from "@/utils/chatStream";
import {
  getSessions,
  getConversationMessages,
  archiveSession,
} from "@/api/conversation";
import type { Session } from "@/api/conversation";
import { truncateTitle } from "@/lib/utils";
import {
  ChevronDown,
  Check,
  Loader2,
  MessageSquare,
  Archive,
  Plus,
} from "lucide-react";
import ChatMarkdown from "./ChatMarkDown";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const AIChatWindow: React.FC = () => {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // 派生：当前激活会话的 id 与标题（新建会话流式期间由 currentSessionId 接管展示）
  const activeSessionId = selectedSession?.sessionId ?? currentSessionId;
  const activeTitle =
    selectedSession?.title ??
    sessions.find((s) => s.sessionId === currentSessionId)?.title ??
    null;

  // 用于控制请求中断
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 挂载时拉取会话列表，默认选中第一条会话
  useEffect(() => {
    const ac = new AbortController();

    const loadSessions = async () => {
      setIsLoadingSessions(true);
      try {
        const res = await getSessions({ signal: ac.signal });
        const list = res.data.list;
        setSessions(list);
        if (list.length > 0) {
          setSelectedSession(list[0]);
        }
      } catch (err) {
        if (!ac.signal.aborted) {
          console.error("获取会话列表失败:", err);
        }
      } finally {
        if (!ac.signal.aborted) {
          setIsLoadingSessions(false);
        }
      }
    };

    loadSessions();

    return () => ac.abort();
  }, []);

  // 切换会话时拉取历史消息
  useEffect(() => {
    const sessionId = selectedSession?.sessionId;

    if (!sessionId) {
      return;
    }

    const ac = new AbortController();

    (async () => {
      setIsLoadingHistory(true);
      setCurrentSessionId(sessionId);
      try {
        const res = await getConversationMessages(
          { session_id: sessionId },
          { signal: ac.signal },
        );
        setMessages(
          res.data.map((m) => ({ role: m.role, content: m.content })),
        );
      } catch (err) {
        if (!ac.signal.aborted) {
          console.error("获取会话历史失败:", err);
        }
      } finally {
        if (!ac.signal.aborted) {
          setIsLoadingHistory(false);
        }
      }
    })();

    return () => ac.abort();
  }, [selectedSession?.sessionId]);

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

    console.log("currentSessionId", currentSessionId);

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
      onMeta: ({ sessionId, title }) => {
        setCurrentSessionId(sessionId);
        // 后端新建/修正会话：upsert 到列表，已存在则更新 title，否则头部插入
        setSessions((prev) => {
          const existing = prev.find((s) => s.sessionId === sessionId);
          if (existing) {
            return prev.map((s) =>
              s.sessionId === sessionId ? { ...s, title } : s,
            );
          }
          const now = new Date().toISOString();
          return [
            { sessionId, title, createdAt: now, lastActiveAt: now },
            ...prev,
          ];
        });
        // 不在此处 setSelectedSession：避免触发历史重载，覆盖正在流式生成的内容
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

  // 归档会话
  const handleArchive = async (sessionId: string) => {
    const wasActiveSession =
      sessionId === selectedSession?.sessionId ||
      sessionId === currentSessionId;

    try {
      await archiveSession(sessionId);

      // 从会话列表中移除已归档的会话
      setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));

      // 如果被归档的是当前正在查看的会话，重置为新会话视图
      if (wasActiveSession) {
        setSelectedSession(null);
        setCurrentSessionId(null);
        setMessages([]);
      }
    } catch (err) {
      console.error("归档会话失败:", err);
    }
  };

  // 新建会话
  const handleNewSession = () => {
    setSelectedSession(null);
    setCurrentSessionId(null);
    setMessages([]);
  };

  return (
    // 1. 整体容器：改为 flex-col 纵向布局，锁定全屏高度，禁止整体滚动
    <div className="flex flex-col h-screen w-full bg-background text-foreground overflow-hidden">
      {/* 1. 顶部会话选择器：固定 48px 高度，宽度自适应 */}
      <header className="flex items-center h-12 w-full px-4 border-b border-border bg-background shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 text-sm">
            {isLoadingSessions ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                加载中…
              </>
            ) : (
              <span>{activeTitle ? truncateTitle(activeTitle) : "新对话"}</span>
            )}
            <ChevronDown className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            sideOffset={4}
            className="min-w-[12rem]"
          >
            {!isLoadingSessions && sessions.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">
                暂无会话
              </p>
            ) : (
              sessions.map((s) => (
                <DropdownMenuItem
                  key={s.sessionId}
                  onSelect={(e) => {
                    // 如果这次 select 是由归档按钮触发的，跳过
                    if (
                      (e?.target as HTMLElement)?.closest?.(
                        "[data-archive-btn]",
                      )
                    ) {
                      e?.preventDefault?.(); // 阻止 Radix 的默认选中+关闭行为
                      return;
                    }
                    setSelectedSession(s);
                    setCurrentSessionId(s.sessionId);
                  }}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate">{truncateTitle(s.title)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.sessionId === activeSessionId && (
                      <Check className="h-4 w-4" />
                    )}
                    <button
                      type="button"
                      className="p-1 hover:bg-muted rounded"
                      aria-label="归档会话"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleArchive(s.sessionId);
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <Archive className="h-4 w-4" />
                    </button>
                  </div>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          onClick={handleNewSession}
          disabled={isLoading}
          className="ml-auto flex items-center gap-1 h-8 px-3 text-sm rounded-md hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="h-4 w-4" />
          新建会话
        </button>
      </header>

      {/* 2. 聊天消息区域：占据剩余空间 (flex-1)，内容溢出时内部滚动 */}
      <main className="flex-1 overflow-y-auto p-6 relative custom-scrollbar">
        {isLoadingHistory ? (
          <div className="flex justify-center items-center h-full text-muted-foreground text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在载入历史消息…
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <MessageSquare className="h-8 w-8" />
            <p className="text-sm">
              {selectedSession || currentSessionId
                ? "还没有消息，开始聊天吧"
                : "开始一场新对话"}
            </p>
          </div>
        ) : (
          messages.map((msg, index) => {
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
          })
        )}
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
