import axios from "axios";
import type { ChatMessage } from "../utils/chatStream";

export type ApiResponse<T> = {
  success: boolean;
  data: T;
  message: string;
  timestamp: string;
  count: number | null;
};

export type Session = {
  sessionId: string;
  title: string;
  createdAt: string;
  lastActiveAt: string;
};

export type ChatHistoryMessage = ChatMessage & {
  id: string;
  timestamp: string;
  msgId: string;
  traceId: string;
};

/**获取会话列表 */
export const getSessions = async (options?: {
  signal?: AbortSignal;
}): Promise<ApiResponse<{ list: Session[] }>> => {
  return (
    await axios.get(`/api/sessions`, {
      signal: options?.signal,
    })
  ).data;
};

/**归档会话 */
export const archiveSession = async (
  session_id: string,
  options?: { signal?: AbortSignal },
): Promise<ApiResponse<unknown>> => {
  return (
    await axios.post(
      `/stream/session/end`,
      { session_id },
      {
        signal: options?.signal,
      },
    )
  ).data;
};

/**获取会话的历史消息 */
// /stream/chat/history?session_id=9311ab028484a3b05e017536e52e88d0
export const getConversationMessages = async (
  params: { session_id: string },
  options?: { signal?: AbortSignal },
): Promise<ApiResponse<ChatHistoryMessage[]>> => {
  return (
    await axios.get(`/stream/chat/history`, {
      params,
      signal: options?.signal,
    })
  ).data;
};
