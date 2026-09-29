import React, { useState } from "react";
import axios from "axios";
import request from "@/utils/request";
import { useNavigate, Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const Login = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      // 后端登录成功会 Set-Cookie 写入 JWT，后续请求靠 withCredentials 自动携带。
      // 前端不存 token：响应拦截器成功时返回信封 data，能 resolve 即视为登录成功。
      // 字段名必须是 username —— /auth/login 读的是 req.body.username，
      // 传 email 会被判为「用户名和密码不能为空」直接 400。
      // baseURL 覆盖为 "/" —— 登录路由挂在后端 /auth 下，不在 /api 下；
      // 沿用实例默认的 baseURL:"/api" 会打到 /api/auth/login，
      // 被 api.route 的 authMiddleware 先拦下（无 cookie → 401「未提供有效的认证令牌」）。
      // vite 已把 /auth 代理到同一后端，故这里绕开 /api 前缀即可。
      await request.post(
        "/auth/login",
        { username, password },
        { baseURL: "/" },
      );
      navigate("/note");
    } catch (err) {
      // 业务错误文案在响应体的 message 里（如密码错的「用户名或密码错误」，
      // 后端以 HTTP 500 而非 401 返回，此时 err.message 只是 "Request failed with status code 500"），
      // 所以优先读 body.message，再退回 Error.message。
      const bodyMessage = axios.isAxiosError(err)
        ? err.response?.data?.message
        : undefined;
      setError(
        typeof bodyMessage === "string" && bodyMessage
          ? bodyMessage
          : err instanceof Error
            ? err.message
            : "登录失败",
      );
    }
  };

  return (
    <div className="flex justify-center mt-24">
      <div className="w-96 bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-medium mb-4">Mnemo Note 登录</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-destructive text-sm">{error}</p>}
          <div>
            <label className="block text-sm mb-1">用户名</label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">密码</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
            />
          </div>
          <div>
            <Button type="submit" className="w-full">
              登录
            </Button>
          </div>
          <p className="text-sm text-muted-foreground text-center">
            还没有账号？{" "}
            <Link to="/register" className="text-primary hover:underline">
              去注册
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default Login;
