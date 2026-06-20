import { useState } from "react";
import AIChatWindow from "./AiChatWindow";
import MarkdownEditor from "@/components/editor/MarkdownEditor";

// type Message = {
//   id: number;
//   role: "user" | "assistant";
//   content: string;
// };

const NoteEditor = () => {
  const [noteContent, setNoteContent] = useState(""); // 笔记内容状态

  return (
    <div className="h-screen p-5">
      <div className="flex h-full gap-4">
        {/* 左侧：笔记编辑区 */}
        <div className="w-1/2 h-full p-4 border-r border-gray-200 flex flex-col">
          <MarkdownEditor value={noteContent} onChange={setNoteContent} />
        </div>

        {/* 右侧：AI 会话窗口 */}
        <div className="w-1/2 flex flex-col border-l border-gray-200 pl-4">
          <AIChatWindow />
        </div>
      </div>
    </div>
  );
};

export default NoteEditor;
