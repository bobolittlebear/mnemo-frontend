import request from "@/utils/request";

/**
 * 退出登录：调用后端 /auth/logout（挂在根 /auth 下，不在 /api 下），
 * 后端会清空 httpOnly 的 token Cookie。per-request 覆盖 baseURL 为 "/"，
 * 否则实例默认 baseURL:"/api" 会打到 /api/auth/logout 而 404。
 * 复用同一套响应拦截器（401 跳转等）。
 */
export const logout = () => request.post("/auth/logout", {}, { baseURL: "/" });

/**
 * 探测当前是否登录：GET /auth/me（挂在根 /auth 下，复用 authMiddleware 校验 cookie）。
 * 已登录返回用户（success:true），未登录返回 401（信封）。
 * 前端仅在登录/注册页挂载时调用：命中则直接跳 /note；未命中停留在当前页。
 * 注意该端点的 401 已在 response 拦截器里排除跳转，避免把游客误弹到登录页。
 */
export const me = () => request.get("/auth/me", { baseURL: "/" });
