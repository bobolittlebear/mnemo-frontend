// utils/chatStream.ts

import { fetchEventSource } from "@microsoft/fetch-event-source";
import type { EventSourceMessage } from "@microsoft/fetch-event-source";
import type { SSEEventMap } from "../types/sse";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/** 消息发送瞬间的选区快照（设计 §5.1）；无选区为 null */
export type SelectionSnapshot = { text: string } | null;

/** 无选区时的光标锚点（设计 §5.1）：光标前后各约 200 字符 */
export type CursorContextSnapshot = {
  beforeText: string;
  afterText: string;
} | null;

/** 两个端点（/stream/chat、/stream/chat/tool-result）共用的 SSE 事件回调集 */
interface StreamHandlers {
  onChunk: (content: string) => void;
  onMeta?: (meta: SSEEventMap["meta"]) => void;
  onCitation?: (citation: SSEEventMap["citation"]) => void;
  onToolCall?: (toolCall: SSEEventMap["tool_call"]) => void;
  onRunPaused?: (ev: SSEEventMap["run_paused"]) => void;
  onRunFinished?: (ev: SSEEventMap["run_finished"]) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

interface StreamChatOptions extends StreamHandlers {
  messages: ChatMessage[];
  sessionId?: string;
  signal?: AbortSignal;
  mode?: "chat" | "write";
  /**
   * 以下为写模式上下文域字段：只进请求体顶层，绝不塞进 messages（设计 D3）。
   * 后端当前仅约定不消费（tools.ts §5.1 forward-contract），前端本地用途：
   * docHashAtSend 作整 run 锁失效守卫基线、selection/cursorContext 作 patch 锚点（M-F 落地）。
   */
  noteId?: string;
  runId?: string;
  docHashAtSend?: string;
  selection?: SelectionSnapshot;
  cursorContext?: CursorContextSnapshot;
}

export interface ToolResultOptions extends StreamHandlers {
  sessionId?: string;
  noteId?: string;
  runId: string;
  toolCallId: string;
  status: "applied" | "failed" | "cancelled";
  /** 应用成功时的文档哈希（锁失效守卫对账，见设计 §7.2） */
  docHash?: string;
  /** update_title 应用后的标题 */
  titleAfter?: string;
  /** 失败原因，模型据此修正重试 */
  error?: string;
  signal?: AbortSignal;
}

/** 按事件名分发；解析失败一律降级为 warn，不让单条坏帧打断整条流 */
function handleSSEMessage(
  ev: EventSourceMessage,
  handlers: StreamHandlers,
): void {
  switch (ev.event) {
    case "meta":
      try {
        const data = JSON.parse(ev.data) as SSEEventMap["meta"];
        handlers.onMeta?.(data);
      } catch {
        console.warn("[SSE] meta parse failed:", ev.data);
      }
      break;

    case "citation":
      try {
        const data = JSON.parse(ev.data) as SSEEventMap["citation"];
        handlers.onCitation?.(data);
      } catch {
        console.warn("[SSE] citation parse failed:", ev.data);
      }
      break;

    case "delta":
      try {
        const data = JSON.parse(ev.data) as SSEEventMap["message"];
        if (data.content) handlers.onChunk(data.content);
      } catch {
        console.warn("[SSE] message parse failed:", ev.data);
      }
      break;

    case "tool_call":
      try {
        const data = JSON.parse(ev.data) as SSEEventMap["tool_call"];
        handlers.onToolCall?.(data);
      } catch {
        console.warn("[SSE] tool_call parse failed:", ev.data);
      }
      break;

    case "run_paused":
      try {
        const data = JSON.parse(ev.data) as SSEEventMap["run_paused"];
        handlers.onRunPaused?.(data);
      } catch {
        console.warn("[SSE] run_paused parse failed:", ev.data);
      }
      break;

    case "run_finished":
      try {
        const data = JSON.parse(ev.data) as SSEEventMap["run_finished"];
        handlers.onRunFinished?.(data);
      } catch {
        console.warn("[SSE] run_finished parse failed:", ev.data);
      }
      break;

    case "done":
      handlers.onComplete?.();
      break;

    case "error":
      try {
        const data = JSON.parse(ev.data) as SSEEventMap["error"];
        handlers.onError?.(new Error(data.error));
      } catch {
        handlers.onError?.(new Error("Unknown stream error"));
      }
      break;

    default:
      // 未知事件安全降级，不中断流
      console.debug(`[SSE] Unknown event: ${ev.event}`, ev.data);
  }
}

/** 两个端点共用的传输参数：POST + 事件流，失败不自动重试（写 run 重试会重复执行工具） */
function streamRequest(
  url: string,
  body: Record<string, unknown>,
  handlers: StreamHandlers,
  signal?: AbortSignal,
) {
  return fetchEventSource(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
    openWhenHidden: true,

    onmessage(ev) {
      // 通过 ev.event 分发，而非字符串硬匹配
      handleSSEMessage(ev, handlers);
    },

    onclose() {
      handlers.onComplete?.();
    },
    onerror(err) {
      handlers.onError?.(err as Error);
      throw err; // 阻止自动重试
    },
  });
}

export async function streamChat(options: StreamChatOptions) {
  const {
    messages,
    sessionId,
    signal,
    mode,
    noteId,
    runId,
    docHashAtSend,
    selection,
    cursorContext,
    ...handlers
  } = options;

  // 上下文域字段与 messages/mode 并列放请求体顶层，不污染 messages 数组（设计 D3）
  const body: Record<string, unknown> = { messages, mode };
  if (sessionId) body.session_id = sessionId;
  // 写模式才有值；chat 模式全部省略，避免普通对话被误打笔记/run 标签
  if (noteId) body.noteId = noteId;
  if (runId) body.runId = runId;
  if (docHashAtSend !== undefined) body.docHashAtSend = docHashAtSend;
  if (selection !== undefined) body.selection = selection;
  if (cursorContext !== undefined) body.cursorContext = cursorContext;

  await streamRequest("/stream/chat", body, handlers, signal);
}

/**
 * 回传工具执行结果 → 后端落库 tool 消息并重装写模式上下文 → 响应即下一轮内联 SSE。
 *
 * 契约（已对后端核实）：session_id 为 snake_case（中间件只从 body.session_id 读会话），
 * mode/noteId/runId 为 camelCase；mode 仅写模式可用（工具轮只存在于写模式）。
 * 续轮事件与首轮同构，故复用传入的同一组回调接下一轮。
 */
export async function postToolResult(options: ToolResultOptions) {
  const {
    sessionId,
    noteId,
    runId,
    toolCallId,
    status,
    docHash,
    titleAfter,
    error,
    signal,
    ...handlers
  } = options;

  // session_id / mode / noteId / runId 缺一后端即 400（写模式上下文无从装配）
  const body: Record<string, unknown> = {
    mode: "write",
    runId,
    toolCallId,
    status,
  };
  if (sessionId) body.session_id = sessionId;
  if (noteId) body.noteId = noteId;
  if (docHash !== undefined) body.docHash = docHash;
  if (titleAfter !== undefined) body.titleAfter = titleAfter;
  if (error !== undefined) body.error = error;

  await streamRequest("/stream/chat/tool-result", body, handlers, signal);
}
