// src/pages/Login.tsx (伪代码)
import { Form, Input, Button, Card, message } from "antd";
import request from "@/utils/request";
import { useNavigate } from "react-router-dom";

const Login = () => {
  const navigate = useNavigate();

  const onFinish = async (values: any) => {
    try {
      // 这里的 /auth/login 会被 Vite 代理到 http://localhost:3000/api/auth/login
      const res = await request.post("/auth/login", values);

      // 假设后端返回结构为 { code: 200, data: { token: '...' } }
      if (res.code === 200) {
        localStorage.setItem("token", res.data.token);
        message.success("登录成功");
        navigate("/editor"); // 跳转到编辑器页面
      }
    } catch {
      // 错误已在 request.ts 中统一处理
    }
  };

  return (
    <div
      style={{ display: "flex", justifyContent: "center", marginTop: "100px" }}
    >
      <Card title="AI Note 登录" style={{ width: 400 }}>
        <Form name="login" onFinish={onFinish}>
          <Form.Item
            name="email"
            rules={[{ required: true, message: "请输入邮箱" }]}
          >
            <Input placeholder="Email" />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[{ required: true, message: "请输入密码" }]}
          >
            <Input.Password placeholder="Password" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              登录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default Login;
