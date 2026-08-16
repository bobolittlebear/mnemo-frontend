import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import BulletList from "@tiptap/extension-bullet-list";
import ListItem from "@tiptap/extension-list-item";
import { Markdown, type MarkdownStorage } from "tiptap-markdown";
import { useRef, type ReactNode } from "react";
import "github-markdown-css/github-markdown-light.css";
import "./editor.css";
import { mdToHtml } from "./markdown-parser";

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
  const editorRef = useRef<Editor | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // 如果 StarterKit 已包含 bulletList/listItem，可以不重复添加
        // 但如果解析有问题，显式添加更安全
      }),
      BulletList,
      ListItem,
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
    content: mdToHtml(value),
    editorProps: {
      attributes: {
        class: "prose max-w-none focus:outline-none min-h-[200px] p-4",
      },
    },
    onUpdate: ({ editor }) => {
      // tiptap-markdown 运行时在 editor.storage.markdown 挂载 getMarkdown，
      // 但其类型未扩充 tiptap 的 Storage，这里按 MarkdownStorage 窄化取值。
      const markdownStorage = (
        editor.storage as unknown as { markdown: MarkdownStorage }
      ).markdown;
      const md = markdownStorage.getMarkdown();
      console.log(md);
      onChange(md);
    },
    onCreate: ({ editor }) => {
      editorRef.current = editor;
    },
    onDestroy: () => {
      editorRef.current = null;
    },
  });

  return (
    <div className="tiptap-editor w-full h-full border rounded-md overflow-hidden bg-background flex flex-col">
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
