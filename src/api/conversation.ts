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

/**
 * 历史消息角色：比传输层 ChatMessage 多一档 'tool'——写模式下工具轮会落库为
 * role:'tool' 的内部消息（后端 ChatMessage 枚举含 'tool'）。此处单独声明而不放宽
 * ChatMessage，是为了让「请求体消息」保持窄类型：写域字段与内部轮一律不得外发。
 */
export type HistoryRole = "user" | "assistant" | "system" | "tool";

/**
 * 历史消息：在 ChatMessage 之外携带后端落库的写域字段（设计 §8.2 回放折叠所需）。
 * 字段全部可选——同一份类型也要能描述前端 live 新建的消息（那些只有 role/content/mode）。
 */
export type ChatHistoryMessage = Omit<ChatMessage, "role"> & {
  role: HistoryRole;
  id?: string;
  timestamp?: string;
  msgId?: string;
  traceId?: string;
  mode?: "chat" | "write";
  runId?: string | null;
  noteId?: string | null;
  /** assistant 内部轮携带的工具调用（工具名在 name，不是 tool） */
  toolCalls?: Array<{ id?: string; name?: string; arguments?: unknown }> | null;
  /** role:'tool' 消息回指它执行的是哪次调用 */
  toolCallId?: string | null;
  /** 工具执行回执：status 为 applied / failed / cancelled */
  result?: { status?: string; error?: string; titleAfter?: string } | null;
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
