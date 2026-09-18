// types/sse.ts
export interface MetaEvent {
  sessionId: string;
  /**
   * 会话标题。写模式续轮（POST /stream/chat/tool-result）的 meta 只回 sessionId + runId，
   * 不带 title——故为可选，消费方不能拿 undefined 覆盖已有标题。
   */
  title?: string;
  /** 写模式 run 标识；chat 模式后端不发该字段（JSON 序列化时省略） */
  runId?: string;
}

export interface CitationEvent {
  noteId: string;
  chunkIndex: number;
  score: number;
}

export interface MessageEvent {
  content: string;
}

/**
 * 写模式工具调用：模型要求客户端执行的一次工具。
 * args 为结构化参数；模型吐出的 JSON 解析失败时后端回退为原始字符串（执行侧须按失败处理）。
 */
export interface ToolCallEvent {
  runId: string;
  toolCallId: string;
  tool: "update_title" | "insert_at_cursor" | "replace_selection";
  args: Record<string, unknown> | string;
}

/** 工具轮终态（替代该轮的 done）：本轮流已结束，等待客户端执行并回传结果 */
export interface RunPausedEvent {
  runId: string;
  reason: "waiting_client_execution";
}

/** run 级终态：位于最后一轮流内、done 之前；前端收到即释放整 run 锁 */
export interface RunFinishedEvent {
  runId: string;
  reason?: "max_rounds_reached";
  /** 后端合成的收尾说明（如轮数阀门触顶），前端直接展示，不自编文案 */
  message?: string;
}

// 事件映射表：将 event name 映射到数据类型
export interface SSEEventMap {
  meta: MetaEvent;
  citation: CitationEvent;
  message: MessageEvent;
  tool_call: ToolCallEvent;
  run_paused: RunPausedEvent;
  run_finished: RunFinishedEvent;
  done: string; // "[DONE]"
  error: { error: string };
}
