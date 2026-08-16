import axios from "axios";
import request from "../utils/request";
import type { ApiResponse, Note } from "./notebook";

export const updateNote = async (
  noteId: string,
  data: { content: string; title: string },
  options?: { signal?: AbortSignal },
) => {
  await axios.put(`/api/notes/${noteId}`, data, {
    signal: options?.signal,
  });
};

/**新建笔记 */
export const createNote = async (body: {
  title: string;
  content: string;
  notebookId: string;
}): Promise<ApiResponse<Note>> => {
  return await request.post<ApiResponse<Note>, ApiResponse<Note>>(
    "/notes",
    body,
  );
};

/**获取笔记列表 */
export const getNotes = async (params: {
  notebookId: string;
  page?: number;
  limit?: number;
}): Promise<ApiResponse<Note[]>> => {
  return await request.get<ApiResponse<Note[]>, ApiResponse<Note[]>>("/notes", {
    params: { page: 1, limit: 50, ...params },
  });
};

/**获取笔记详情 */
export const getNoteById = async (
  id: string,
): Promise<ApiResponse<Note>> => {
  return await request.get<ApiResponse<Note>, ApiResponse<Note>>(`/notes/${id}`);
};

/**删除笔记 */
export const deleteNote = async (id: string): Promise<ApiResponse<null>> => {
  return await request.delete<ApiResponse<null>, ApiResponse<null>>(
    `/notes/${id}`,
  );
};
