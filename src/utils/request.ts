import axios from "axios";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";

// 创建实例
const request = axios.create({
  baseURL: "/api", // 你的后端地址
  timeout: 10000,
  withCredentials: true, // 携带 Cookie
});

// 1. 请求拦截器：不需要手动塞 Token 了！
// 配置 withCredentials，请求时浏览器自动携带 cookie
request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 【关键点】允许跨域请求携带 Cookie
    config.withCredentials = true;
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// 2. 响应拦截器：处理全局错误
request.interceptors.response.use(
  (response: AxiosResponse) => {
    const data = response.data;
    // 后端统一信封 { success, data, message }：逻辑失败（success:false，如校验/鉴权不通过）
    // 仍走 HTTP 200，必须在此按错误抛出，否则调用方 try/catch 捕获不到，
    // 会静默拿到 data:null 并推进 state，导致渲染时 `null.xxx` 白屏。
    // 仅当响应体是带 success 字段的对象才判定，非信封结构原样返回。
    if (
      data &&
      typeof data === "object" &&
      "success" in data &&
      data.success === false
    ) {
      return Promise.reject(
        new Error(
          typeof data.message === "string" && data.message
            ? data.message
            : "请求失败",
        ),
      );
    }
    return data;
  },
  (error) => {
    // 后端错误信封 { success, data, message }：优先抽取后端 message 供业务层展示，
    // 否则回退到 axios 默认错误信息。这样登录/注册的校验失败（400/500）能显示真实文案。
    const respData = error.response?.data;
    const msg =
      respData &&
      typeof respData === "object" &&
      typeof respData.message === "string" &&
      respData.message
        ? respData.message
        : (error.message ?? "请求失败");

    // 401 未授权：跳转登录页。但 /auth/login、/auth/register 是公开端点，它们的失败
    // （凭证错/校验错）走 400/500 而非 401；即便偶发 401 也不应把“登录/注册中”误跳登录页，故排除。
    // 已在 /login 页时不重复跳转，避免循环。
    const url = error.config?.url ?? "";
    // 登录/注册/me 都是公开或探测用途：登录失败（401）交给对应表单 catch 显示文案，
    // /me 探测到未登录（401）只是“停留在当前页”，都不应触发跳登录页。
    const isAuthEndpoint =
      url.includes("/login") ||
      url.includes("/register") ||
      url.includes("/me");
    if (
      error.response?.status === 401 &&
      window.location.pathname !== "/login" &&
      !isAuthEndpoint
    ) {
      window.location.href = "/login";
    }

    return Promise.reject(new Error(msg));
  },
);

export default request;
