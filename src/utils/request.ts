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
    // 如果后端返回的数据结构统一是 { code, data, message }
    // 可以在这里做一层解构，方便组件直接使用 data
    return response.data;
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
