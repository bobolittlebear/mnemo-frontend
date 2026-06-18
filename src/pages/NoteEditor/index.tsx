import { useState } from "react";
import AIChatWindow from "./AiChatWindow";
import { Textarea } from "@/components/ui/textarea";

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
        <div className="w-1/2">
          <Textarea
            value={noteContent}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              setNoteContent(e.target.value)
            }
            placeholder="在这里记录你的灵感..."
            className="h-full w-full resize-none text-base"
          />
        </div>

        {/* 右侧：AI 会话窗口 */}
        <div className="w-1/2 flex flex-col border-l border-gray-200 pl-4">
          {/* <div className="flex-1 overflow-auto mb-4">
            <AIChatWindow />
          </div> */}
          <AIChatWindow />
        </div>
      </div>
    </div>
  );
};

export default NoteEditor;
