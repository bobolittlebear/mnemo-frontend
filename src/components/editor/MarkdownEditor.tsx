import React, { useMemo } from "react";
import { Editor } from "@bytemd/react";
import gfm from "@bytemd/plugin-gfm";
// import "bytemd/dist/index.min.css"; // 引入核心样式
// import "bytemd/dist/style.css";
import "bytemd/dist/index.css";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  renderSaveStatus: () => React.ReactNode; // 用于显示保存状态指示器的函数
}

const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  value,
  onChange,
  renderSaveStatus,
}) => {
  // 使用 useMemo 缓存插件实例，避免每次渲染都重新创建插件对象
  const plugins = useMemo(() => [gfm()], []);

  return (
    <div className="w-full h-full border rounded-md overflow-hidden bg-background markdown-body">
      <Editor
        value={value}
        plugins={plugins}
        mode="auto"
        onChange={onChange}
        placeholder="在这里记录你的灵感，或让 AI 帮你完善笔记..."
      />
      {renderSaveStatus && (
        <div className="p-2 border-t border-gray-200 bg-gray-50 text-sm">
          {renderSaveStatus()}
        </div>
      )}
    </div>
  );
};

export default MarkdownEditor;
