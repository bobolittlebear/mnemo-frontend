// utils/chatStream.ts

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}
import { fetchEventSource } from "@microsoft/fetch-event-source";
import type { SSEEventMap } from "../types/sse";

interface StreamChatOptions {
  messages: ChatMessage[];
  sessionId?: string;
  onChunk: (content: string) => void;
  onMeta?: (meta: SSEEventMap["meta"]) => void;
  onCitation?: (citation: SSEEventMap["citation"]) => void; // 新增：RAG 引用回调
  onComplete?: () => void;
  onError?: (error: Error) => void;
  signal?: AbortSignal;
}

export async function streamChat(options: StreamChatOptions) {
  const {
    messages,
    sessionId,
    onChunk,
    onMeta,
    onCitation,
    onComplete,
    onError,
    signal,
  } = options;

  await fetchEventSource("/stream/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sessionId ? { messages, sessionId } : { messages }),
    signal,
    openWhenHidden: true,

    onmessage(ev) {
      // 通过 ev.event 分发，而非字符串硬匹配
      switch (ev.event) {
        case "meta":
          try {
            const data = JSON.parse(ev.data) as SSEEventMap["meta"];
            onMeta?.(data);
            console.log(data);
          } catch {
            console.warn("[SSE] meta parse failed:", ev.data);
          }
          break;

        case "citation":
          try {
            const data = JSON.parse(ev.data) as SSEEventMap["citation"];
            onCitation?.(data);
          } catch {
            console.warn("[SSE] citation parse failed:", ev.data);
          }
          break;

        case "delta":
          try {
            const data = JSON.parse(ev.data) as SSEEventMap["message"];
            if (data.content) onChunk(data.content);
          } catch {
            console.warn("[SSE] message parse failed:", ev.data);
          }
          break;

        case "done":
          onComplete?.();
          break;

        case "error":
          try {
            const data = JSON.parse(ev.data) as SSEEventMap["error"];
            onError?.(new Error(data.error));
          } catch {
            onError?.(new Error("Unknown stream error"));
          }
          break;

        default:
          // 未知事件安全降级，不中断流
          console.debug(`[SSE] Unknown event: ${ev.event}`, ev.data);
      }
    },

    onclose() {
      onComplete?.();
    },
    onerror(err) {
      onError?.(err as Error);
      throw err; // 阻止自动重试
    },
  });
}
