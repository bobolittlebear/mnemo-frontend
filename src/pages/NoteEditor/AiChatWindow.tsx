import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  streamChat,
  postToolResult,
  type ChatMessage,
} from "@/utils/chatStream";
import type { SSEEventMap } from "@/types/sse";
import type { EditorBridge } from "./editorBridge";
import {
  executeToolCall,
  type PendingToolCall,
  type ToolResultPayload,
} from "./editorExecutor";
import {
  getSessions,
  getConversationMessages,
  archiveSession,
} from "@/api/conversation";
import type { ChatHistoryMessage, Session } from "@/api/conversation";
import { truncateTitle } from "@/lib/utils";
import {
  ChevronDown,
  Check,
  Loader2,
  MessageSquare,
  Archive,
  Plus,
  X,
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

type AIChatWindowProps = {
  /** 当前笔记 id：写模式上下文域字段（Chat 模式下不参与请求） */
  noteId?: string | null;
  /**
   * 编辑器桥工厂：在发送那一刻调用取 bridge（见 handleSend 内的说明）。
   * 未接入编辑器（如仅聊天场景）时可为空。
   */
  getEditorBridge?: () => EditorBridge;
  /** 整 run 锁的开关，落到编辑器的可编辑态 */
  onEditorLockChange?: (locked: boolean) => void;
  /** 头部左侧插槽（如 AI 栏收起按钮）；不传则头部只有会话选择器与新建入口 */
  leftSlot?: React.ReactNode;
};

/**
 * 过程卡：当前 run 内一次工具调用的可视化。
 * 纯 UI 本地态，不进 messages（设计 D3），也不落库；run 结束即整组清空。
 */
type ToolCallCard = {
  toolCallId: string;
  tool: string;
  args: SSEEventMap["tool_call"]["args"];
  status: "pending" | "applied" | "failed";
  error?: string;
};

/**
 * run 生命周期终态提示：tone 决定配色。
 * info=用户主动取消；error=断流/回执失败；warn=后端系统说明（如轮数阀门触顶）。
 */
type RunNotice = { text: string; tone: "info" | "warn" | "error" };

/**
 * 本地消息：历史消息（含写域回放字段）即 UI 消息。
 * mode / runId / toolCalls / result 由后端落库字段带回，是回放折叠（设计 §8.2）的唯一数据源。
 * 注意这些字段只在本地渲染用——发送前必须投影成 {role, content}（见 handleSend）。
 */
type UIMessage = ChatHistoryMessage;

/** 单个工具在一次 run 中的执行结果（回放展示用） */
type FoldedTool = {
  name: string;
  status: "applied" | "failed" | "cancelled";
  error?: string;
};

/** 一次 run 的工具调用折叠摘要（设计 §8.2） */
type ToolFold = {
  count: number;
  summary: string;
  tools: FoldedTool[];
};

/**
 * 派生渲染项：回放时把一次 run 的内部轮折叠掉，只留 user 与最终助手气泡，
 * 最终气泡挂上该 run 的工具折叠摘要。
 */
type RenderItem =
  | { kind: "user"; msg: UIMessage }
  | { kind: "assistant"; msg: UIMessage; fold?: ToolFold };

/**
 * 后端回执 status 只有 applied / cancelled 两种能确认语义，其余（含缺失——
 * run 被打断、回执没落库）一律按 failed 呈现：对用户而言「未能确认生效」比
 * 「已生效」更接近事实，宁可保守。
 */
function normalizeToolStatus(status?: string): FoldedTool["status"] {
  if (status === "applied") return "applied";
  if (status === "cancelled") return "cancelled";
  return "failed";
}

/** 组装一次 run 的折叠摘要：文案按「全部生效 / 含失败 / 含取消」三态区分 */
function buildFold(
  tools: Array<{ name?: string; status?: string; error?: string }>,
): ToolFold {
  const folded: FoldedTool[] = tools.map((tool) => ({
    name: tool.name || "未知工具",
    status: normalizeToolStatus(tool.status),
    error: tool.error,
  }));

  const failed = folded.filter((t) => t.status === "failed").length;
  const cancelled = folded.filter((t) => t.status === "cancelled").length;
  const lead = folded[0]?.name ?? "工具";
  // 单个工具时不写「X 等 1 个工具」，中文读不通
  const leadText =
    folded.length === 1 ? lead : `${lead} 等 ${folded.length} 个工具`;

  let summary: string;
  if (failed === 0 && cancelled === 0) {
    summary = `调用了 ${leadText}，均已生效`;
  } else {
    const parts: string[] = [];
    if (failed > 0) parts.push(`${failed} 个失败`);
    if (cancelled > 0) parts.push(`${cancelled} 个已取消`);
    summary = `调用了 ${folded.length} 个工具，${parts.join("，")}`;
  }

  return { count: folded.length, summary, tools: folded };
}

/**
 * 把历史消息列表压成渲染列表（纯函数，组件内用 useMemo 取）。
 *
 * 折叠规则（设计 §8.2）：role:'tool' 的内部消息、以及带 toolCalls 的 assistant
 * 内部轮都不单独渲染；每个 run 的工具结果按 runId 聚合，挂到该 run 的最终回复气泡上。
 * 按 runId 索引而不是按数组物理位置，多 run 交错也正确，且与消息顺序的脏数据无关。
 */
function buildRenderItems(messages: UIMessage[]): RenderItem[] {
  // ① toolCallId → 工具名：工具名只存在于 assistant 内部轮的 toolCalls[].name，
  //    而 role:'tool' 消息只有 toolCallId，必须反查
  const nameByCallId = new Map<string, string>();
  // ② runId → 该 run 下每个工具的结果（键统一用 null 表示「无 runId」）
  const toolsByRun = new Map<
    string | null,
    Array<{ name?: string; status?: string; error?: string }>
  >();

  // 先整体收工具名，再收工具结果：两趟而不是一趟，保证反查不受消息先后顺序影响
  // （工具消息若排在其 assistant 内部轮之前，一趟扫描会查不到名字）
  for (const m of messages) {
    if (m.role === "assistant" && m.toolCalls?.length) {
      for (const tc of m.toolCalls) {
        if (tc.id) nameByCallId.set(tc.id, tc.name ?? "");
      }
    }
  }

  for (const m of messages) {
    if (m.role !== "tool") continue;
    const runKey = m.runId ?? null;
    const list = toolsByRun.get(runKey) ?? [];
    list.push({
      name: m.toolCallId ? nameByCallId.get(m.toolCallId) : undefined,
      status: m.result?.status,
      error: m.result?.error,
    });
    toolsByRun.set(runKey, list);
  }

  const items: RenderItem[] = [];
  for (const m of messages) {
    if (m.role === "tool") continue; // 工具内部消息不单独成气泡
    if (m.role === "assistant" && m.toolCalls?.length) continue; // 工具轮不单独成气泡
    // 只有 user 走右对齐蓝底；其余（assistant / system）沿用原来的左侧气泡分支
    if (m.role === "user") {
      items.push({ kind: "user", msg: m });
      continue;
    }
    // 最终回复轮：按 runId 找本 run 的工具结果（chat 模式无 runId → 空 → 不折叠）
    const tools = toolsByRun.get(m.runId ?? null) ?? [];
    items.push({
      kind: "assistant",
      msg: m,
      fold: tools.length > 0 ? buildFold(tools) : undefined,
    });
  }
  return items;
}

/** 回放折叠摘要：默认只显示一行汇总，点击展开每个工具名与状态 */
const FoldSummary: React.FC<{ fold: ToolFold }> = ({ fold }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-2 pt-2 border-t border-border/60 text-xs">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronDown
          className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
        <span>{fold.summary}</span>
      </button>

      {expanded && (
        <ul className="mt-1.5 flex flex-col gap-1 pl-4">
          {fold.tools.map((tool, index) => (
            <li
              key={`${tool.name}-${index}`}
              className="flex items-center gap-2 min-w-0"
            >
              <span className="font-mono shrink-0">{tool.name}</span>
              {tool.status === "applied" ? (
                <span className="flex items-center gap-1 shrink-0 text-emerald-600">
                  <Check className="h-3 w-3" />
                  已生效
                </span>
              ) : tool.status === "cancelled" ? (
                <span className="flex items-center gap-1 shrink-0 text-muted-foreground">
                  <X className="h-3 w-3" />
                  已取消
                </span>
              ) : (
                <span className="flex items-center gap-1 shrink-0 text-destructive">
                  <X className="h-3 w-3" />
                  失败
                </span>
              )}
              {tool.error && (
                <span className="truncate text-destructive">{tool.error}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** 过程卡参数预览：对象序列化后按 80 字截断 */
const summarizeArgs = (args: SSEEventMap["tool_call"]["args"]): string => {
  const text = typeof args === "string" ? args : JSON.stringify(args);
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
};

const AIChatWindow: React.FC<AIChatWindowProps> = ({
  noteId,
  getEditorBridge,
  onEditorLockChange,
  leftSlot,
}) => {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  // 整 run 锁（设计 §3.3）：run 进行中发送框禁用，只留「取消本次」出口
  const [isRunLocked, setIsRunLocked] = useState(false);
  // 当前 run 的工具调用过程（设计 §8.1）：随事件实时追加，执行回执回填状态。
  // 整 run 锁下同时只会有一个激活 run，故单数组即对应「当前 run」，无需按 runId 分桶
  const [toolCallCards, setToolCallCards] = useState<ToolCallCard[]>([]);
  // run 生命周期终态提示（取消/断流/回执失败/后端收尾说明）：仅本地提示，不进 messages——
  // 后端已把收尾文案落库为可见消息，前端再拼一条会在重载历史后重复
  const [runNotice, setRunNotice] = useState<RunNotice | null>(null);
  // run_paused 窗口（本地执行 + 回执往返）：只用于状态条区分「生成文本」与「执行工具」，
  // 不是整 run 的 loading，且不得据此禁用取消出口
  const [isExecuting, setIsExecuting] = useState(false);
  // 模式切换 banner（设计 §6 / R2）：V1 不做历史精确定位，只按发生顺序堆叠在消息流底部
  const [modeBanners, setModeBanners] = useState<
    { id: string; label: string }[]
  >([]);

  // 写作/聊天模式：默认写作，契合笔记编辑器主场景。
  // chat 请求体不携带 noteId/runId 等写域字段（设计 D3），由 handleSend 的 isWriteMode 分支保证
  const [mode, setMode] = useState<"chat" | "write">("chat");
  const isWriteMode = mode === "write";

  // 回放折叠（设计 §8.2）：纯派生，不回写 state、不进 effect
  const renderItems = useMemo(() => buildRenderItems(messages), [messages]);

  // 派生：当前激活会话的 id 与标题（新建会话流式期间由 currentSessionId 接管展示）
  const activeSessionId = selectedSession?.sessionId ?? currentSessionId;
  const activeTitle =
    selectedSession?.title ??
    sessions.find((s) => s.sessionId === currentSessionId)?.title ??
    null;

  // 用于控制请求中断：整个 run（首轮 + 全部续轮）共用一个，取消要能掐断任意一轮
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // 回调内读锁定态：handleSend 闭包捕获的是发送那一刻的 state，setState 不会让同一闭包里的值变新
  const isRunLockedRef = useRef(false);
  // 当前 run 的 runId：一次用户指令 = 一个 run，续轮复用同一个（runId 与 noteId 不是 1:1，设计 D4）
  const runIdRef = useRef<string | null>(null);
  // 每轮流首个事件 meta 里的 sessionId：续轮回执要用它。
  // 不能用 handleSend 时捕获的 currentSessionId——新会话首轮发送时它还是 null，
  // sessionId 由后端在 meta 里回传
  const metaRef = useRef<{ sessionId: string } | null>(null);
  // 锁失效守卫基线（设计 §7.2）：首轮为发送瞬间的 docHash，此后每轮 applied 后
  // 推进到「该轮应用后的 docHash」。必须每轮推进——整 run 锁下用户改不了文档，
  // 唯一会让哈希变化的就是 AI 自己的写入，拿首轮值去比第二轮必然误报 doc drifted
  const docHashBaselineRef = useRef<string | null>(null);

  /** 整 run 锁的唯一入口：state 供渲染、ref 供异步回调内读取、onEditorLockChange 落到编辑器 */
  const setRunLock = (locked: boolean) => {
    isRunLockedRef.current = locked;
    setIsRunLocked(locked);
    onEditorLockChange?.(locked);
  };

  /** 清空当前 run 的过程卡；切会话/新建/归档与 run 终态都走它，避免残留上个 run 的卡片 */
  const resetRunView = () => setToolCallCards([]);

  /** 释放整 run 锁并清 run 现场；未持锁时为空操作，故兜底路径可无条件调用 */
  const releaseRunLock = () => {
    if (!isRunLockedRef.current) return;
    runIdRef.current = null;
    resetRunView();
    setRunLock(false);
  };

  /**
   * 切换写作/聊天模式。
   * run 进行中禁止切换（设计 §3.4：此期间唯一出口是「取消本次」），用 ref 读最新锁定态；
   * 切模式即换上下文，顺带清掉上一个 run 的终态提示，并在消息流里留一条切换标记。
   */
  const switchMode = (next: "chat" | "write") => {
    if (next === mode || isRunLockedRef.current) return;
    setMode(next);
    setRunNotice(null);
    setModeBanners((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        label: next === "write" ? "已切换到写作模式" : "已切换到聊天模式",
      },
    ]);
  };

  // 自动滚动到底部：依赖含过程卡与模式 banner——它们追加时 messages 不变，
  // 漏掉就会把新增内容顶在视口外（runNotice 在固定 footer，恒可见，无需触发滚动）
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, toolCallCards, modeBanners]);

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
      // 切会话即丢弃上一个 run 的过程卡、终态提示与模式切换标记
      // （异步数据驱动的清空，非渲染期同步 setState）
      resetRunView();
      setRunNotice(null);
      setModeBanners([]);
      try {
        const res = await getConversationMessages(
          { session_id: sessionId },
          { signal: ac.signal },
        );
        // 带上写域回放字段（设计 §8.2）：runId/toolCalls/toolCallId/result 是折叠
        // 摘要的唯一来源。这些字段只用于本地渲染，发送前会被投影掉（见 handleSend）
        setMessages(
          res.data.map((m) => ({
            role: m.role,
            content: m.content,
            mode: m.mode,
            runId: m.runId ?? null,
            toolCalls: m.toolCalls ?? null,
            toolCallId: m.toolCallId ?? null,
            result: m.result ?? null,
          })),
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
    // 整 run 锁期间不让插话（设计 §3.4），兜底防住按钮态与实际状态不同步
    if (!trimmedInput || isLoading || (isWriteMode && isRunLocked)) return;

    // 1. 准备消息历史（每条消息记下发送时所处的模式，供气泡按自身 mode 上色）
    const userMsg: UIMessage = { role: "user", content: trimmedInput, mode };
    const updatedHistory = [...messages, userMsg];

    // 2. 更新 UI：显示用户消息 + 占位的 AI 消息
    setMessages([...updatedHistory, { role: "assistant", content: "", mode }]);
    setInput("");
    setIsLoading(true);
    setRunNotice(null);

    // 3. 创建新的 AbortController（整个 run 共用，见 abortControllerRef 注释）
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // 一次用户指令 = 一个 run：每个写模式 send 都 mint 新 runId，续轮 postToolResult 复用同一个
    const runId = isWriteMode ? crypto.randomUUID() : null;
    if (isWriteMode) {
      runIdRef.current = runId;
      // 整 run 锁：从首轮生成一直锁到 run_finished / 用户取消（设计 §3.3）
      setRunLock(true);
    }

    // §5.1 发送瞬间快照：selection/cursorContext 作 patch 锚点、docHash 作锁失效守卫基线。
    // 后端当前不消费这三个字段（forward-contract），M-F 才真正使用；
    // 只进请求体顶层，绝不塞进 messages（设计 D3）
    //
    // 在此（事件处理器内）才构造 bridge：渲染期把读 ref 的取值函数交给工厂会被
    // react-hooks/refs 判定为「渲染期访问 ref」。每次发送现造两个闭包，无状态可同步。
    const editorBridge = isWriteMode ? getEditorBridge?.() : undefined;
    const ctx = editorBridge?.getSelectionContext();
    const docHashAtSend = editorBridge?.computeDocHash();
    // 守卫基线从这里起跑；每轮 applied 后再推进（见 sendToolResultRound）
    docHashBaselineRef.current = docHashAtSend ?? null;

    /**
     * 为「一条流」创建事件回调：一条流 = 首轮或某次续轮。
     *
     * 暂停标记与待执行工具都按流隔离（闭包局部量，非 state）：onToolCall 与 onRunPaused
     * 在同一次事件分发内先后触发，state 更新此时尚不可见；且流关闭时的兜底解锁
     * 必须按「这条流自己是否暂停过」判断——否则工具轮 run_paused 后的正常关闭
     * 会被误判成 run 结束，把整 run 锁提前放掉。
     */
    const createRoundHandlers = () => {
      let paused = false;
      let pending: PendingToolCall | null = null;

      return {
        onChunk: (chunk: string) => {
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
        onMeta: ({
          sessionId,
          title,
          runId: metaRunId,
        }: SSEEventMap["meta"]) => {
          // 每轮（含续轮）meta 首发，续轮回执的 sessionId 从这里取
          metaRef.current = { sessionId };
          // 写模式必回 runId（回传我们 mint 的值，未带才由后端 mint）：以回传值为准
          if (metaRunId) runIdRef.current = metaRunId;
          setCurrentSessionId(sessionId);
          // 续轮 meta 不带 title：缺省时不能拿 undefined 覆盖已有标题
          if (title === undefined) return;
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
        onToolCall: (toolCall: SSEEventMap["tool_call"]) => {
          pending = {
            toolCallId: toolCall.toolCallId,
            tool: toolCall.tool,
            args: toolCall.args,
          };
          // 追加一张 pending 卡：过程随 run 实时生长，状态待回执回填（见 sendToolResultRound）
          setToolCallCards((prev) => [
            ...prev,
            {
              toolCallId: toolCall.toolCallId,
              tool: toolCall.tool,
              args: toolCall.args,
              status: "pending",
            },
          ]);
        },
        onRunPaused: () => {
          // 本轮流终态：交客户端执行并回传。暂停标记必须先置位——流随即关闭，
          // onComplete 靠它区分「等执行/等续轮」与「run 真的结束了」
          paused = true;
          if (!pending) return;
          void sendToolResultRound(pending);
        },
        onRunFinished: ({ message }: SSEEventMap["run_finished"]) => {
          // run 级终态：释放整 run 锁（设计 §6.1）。顺序不可换——releaseRunLock 不清
          // runNotice，先解锁后设提示才能让收尾说明留下来
          releaseRunLock();
          if (message) setRunNotice({ text: message, tone: "warn" });
        },
        onComplete: () => {
          setIsLoading(false);
          if (paused) return; // 整 run 未完（等执行/等续轮），保留 abort 句柄以便「取消本次」
          abortControllerRef.current = null;
          // onclose 兜底解锁：流关了却没有任何终态事件时，别把编辑器锁死（设计 §3.3）。
          // 正常 run_finished 后本回调也会跑，但锁此时已释放——守卫保证不拿兜底文案
          // 覆盖真实收尾说明
          if (!isRunLockedRef.current) return;
          setRunNotice({
            text: "本次写作已结束（未收到结束信号）",
            tone: "warn",
          });
          releaseRunLock();
        },
        onError: (err: Error) => {
          console.error("流式请求出错:", err);
          setIsLoading(false);
          setIsExecuting(false);
          abortControllerRef.current = null;
          // 断流也解锁，但要留下可见提示，否则用户只看到静默解锁
          setRunNotice({ text: "连接中断，本次写作未完成", tone: "error" });
          releaseRunLock();
        },
      };
    };

    /**
     * 工具执行回执 → 后端内联续轮。
     *
     * 执行本身是同步的（tiptap 单事务写入，见 editorExecutor）；回执是网络请求，
     * 其响应体即下一轮内联 SSE，事件仍由 createRoundHandlers() 的同一组回调消费。
     */
    const sendToolResultRound = async (toolCall: PendingToolCall) => {
      const sessionId = metaRef.current?.sessionId;
      const currentRunId = runIdRef.current;
      if (!sessionId || !currentRunId) {
        console.warn("[write-run] 缺 sessionId/runId，无法续轮", {
          sessionId,
          currentRunId,
        });
        releaseRunLock();
        return;
      }

      // 真实执行：写入编辑器 + 锁漂移守卫 + status 判定。
      // bridge 缺失（写模式未接入编辑器）时按失败回执，让模型知道没落地，而不是静默当成功
      const payload: ToolResultPayload = editorBridge
        ? executeToolCall(editorBridge, toolCall, docHashBaselineRef.current)
        : { status: "failed", error: "编辑器未接入" };

      // 应用成功即推进守卫基线：下一轮比的是「本轮应用后的哈希」。
      // 不推进的话，多轮 run 从第二轮起必然判 doc drifted（恒拿首轮发送瞬间的值去比）
      if (typeof payload.docHash === "string") {
        docHashBaselineRef.current = payload.docHash;
      }
      if (payload.status === "failed") {
        console.warn("[write-run] 工具执行失败", {
          tool: toolCall.tool,
          error: payload.error,
        });
      }

      // 回执状态立刻回填对应卡（不等下一轮事件）：函数式 setState 按 id patch，
      // 避免闭包拿到旧数组
      setToolCallCards((prev) =>
        prev.map((card) =>
          card.toolCallId === toolCall.toolCallId
            ? {
                ...card,
                status: payload.status === "failed" ? "failed" : "applied",
                error: payload.error,
              }
            : card,
        ),
      );

      try {
        // 进入 run_paused 窗口：本地执行已同步完成，在等后端续轮
        setIsExecuting(true);
        await postToolResult({
          sessionId,
          noteId: noteId ?? undefined,
          runId: currentRunId,
          toolCallId: toolCall.toolCallId,
          signal: controller.signal,
          ...payload,
          ...createRoundHandlers(),
        });
        // 响应体即下一轮内联 SSE：其事件已把状态条示意切回「写作中」，此处收口执行态
        setIsExecuting(false);
      } catch (err) {
        // 回执请求本身失败（校验不过/断网）：run 无法续接，按错误路径收尾解锁
        console.error("工具结果续轮失败:", err);
        setIsLoading(false);
        setIsExecuting(false);
        abortControllerRef.current = null;
        setRunNotice({ text: "工具执行回执失败，本次写作中断", tone: "error" });
        releaseRunLock();
      }
    };

    // 4. 调用流式接口
    try {
      await streamChat({
        mode,
        // D3：UIMessage 携带 runId/toolCalls/result 等写域回放字段，原样外发会把
        // 内部轮泄进模型上下文。发送前投影成传输层的窄类型——写域字段只走请求顶层
        messages: updatedHistory.map((m) => ({
          role: m.role,
          content: m.content,
        })) as ChatMessage[],
        sessionId: currentSessionId ?? undefined,
        signal: controller.signal,
        // 写模式上下文域：chat 模式一律 undefined，不进请求体（设计 D3）
        noteId: isWriteMode ? (noteId ?? undefined) : undefined,
        runId: runId ?? undefined,
        docHashAtSend: isWriteMode ? docHashAtSend : undefined,
        // §5.1：无选区时显式送 null（而非省略），让模型看见「有上下文但没选区」
        selection: isWriteMode ? (ctx?.selection ?? null) : undefined,
        cursorContext: isWriteMode ? (ctx?.cursorContext ?? null) : undefined,
        ...createRoundHandlers(),
      });
    } catch (err) {
      // fetchEventSource 在 onerror 里 throw 以阻止自动重试，此处吞掉该 reject：
      // onError 回调已处理（含兜底解锁），这里只避免未捕获的 promise rejection
      console.error("流式请求中断:", err);
    }
  };

  // 停止生成 / 取消本次 run
  const handleStop = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsLoading(false);
    setIsExecuting(false);
    // 主动取消是用户意图，非故障：中性色提示让「解锁了」这件事可见
    setRunNotice({ text: "本次写作已取消", tone: "info" });
    // 取消本次是 run 期间的唯一出口（设计 §3.4）：同时解锁编辑器并丢弃待执行工具
    releaseRunLock();
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
        resetRunView();
        setRunNotice(null);
        setModeBanners([]);
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
    resetRunView();
    setRunNotice(null);
    setModeBanners([]);
  };

  return (
    // 1. 整体容器：flex-col 纵向布局，撑满父容器高度（父级已定高，此处用 h-full
    //    而非 h-screen，避免嵌套在带边框/内边距的容器里出现高度偏差），禁止整体滚动
    <div className="flex flex-col h-full w-full bg-background text-foreground overflow-hidden">
      {/* 1. 顶部会话选择器：固定 48px 高度，宽度自适应 */}
      <header className="flex items-center gap-2 h-12 w-full px-4 border-b border-border bg-background shrink-0">
        {leftSlot && <div className="shrink-0">{leftSlot}</div>}
        <DropdownMenu>
          {/* flex-1 min-w-0：触发器占满头部剩余宽度，给标题 span 一个可收缩的边界。
              min-w-0 是前提——flex 项默认 min-width:auto，不会缩到内容宽度以下，
              省略号也就永远不会触发 */}
          <DropdownMenuTrigger className="flex items-center gap-2 text-sm flex-1 min-w-0">
            {isLoadingSessions ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                加载中…
              </>
            ) : (
              // 标题不再按字符数硬截（truncateTitle 现只服务于下方列表项），
              // 全量交给 CSS：min-w-0 允许收缩，truncate 出省略号，随窗口宽度联动
              <span className="flex-auto min-w-0 truncate">
                {activeTitle ?? "新对话"}
              </span>
            )}
            {/* shrink-0：箭头固定尺寸，不被长标题挤压 */}
            <ChevronDown className="h-4 w-4 shrink-0" />
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
        </button>

        {/* 模式分段切换（设计 §6）：run 进行中禁用，唯一出口是「取消本次」 */}
        <div className="flex items-center rounded-md border border-border p-0.5 text-sm">
          {(
            [
              { value: "chat", label: "聊天" },
              { value: "write", label: "写作" },
            ] as const
          ).map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => switchMode(value)}
              disabled={isRunLocked}
              title={isRunLocked ? "写作进行中无法切换" : undefined}
              className={`px-3 h-7 rounded transition-colors disabled:cursor-not-allowed ${
                mode === value
                  ? "bg-muted font-medium"
                  : "hover:bg-muted/50 disabled:hover:bg-transparent"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* 2. 聊天消息区域：占据剩余空间 (flex-1)，内容溢出时内部滚动 */}
      <main className="flex-1 overflow-y-auto p-6 relative custom-scrollbar">
        {isLoadingHistory ? (
          <div className="flex justify-center items-center h-full text-muted-foreground text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在载入历史消息…
          </div>
        ) : renderItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <MessageSquare className="h-8 w-8" />
            <p className="text-sm">
              {selectedSession || currentSessionId
                ? "还没有消息，开始聊天吧"
                : "开始一场新对话"}
            </p>
          </div>
        ) : (
          renderItems.map((item, index) => {
            const isUser = item.kind === "user";
            const msg = item.msg;
            // 按消息自身的模式上色：切换模式只影响后续消息，历史气泡不被整体重染；
            // 重载历史缺 mode，兜底用当前模式
            const bubbleMode = msg.mode ?? (isWriteMode ? "write" : "chat");
            const isPendingAssistant =
              item.kind === "assistant" &&
              msg.content === "" &&
              isLoading &&
              index === renderItems.length - 1; // 最后一项是正在生成的 AI 消息

            return (
              <div
                key={index}
                className={`flex mb-4 ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`
                max-w-[100%] px-4 py-3 rounded-lg text-sm leading-relaxed shadow-sm
                /* 用户消息样式：淡蓝背景 + 深色文字 */
                /* 写作模式 AI 气泡分色（设计 §8.1）：按消息自身 mode 着色，避免切模式时历史整体变色 */
                ${
                  isUser
                    ? "bg-blue-50 text-slate-900 border border-blue-100"
                    : bubbleMode === "write"
                      ? "bg-amber-50/60 border border-amber-200"
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
                  {/* 回放折叠摘要（设计 §8.2）：该 run 的工具调用不单独成气泡，只在此标注 */}
                  {item.kind === "assistant" && item.fold && (
                    <FoldSummary fold={item.fold} />
                  )}
                </div>
              </div>
            );
          })
        )}
        {/* 模式切换标记（设计 §6 / R2）：V1 不做历史精确定位，按发生顺序堆叠在消息流底部 */}
        {modeBanners.map((banner) => (
          <div key={banner.id} className="flex justify-center mb-4">
            <span className="px-3 py-1 rounded-full text-xs text-muted-foreground bg-muted/60">
              {banner.label}
            </span>
          </div>
        ))}
        {/* 过程卡（设计 §8.1）：当前 run 的工具调用逐步生长，run 结束整组清空 */}
        {isWriteMode && toolCallCards.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-4">
            {toolCallCards.map((card) => (
              <div
                key={card.toolCallId}
                className="flex items-center gap-2 px-2 py-1.5 rounded border border-amber-200 bg-amber-50/40 text-xs"
              >
                <span className="shrink-0 font-mono font-medium">
                  {card.tool}
                </span>
                <span className="flex-1 min-w-0 truncate text-muted-foreground">
                  {summarizeArgs(card.args)}
                </span>
                {card.status === "pending" ? (
                  <span className="shrink-0 flex items-center gap-1 text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    执行中
                  </span>
                ) : card.status === "applied" ? (
                  <span className="shrink-0 flex items-center gap-1 text-emerald-600">
                    <Check className="h-3 w-3" />
                    已应用
                  </span>
                ) : (
                  <span className="shrink-0 flex items-center gap-1 max-w-[12rem] text-destructive">
                    <X className="h-3 w-3 shrink-0" />
                    <span className="truncate">{card.error ?? "失败"}</span>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {/* 自动滚动锚点 */}
        <div ref={messagesEndRef} />
      </main>

      {/* 3. 底部输入区域：固定在下方，不随上方滚动 */}
      <footer className="p-4 bg-card border-t border-border shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10">
        {/* run 状态条：整 run 锁期间说明编辑器为何只读（工具进度见过程卡）。
            run_paused 窗口切文案，区分「在生成文本」与「在等工具往返」 */}
        {isWriteMode && isRunLocked && (
          <div className="flex items-center gap-2 max-w-4xl mx-auto mb-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>
              {isExecuting
                ? "AI 正在执行工具…（编辑区已锁定）"
                : "AI 正在写作…（编辑区已锁定，可取消本次）"}
            </span>
          </div>
        )}
        {/* run 终态提示：文案与 tone 由触发路径决定（取消=info / 断流与回执失败=error /
            后端收尾说明=warn） */}
        {runNotice && (
          <p
            className={`max-w-4xl mx-auto mb-2 text-xs ${
              runNotice.tone === "error"
                ? "text-destructive"
                : runNotice.tone === "warn"
                  ? "text-amber-600"
                  : "text-muted-foreground"
            }`}
          >
            {runNotice.text}
          </p>
        )}
        <div className="flex gap-2 items-end max-w-4xl mx-auto">
          <Textarea
            value={input}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              setInput(e.target.value)
            }
            // run 期间禁用发送框，避免插话写进历史打断 loop 上下文（设计 §3.4）
            disabled={isWriteMode && isRunLocked}
            placeholder="向 AI 提问关于这篇笔记的问题..."
            className="min-h-[60px] resize-none flex-1 bg-background" // 稍微调低一点最小高度以适应横向布局
          />

          {/* 按钮根据状态切换：run 进行中只保留「取消本次」这一个出口（设计 §3.4） */}
          {isLoading || (isWriteMode && isRunLocked) ? (
            <Button
              variant="destructive"
              onClick={handleStop}
              className="h-[60px] shrink-0 px-6"
            >
              {isLoading ? "停止" : "取消本次"}
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
