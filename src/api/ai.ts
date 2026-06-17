// src/utils/chatStream.ts

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

interface StreamOptions {
  messages: Message[];
  onChunk: (text: string) => void; // 每次收到新文本块
  onComplete?: () => void; // 传输结束
  onError?: (error: Error) => void; // 出错处理
  signal?: AbortSignal; // 用于取消请求（比如用户点击停止生成）
}

export async function createChatStream({
  messages,
  onChunk,
  onComplete,
  onError,
  signal,
}: StreamOptions) {
  try {
    const response = await fetch("http://localhost:3000/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // 如果你的 Axios 实例里有统一的 Token 拦截，这里需要手动带上
        // 'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ messages }),
      signal, // 传入取消信号
    });

    if (!response.ok || !response.body) {
      throw new Error(`API Error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // 解码二进制流为字符串
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      // 处理 SSE 格式 (data: {...}\n\n)
      // 注意：这里需要根据你后端实际返回的格式微调
      const lines = buffer.split("\n");
      // 保留最后一个可能不完整的片段在 buffer 中
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const jsonStr = line.slice(6);
          if (jsonStr === "[DONE]") {
            onComplete?.();
            return;
          }
          try {
            const data = JSON.parse(jsonStr);
            // 根据你的后端结构提取内容，通常是 choices[0].delta.content
            const content = data.choices?.[0]?.delta?.content || "";
            if (content) onChunk(content);
          } catch (e) {
            console.warn("Parse error:", e);
          }
        }
      }
    }
    onComplete?.();
  } catch (err) {
    if ((err as Error).name !== "AbortError") {
      onError?.(err as Error);
    }
  }
}
