import { useState } from "react";
import { Input } from "@/components/ui/input";
import MarkdownEditor from "@/components/editor/MarkdownEditor";
import { useAutoSave } from "@/hooks/useAutoSave";

// useAutoSave 未导出其状态类型，此处按需声明一份与内部定义一致的联合类型
type SaveStatus = "idle" | "saving" | "saved" | "error";

/** 保存状态文案：仅 saving/saved/error 时展示，idle 渲染空 */
const SaveStatusText = ({ status }: { status: SaveStatus }) => {
  if (status === "saving") {
    return <span className="text-muted-foreground">保存中…</span>;
  }
  if (status === "saved") {
    return <span className="text-muted-foreground">已保存</span>;
  }
  if (status === "error") {
    return <span className="text-destructive">保存失败</span>;
  }
  return null;
};

type NoteEditorPaneProps = {
  noteId: string;
  initialTitle: string;
  initialContent: string;
  onTitleChange?: (noteId: string, title: string) => void;
};

/**
 * 笔记编辑区：标题 Input + MarkdownEditor，接入 useAutoSave 自动保存。
 * 父级以 key={noteId} 渲染本组件，切换笔记时整体重建，初始值即最新加载值，
 * 因此不会跨笔记串台，useAutoSave 首次也不会误保存。
 */
const NoteEditorPane = ({
  noteId,
  initialTitle,
  initialContent,
  onTitleChange,
}: NoteEditorPaneProps) => {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const { status } = useAutoSave({ noteId, content, title });

  return (
    <>
      {/* 标题区：固定高度，输入即改标题并触发自动保存 */}
      <div className="h-12 shrink-0 flex items-center px-4 border-b border-border">
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            onTitleChange?.(noteId, e.target.value);
          }}
          placeholder="无标题"
        />
      </div>
      {/* 编辑器区：占据剩余空间，内部滚动 */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <MarkdownEditor
          value={content}
          onChange={setContent}
          renderSaveStatus={() => <SaveStatusText status={status} />}
        />
      </div>
    </>
  );
};

export default NoteEditorPane;
