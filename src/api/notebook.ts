import request from "../utils/request";
import type { ApiResponse } from "./conversation";

export type { ApiResponse };

export type Notebook = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type Note = {
  id: string;
  notebookId: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

// request 实例的响应拦截器已 return response.data，
// 故第二个泛型（R）直接写 ApiResponse<T>，返回值即为后端统一响应体。
/**新建笔记本 */
export const createNotebook = async (
  title: string,
): Promise<ApiResponse<Notebook>> => {
  return await request.post<ApiResponse<Notebook>, ApiResponse<Notebook>>(
    "/notebooks",
    { title },
  );
};

/**获取笔记本列表 */
export const getNotebooks = async (params?: {
  page?: number;
  limit?: number;
}): Promise<ApiResponse<Notebook[]>> => {
  return await request.get<ApiResponse<Notebook[]>, ApiResponse<Notebook[]>>(
    "/notebooks",
    { params: { page: 1, limit: 50, ...params } },
  );
};

/**获取笔记本详情 */
export const getNotebookById = async (
  id: string,
): Promise<ApiResponse<Notebook>> => {
  return await request.get<ApiResponse<Notebook>, ApiResponse<Notebook>>(
    `/notebooks/${id}`,
  );
};

/**更新笔记本 */
export const updateNotebook = async (
  id: string,
  title: string,
): Promise<ApiResponse<Notebook>> => {
  return await request.put<ApiResponse<Notebook>, ApiResponse<Notebook>>(
    `/notebooks/${id}`,
    { title },
  );
};

/**删除笔记本 */
export const deleteNotebook = async (
  id: string,
): Promise<ApiResponse<null>> => {
  return await request.delete<ApiResponse<null>, ApiResponse<null>>(
    `/notebooks/${id}`,
  );
};
