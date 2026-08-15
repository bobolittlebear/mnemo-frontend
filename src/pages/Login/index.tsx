import React, { useState } from "react";
import request from "@/utils/request";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // request.ts 响应拦截器直接返回 response.data，故此处类型为响应体
      const res = (await request.post("/auth/login", {
        email,
        password,
      })) as { code: number; data: { token: string } };
      if (res.code === 200) {
        localStorage.setItem("token", res.data.token);
        alert("登录成功");
        navigate("/editor");
      }
    } catch {
      // request.ts 统一处理错误
    }
  };

  return (
    <div className="flex justify-center mt-24">
      <div className="w-96 bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-medium mb-4">AI Note 登录</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">邮箱</label>
            <Input
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
              placeholder="Password"
            />
          </div>
          <div>
            <Button type="submit" className="w-full">
              登录
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
