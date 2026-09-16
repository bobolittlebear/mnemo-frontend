import type { Editor } from "@tiptap/react";
import {
  Bold,
  Code,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Table,
  Underline,
  Unlink,
  type LucideIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface EditorToolbarProps {
  editor: Editor | null;
}

interface ToolbarButtonProps {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

/**
 * 工具栏按钮：命令式调用 editor.chain()，active 高亮由 editor.isActive() 派生。
 * editor 为 null（首帧）时全部禁用，避免空指针。
 */
const ToolbarButton = ({
  label,
  icon: Icon,
  active = false,
  disabled = false,
  onClick,
}: ToolbarButtonProps) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    aria-pressed={active}
    disabled={disabled}
    onClick={onClick}
    className={`flex items-center justify-center h-8 min-w-8 px-2 rounded-sm text-sm transition-colors ${
      active
        ? "bg-accent text-accent-foreground"
        : "hover:bg-accent hover:text-accent-foreground"
    } disabled:opacity-40 disabled:pointer-events-none`}
  >
    <Icon className="h-4 w-4" />
  </button>
);

/**
 * 编辑器工具栏：只做 UI 触发入口，格式命令来自 tiptap 扩展（StarterKit 内置 link/列表/下划线，
 * Table/TaskList 显式注册）。不读写业务状态，编辑内容仍由 Markdown 扩展回写 markdown。
 */
const EditorToolbar = ({ editor }: EditorToolbarProps) => {
  const disabled = !editor;
  // 多重判断：光标落在表格任意位置（表格/行/单元格/表头）都视为“在表格内”，
  // 用于启用增删行列菜单项。配合 shouldRerenderOnTransaction 实时更新。
  const inTable =
    !!editor &&
    (editor.isActive("table") ||
      editor.isActive("tableRow") ||
      editor.isActive("tableCell") ||
      editor.isActive("tableHeader"));
  const linkActive = editor?.isActive("link") ?? false;

  const handleLinkClick = () => {
    if (!editor) return;
    if (linkActive) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const href = window.prompt("输入链接地址", "https://");
    if (href) {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1 p-2 border-b border-border bg-muted/30 shrink-0">
      <ToolbarButton
        label="一级标题"
        icon={Heading1}
        active={editor?.isActive("heading", { level: 1 }) ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
      />
      <ToolbarButton
        label="二级标题"
        icon={Heading2}
        active={editor?.isActive("heading", { level: 2 }) ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <ToolbarButton
        label="三级标题"
        icon={Heading3}
        active={editor?.isActive("heading", { level: 3 }) ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
      />
      <ToolbarButton
        label="四级标题"
        icon={Heading4}
        active={editor?.isActive("heading", { level: 4 }) ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 4 }).run()}
      />
      <ToolbarButton
        label="五级标题"
        icon={Heading5}
        active={editor?.isActive("heading", { level: 5 }) ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 5 }).run()}
      />
      <ToolbarButton
        label="六级标题"
        icon={Heading6}
        active={editor?.isActive("heading", { level: 6 }) ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 6 }).run()}
      />
      <ToolbarButton
        label="加粗"
        icon={Bold}
        active={editor?.isActive("bold") ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        label="斜体"
        icon={Italic}
        active={editor?.isActive("italic") ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      />
      <ToolbarButton
        label="下划线"
        icon={Underline}
        active={editor?.isActive("underline") ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleUnderline().run()}
      />
      <ToolbarButton
        label="有序列表"
        icon={ListOrdered}
        active={editor?.isActive("orderedList") ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
      />
      <ToolbarButton
        label="无序列表"
        icon={List}
        active={editor?.isActive("bulletList") ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        label="任务列表"
        icon={ListChecks}
        active={editor?.isActive("taskList") ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleTaskList().run()}
      />
      <ToolbarButton
        label="引用"
        icon={Quote}
        active={editor?.isActive("blockquote") ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleBlockquote().run()}
      />
      <ToolbarButton
        label="分割线"
        icon={Minus}
        disabled={disabled}
        onClick={() => editor?.chain().focus().setHorizontalRule().run()}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="表格"
            aria-label="表格"
            disabled={disabled}
            className="flex items-center justify-center h-8 min-w-8 px-2 rounded-sm text-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40 disabled:pointer-events-none"
          >
            <Table className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            disabled={inTable}
            onSelect={() =>
              editor
                ?.chain()
                .focus()
                .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                .run()
            }
          >
            插入表格
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!inTable}
            onSelect={(e) => {
              e.preventDefault();
              editor?.chain().focus().addRowBefore().run();
            }}
          >
            在上方插入行
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!inTable}
            onSelect={(e) => {
              e.preventDefault();
              editor?.chain().focus().addRowAfter().run();
            }}
          >
            在下方插入行
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!inTable}
            onSelect={(e) => {
              e.preventDefault();
              editor?.chain().focus().deleteRow().run();
            }}
          >
            删除行
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!inTable}
            onSelect={(e) => {
              e.preventDefault();
              editor?.chain().focus().addColumnBefore().run();
            }}
          >
            在左侧插入列
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!inTable}
            onSelect={(e) => {
              e.preventDefault();
              editor?.chain().focus().addColumnAfter().run();
            }}
          >
            在右侧插入列
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!inTable}
            onSelect={(e) => {
              e.preventDefault();
              editor?.chain().focus().deleteColumn().run();
            }}
          >
            删除列
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!inTable}
            onSelect={(e) => {
              e.preventDefault();
              editor?.chain().focus().deleteTable().run();
            }}
          >
            删除表格
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* 行内代码（`abc`）与下方代码块（``` 多行）是两套独立命令：
          toggleCode 作用于 code mark，toggleCodeBlock 作用于 codeBlock 节点 */}
      <ToolbarButton
        label="行内代码"
        icon={Code}
        active={editor?.isActive("code") ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleCode().run()}
      />
      <ToolbarButton
        label="代码块"
        icon={Code2}
        active={editor?.isActive("codeBlock") ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
      />
      <ToolbarButton
        label={linkActive ? "解除链接" : "插入链接"}
        icon={linkActive ? Unlink : Link}
        active={linkActive}
        disabled={disabled}
        onClick={handleLinkClick}
      />
    </div>
  );
};

export default EditorToolbar;
