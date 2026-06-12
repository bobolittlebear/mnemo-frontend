import { useState } from "react";
import { Row, Col, Input, Button, List, Avatar } from "antd";
import { UserOutlined, RobotOutlined, SendOutlined } from "@ant-design/icons";
import ReactMarkdown from "react-markdown";

const { TextArea } = Input;

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
};

const NoteEditor = () => {
  const [noteContent, setNoteContent] = useState(""); // 笔记内容状态
  const [messages, setMessages] = useState<Message[]>([]); // 聊天记录状态
  const [inputText, setInputText] = useState(""); // 聊天输入框状态

  // 发送消息给 AI (后续会替换为 SSE 流式请求)
  const handleSendMessage = () => {
    if (!inputText.trim()) return;

    // 1. 添加用户消息到界面
    const userMsg: Message = {
      id: Date.now(),
      role: "user",
      content: inputText,
    };
    setMessages((prev) => [...prev, userMsg]);

    // TODO: 在这里发起 fetch POST 请求到 /api/ai/chat-stream

    setInputText(""); // 清空输入框
  };

  return (
    <div style={{ height: "100vh", padding: "20px" }}>
      <Row gutter={16} style={{ height: "100%" }}>
        {/* 左侧：笔记编辑区 */}
        <Col span={12}>
          <TextArea
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            placeholder="在这里记录你的灵感..."
            style={{ height: "100%", resize: "none", fontSize: "16px" }}
            autoSize={{ minRows: 20 }}
          />
        </Col>

        {/* 右侧：AI 会话窗口 */}
        <Col
          span={12}
          style={{
            display: "flex",
            flexDirection: "column",
            borderLeft: "1px solid #eee",
            paddingLeft: "16px",
          }}
        >
          {/* 消息列表区域 */}
          <div style={{ flex: 1, overflowY: "auto", marginBottom: "16px" }}>
            <List
              dataSource={messages}
              renderItem={(msg: any) => (
                <List.Item style={{ border: "none", padding: "8px 0" }}>
                  <Avatar
                    icon={
                      msg.role === "user" ? <UserOutlined /> : <RobotOutlined />
                    }
                  />
                  <div style={{ marginLeft: "12px" }}>
                    {msg.role === "assistant" ? (
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    ) : (
                      <span>{msg.content}</span>
                    )}
                  </div>
                </List.Item>
              )}
            />
          </div>

          {/* 底部输入区域 */}
          <div style={{ display: "flex", gap: "8px" }}>
            <Input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onPressEnter={handleSendMessage}
              placeholder="向 AI 提问关于这篇笔记的问题..."
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSendMessage}
            />
          </div>
        </Col>
      </Row>
    </div>
  );
};

export default NoteEditor;
