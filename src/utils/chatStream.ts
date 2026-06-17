// src/utils/chatStream.ts

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface StreamChatOptions {
  messages: ChatMessage[];
  onChunk: (content: string) => void; // 每次接收到文本片段时触发
  onComplete?: () => void; // 流式传输结束时触发
  onError?: (error: Error) => void; // 发生错误时触发
  signal?: AbortSignal; // 用于中断请求（如点击“停止生成”）
}

export async function streamChat({
  messages,
  onChunk,
  onComplete,
  onError,
  signal,
}: StreamChatOptions) {
  try {
    // 1. 发起 POST 请求（走 Vite 的 /api 代理，避免跨域）
    const response = await fetch("/stream/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // "Content-Type": "text/event-stream",
      },
      body: JSON.stringify({ messages }),
      signal, // 绑定取消信号
    });

    if (!response.ok || !response.body) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    // 2. 获取流的读取器
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = ""; // 用于处理跨 chunk 的不完整数据   核心：维护一个缓冲区

    // 3. 循环读取流
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // 解码二进制数据为文本，并追加到 buffer
      buffer += decoder.decode(value, { stream: true });

      // 按换行符分割（SSE 协议以 \n\n 分隔，但网络层可能截断）
      const lines = buffer.split("\n\n");
      // 将最后一个可能不完整的行留在 buffer 中
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || !trimmedLine.startsWith("data: ")) continue;

        const jsonStr = trimmedLine.slice(6); // 去掉 "data: " 前缀

        // 处理结束标记
        if (jsonStr === "[DONE]") {
          onComplete?.();
          return;
        }

        try {
          const parsed = JSON.parse(jsonStr);
          // 提取后端返回的 content 字段
          if (parsed.content) {
            onChunk(parsed.content);
          }
        } catch {
          console.warn("JSON 解析失败:", jsonStr);
        }
      }
    }

    // 如果流自然结束
    onComplete?.();
  } catch (err) {
    // 忽略用户主动取消的请求错误
    if ((err as unknown as { name: string }).name !== "AbortError") {
      onError?.(err as Error);
    }
  }
}
