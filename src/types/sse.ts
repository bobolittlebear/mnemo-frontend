// types/sse.ts
export interface MetaEvent {
  sessionId: string;
  title: string;
}

export interface CitationEvent {
  noteId: string;
  chunkIndex: number;
  score: number;
}

export interface MessageEvent {
  content: string;
}

// 事件映射表：将 event name 映射到数据类型
export interface SSEEventMap {
  meta: MetaEvent;
  citation: CitationEvent;
  message: MessageEvent;
  done: string; // "[DONE]"
  error: { error: string };
}
