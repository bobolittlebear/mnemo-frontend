import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import request from "@/utils/request";
import { me } from "@/api/auth";

const Register = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  // 已登录则无需停留在注册页：挂载即探测会话，命中（/auth/me 成功）直接进 /note。
  // 未命中（/auth/me 返回 401，拦截器已排除跳转）则停留在注册页，什么都不做。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await me();
        if (!cancelled) navigate("/note");
      } catch {
        // 未登录：停留在注册页
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      // 后端 /auth/register 成功后已 Set-Cookie 写入 JWT，并以登录态返回，
      // 故注册成功直接进笔记页（无需再跳登录页二次登录）。
      // baseURL 覆盖为 "/" —— 注册路由挂在后端 /auth 下，不在 /api 下；
      // 沿用实例默认 baseURL:"/api" 会打到 /api/auth/register 而 404。
      await request.post(
        "/auth/register",
        { username, email, password },
        { baseURL: "/" },
      );
      navigate("/note");
    } catch (err) {
      // 错误文案已由响应拦截器统一抽取到 err.message（含后端校验/重复等提示）
      setError(err instanceof Error ? err.message : "注册失败");
    }
  };

  return (
    <div className="flex justify-center mt-24">
      <div className="w-96 bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-medium mb-4">Mnemo Note 注册</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-destructive text-sm">{error}</p>}
          <div>
            <label className="block text-sm mb-1">用户名</label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username（3-30 字符）"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">邮箱</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">密码</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password（至少 8 位）"
            />
          </div>
          <div>
            <Button type="submit" className="w-full">
              注册
            </Button>
          </div>
          <p className="text-sm text-muted-foreground text-center">
            已有账号？{" "}
            <Link to="/login" className="text-primary hover:underline">
              去登录
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default Register;
