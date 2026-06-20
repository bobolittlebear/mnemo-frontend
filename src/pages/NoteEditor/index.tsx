import { useCallback, useState } from "react";
import AIChatWindow from "./AiChatWindow";
import MarkdownEditor from "@/components/editor/MarkdownEditor";
import { useAutoSave } from "@/hooks/useAutoSave";

const NoteEditor = () => {
  // 从path中解析出id./note/:id
  const path = window.location.pathname;
  const id = path.split("/").pop() || "default-note-id";
  // 模拟获取笔记数据,后续改成请求
  const note = {
    id,
    title: "无标题",
    content: "",
  };

  const [noteContent, setNoteContent] = useState(note.content); // 笔记内容状态
  const [noteTitle] = useState(note.title); // 笔记标题状态
  const { status, lastSavedTime } = useAutoSave({
    noteId: note.id,
    content: noteContent,
    title: noteTitle,
  });

  // 渲染状态指示器
  const renderSaveStatus = useCallback(() => {
    switch (status) {
      case "saving":
        return <span className="text-gray-400">正在保存...</span>;
      case "saved":
        return (
          <span className="text-green-500">
            已保存于 {lastSavedTime?.toLocaleTimeString()}
          </span>
        );
      case "error":
        return <span className="text-red-500">保存失败，请检查网络</span>;
      default:
        return null;
    }
  }, [status, lastSavedTime]);

  return (
    <div className="h-screen p-5">
      <div className="flex h-full gap-4">
        {/* 左侧：笔记编辑区 */}
        <div className="w-1/2 h-full p-4 border-r border-gray-200 flex flex-col">
          <MarkdownEditor
            value={noteContent}
            onChange={setNoteContent}
            renderSaveStatus={renderSaveStatus}
          />
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
