import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { createLowlight, common } from "lowlight";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Markdown, type MarkdownStorage } from "tiptap-markdown";
import { useEffect, type ReactNode } from "react";
import "github-markdown-css/github-markdown-light.css";
// 浅色主题 token 着色（.hljs-* 类），与 github-markdown-light.css 风格统一；
// 后续若做暗色编辑器，仅需改为 "highlight.js/styles/github-dark.css"。
import "highlight.js/styles/github.css";
import "./editor.css";
import EditorToolbar from "./EditorToolbar";
import { InlineCodeIme } from "./extensions/inline-code-ime";
import { AiPatchHighlight } from "./extensions/ai-patch-highlight";

// lowlight 单例放在组件外（模块级），避免 useEditor 每次渲染重建实例。
// 代码块语言由 tiptap-markdown 解析 ```lang 时自动写入节点属性，lowlight 据此高亮。
const lowlight = createLowlight(common);

// extensions / editorProps 提到模块级，保持引用稳定：
// 若每次 render 重建数组/对象，useEditor 会收到新 options 并触发 setOptions 反复重配置编辑器，
// 导致表格等结构重新挂载、视觉“跳动”。引用稳定后该问题消失。
const extensions = [
  StarterKit.configure({
    link: {
      openOnClick: true,
      HTMLAttributes: {
        target: "_blank",
        rel: "noopener noreferrer",
      },
    },
    // 禁用内置 codeBlock，交由低层的 CodeBlockLowlight（支持语法高亮）注册，
    // 避免两个同名扩展重复注册冲突。
    codeBlock: false,
  }),
  CodeBlockLowlight.configure({ lowlight }),
  TaskList,
  TaskItem.configure({ nested: true }),
  // resizable 关掉：列宽拖拽手柄（columnResizing）是 hover 列边界时行高跳动的元凶——
  // 本项目未引入 tiptap 官方 table 样式（.column-resize-handle 绝对定位缺失会撑高行）。
  // 增/删行/列命令不依赖 resizable，关闭不影响核心功能。
  Table.configure({ resizable: false }),
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
    transformPastedText: true,
    transformCopiedText: false,
  }),
  // 排在最后：让 StarterKit code mark 的 inputRule（英文输入法）先跑完，
  // 本扩展再兜底处理 IME 下残留的裸反引号。详见该文件顶部注释。
  InlineCodeIme,
  // AI 工具写入高亮（设计 §7.3）：由 editorExecutor 在同一次写入事务里打上，
  // 用户 mousedown 或 15s 后自行消散
  AiPatchHighlight,
];

const editorProps = {
  attributes: {
    class: "focus:outline-none min-h-[200px]",
  },
};

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  renderSaveStatus: () => ReactNode; // 用于显示保存状态指示器的函数
  /**
   * 编辑器实例就绪 / 被替换后回调真实 Editor 实例；卸载时回调 null。
   * 父级持有 editorRef，必须在每次回调时刷新——换笔记会以 key 重挂载本组件，
   * 实例随之更换，否则 ref 会指向已销毁的编辑器。
   */
  onEditorReady?: (editor: Editor | null) => void;
  /** 受控可编辑态：整 run 锁期间由父级置 false（默认 true） */
  editable?: boolean;
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
  onEditorReady,
  editable = true,
}: MarkdownEditorProps) => {
  const editor = useEditor({
    // extensions / editorProps 为模块级稳定引用（见文件顶部），避免反复重建编辑器
    extensions,
    content: value,
    editorProps,
    // 关键：选区/内容变化时触发组件重渲染，工具栏 isActive / inTable 才能实时更新
    // （否则光标移入表格时下拉菜单的增删行项永远 disabled）。
    shouldRerenderOnTransaction: true,
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

  // 实例就绪 / 被替换后上交引用，卸载时交回 null；onEditorReady 由父级 useCallback 稳定，
  // 否则本 effect 会随父级每次渲染重跑（虽只是重复赋值，也无意义）。
  // cleanup 里的 null 是必须的：useEditor 卸载时会 destroy 实例，父级 ref 不清就
  // 会一直指向死编辑器，AI 工具执行会往上面 dispatch
  useEffect(() => {
    if (!editor) return;
    onEditorReady?.(editor);
    return () => onEditorReady?.(null);
  }, [editor, onEditorReady]);

  // 受控可编辑态：整 run 锁的唯一落点（锁态由父级 state 驱动，不在 effect 内 setState 回读）
  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

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
