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
    config.withCredentials = true;
    config.withCredentials = true;
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
    // 处理 401 未授权
    if (error.response && error.response.status === 401) {
      console.warn("登录已过期或未登录，请重新登录");
      // 这里可以触发跳转登录页的逻辑
      // window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export default request;
