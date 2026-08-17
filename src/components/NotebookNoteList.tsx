import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  BookOpen,
  Plus,
  Trash2,
} from "lucide-react";
import type { Notebook, Note } from "@/api/notebook";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type NotebookNoteListProps = {
  /** 全部笔记本（数据由父组件注入，本组件不发起请求） */
  notebooks: Notebook[];
  /** 全部笔记（组件内部按 notebookId 过滤展示） */
  notes: Note[];
  /** 当前选中笔记 id，用于派生高亮 */
  selectedNoteId?: string | null;
  /** 点击笔记回调（导航与编辑区载入由父组件处理） */
  onSelectNote: (note: Note) => void;
  /** 受控展开集合（可选）；缺省则组件内部自管展开态 */
  expandedIds?: string[];
  /** 受控模式下切换展开的回调（可选，父级可按需加载该笔记本笔记） */
  onToggleExpand?: (notebookId: string) => void;
  /** 当前选中笔记本 id：派生行高亮，且选中笔记本默认展开 */
  selectedNotebookId?: string | null;
  /** 点击笔记本行回调（切换当前笔记本） */
  onSelectNotebook?: (notebook: Notebook) => void;
  /** 新增笔记本（参数为标题） */
  onAddNotebook?: (title: string) => void;
  /** 删除笔记本 */
  onDeleteNotebook?: (notebookId: string) => void;
  /** 在某笔记本下新建笔记（参数为该笔记本 id；由父组件直接创建并跳转，不走 Dialog） */
  onAddNote?: (notebookId: string) => void;
  /** 删除笔记 */
  onDeleteNote?: (noteId: string) => void;
  /** 列表加载中占位 */
  isLoadingNotebooks?: boolean;
};

const NotebookNoteList = ({
  notebooks,
  notes,
  selectedNoteId = null,
  onSelectNote,
  expandedIds,
  onToggleExpand,
  selectedNotebookId = null,
  onSelectNotebook,
  onAddNotebook,
  onDeleteNotebook,
  onAddNote,
  onDeleteNote,
  isLoadingNotebooks = false,
}: NotebookNoteListProps) => {
  // 纯 UI 态：缺省受控 props 时由组件内部自管展开集合，不在 effect 中镜像 props
  const [internalExpanded, setInternalExpanded] = useState<Set<string>>(
    () => new Set<string>(),
  );
  // 新建/删除 Dialog 的受控状态
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Notebook | null>(null);
  const [deleteNoteTarget, setDeleteNoteTarget] = useState<Note | null>(null);

  // 展开态：受控模式下用 expandedIds；非受控时由内部集合 + 选中派生
  // （选中笔记本始终展开，故新建即选中即可展开，无需在 effect 里同步）
  const isExpanded = (notebookId: string) =>
    expandedIds !== undefined
      ? expandedIds.includes(notebookId)
      : internalExpanded.has(notebookId) || selectedNotebookId === notebookId;

  const toggleExpand = (notebookId: string) => {
    if (expandedIds !== undefined) {
      // 受控模式：交还父组件处理（父级可按需加载该笔记本笔记）
      onToggleExpand?.(notebookId);
      return;
    }
    setInternalExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(notebookId)) {
        next.delete(notebookId);
      } else {
        next.add(notebookId);
      }
      return next;
    });
  };

  const handleCreateConfirm = () => {
    const title = newTitle.trim();
    if (!title) return;
    onAddNotebook?.(title);
    setNewTitle("");
    setCreateOpen(false);
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    onDeleteNotebook?.(deleteTarget.id);
    setDeleteTarget(null);
  };

  const handleDeleteNoteConfirm = () => {
    if (!deleteNoteTarget) return;
    onDeleteNote?.(deleteNoteTarget.id);
    setDeleteNoteTarget(null);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 顶部：新建笔记本入口 */}
      <div className="shrink-0 border-b border-border p-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground"
          onClick={() => setCreateOpen(true)}
        >
          <Plus />
          新建笔记本
        </Button>
      </div>

      {/* 列表区：加载中 / 空态 / 笔记本列表 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoadingNotebooks ? (
          <span className="px-2 py-1.5 text-sm text-muted-foreground">
            加载中…
          </span>
        ) : notebooks.length === 0 ? (
          <span className="px-2 py-1.5 text-sm text-muted-foreground">
            还没有笔记本
          </span>
        ) : (
          notebooks.map((nb) => {
            const expanded = isExpanded(nb.id);
            const selected = selectedNotebookId === nb.id;
            const notebookNotes = notes.filter(
              (n) => n != null && n.notebookId === nb.id,
            );

            return (
              <div key={nb.id} className="flex flex-col">
                {/* 笔记本行：点击选中 + 切换展开；删除按钮独立于行内 */}
                <div
                  className={cn(
                    "group flex items-center gap-1 pr-1 cursor-pointer rounded-sm",
                    selected
                      ? "bg-accent text-accent-foreground hover:bg-accent/80"
                      : "hover:bg-muted",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectNotebook?.(nb);
                      toggleExpand(nb.id);
                    }}
                    className="flex flex-1 min-w-0 items-center gap-1 px-2 py-1.5 text-left"
                  >
                    {expanded ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 min-w-0 truncate text-sm">
                      {nb.title}
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="新建笔记"
                    onClick={() => onAddNote?.(nb.id)}
                    className="shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Plus />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`删除 ${nb.title}`}
                    onClick={() => setDeleteTarget(nb)}
                    className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 />
                  </Button>
                </div>

                {/* 展开区：该笔记本下的笔记列表（新建笔记入口已移入笔记本行内） */}
                {expanded &&
                  notebookNotes.map((note) => {
                    const noteSelected = selectedNoteId === note.id;
                    return (
                      <div
                        key={note.id}
                        className={cn(
                          "group flex items-center gap-1 pr-1 cursor-pointer rounded-sm",
                          noteSelected
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-muted",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectNote(note)}
                          className="flex flex-1 min-w-0 items-center gap-1 pl-6 py-1 text-left"
                        >
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="flex-1 min-w-0 truncate text-sm">
                            {note.title || "未命名笔记"}
                          </span>
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`删除 ${note.title || "未命名笔记"}`}
                          onClick={() => setDeleteNoteTarget(note)}
                          className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    );
                  })}
              </div>
            );
          })
        )}
      </div>

      {/* 新建笔记本 Dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setNewTitle("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建笔记本</DialogTitle>
            <DialogDescription>输入名称后点击创建</DialogDescription>
          </DialogHeader>
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="笔记本名称"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateConfirm();
            }}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                取消
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={handleCreateConfirm}
              disabled={!newTitle.trim()}
            >
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 Dialog */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除笔记本</DialogTitle>
            <DialogDescription>
              确定删除「{deleteTarget?.title}」？该操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                取消
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteConfirm}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除笔记确认 Dialog */}
      <Dialog
        open={deleteNoteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteNoteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除笔记</DialogTitle>
            <DialogDescription>
              确定删除「{deleteNoteTarget?.title || "未命名笔记"}
              」？该操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                取消
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteNoteConfirm}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default NotebookNoteList;
