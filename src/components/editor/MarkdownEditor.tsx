import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Markdown, type MarkdownStorage } from "tiptap-markdown";
import { type ReactNode } from "react";
import "github-markdown-css/github-markdown-light.css";
import "./editor.css";
import EditorToolbar from "./EditorToolbar";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  renderSaveStatus: () => ReactNode; // 用于显示保存状态指示器的函数
}

/**
 * 基于 tiptap 的 Markdown 编辑器（最小闭环）。
 * - 编辑状态存于 tiptap 内部：useEditor 初始化时读取 value 一次；
 * - 编辑后经 Markdown 扩展的 getMarkdown() 回写 markdown 字符串；
 * - 父级以 key={noteId} 重建本组件，切换笔记时整体重建，无需 effect 同步 value。
 */
const MarkdownEditor = ({
  value,
  onChange,
  renderSaveStatus,
}: MarkdownEditorProps) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: true,
          HTMLAttributes: {
            target: "_blank",
            rel: "noopener noreferrer",
          },
        },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Markdown.configure({
        html: true,
        breaks: true,
        tightLists: true,
        tightListClass: "tight",
        bulletListMarker: "-",
        linkify: false,
        // "breaks": false,
        transformPastedText: false,
        transformCopiedText: false,
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: "focus:outline-none min-h-[200px]",
      },
    },
    onUpdate: ({ editor }) => {
      // tiptap-markdown 运行时在 editor.storage.markdown 挂载 getMarkdown，
      // 但其类型未扩充 tiptap 的 Storage，这里按 MarkdownStorage 窄化取值。
      const markdownStorage = (
        editor.storage as unknown as { markdown: MarkdownStorage }
      ).markdown;
      const md = markdownStorage.getMarkdown();
      onChange(md);
    },
  });

  return (
    <div className="tiptap-editor w-full h-full border rounded-md overflow-hidden bg-background flex flex-col">
      {/* 工具栏：shrink-0 固定不随内容滚动 */}
      <EditorToolbar editor={editor} />
      {/* ⬇️ 编辑区域：flex-1 占满剩余空间，overflow-y-auto 出滚动条 */}
      <div className="flex-1 overflow-y-auto">
        <EditorContent
          editor={editor}
          className="markdown-body p-6 min-h-full"
        />
      </div>

      {/* 底部状态栏固定在底部，不随内容滚动 */}
      {renderSaveStatus && (
        <div className="shrink-0 p-2 border-t border-border bg-muted/40 text-sm">
          {renderSaveStatus()}
        </div>
      )}
    </div>
  );
};

export default MarkdownEditor;
