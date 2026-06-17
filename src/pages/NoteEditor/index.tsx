import { useState } from "react";
import { Row, Col, Input } from "antd";
import AIChatWindow from "./AiChatWindow";

const { TextArea } = Input;

// type Message = {
//   id: number;
//   role: "user" | "assistant";
//   content: string;
// };

const NoteEditor = () => {
  const [noteContent, setNoteContent] = useState(""); // 笔记内容状态

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
            <AIChatWindow />
          </div>
        </Col>
      </Row>
    </div>
  );
};

export default NoteEditor;
