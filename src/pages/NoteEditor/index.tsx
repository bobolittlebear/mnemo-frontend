import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AIChatWindow from "./AiChatWindow";
import NotebookNoteList from "@/components/NotebookNoteList";
import NoteEditorPane from "@/components/NoteEditorPane";
import { getNotes, createNote, deleteNote, getNoteById } from "@/api/note";
import { getNotebooks, createNotebook, deleteNotebook } from "@/api/notebook";
import type { Notebook, Note } from "@/api/notebook";

const NoteEditor = () => {
  const { id: routeNoteId } = useParams();
  const navigate = useNavigate();
  // 当前编辑笔记 id 由路由派生：高亮与路由保持同步，无需单独 state 与镜像 effect
  const selectedNoteId = routeNoteId ?? null;

  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(
    null,
  );
  const [isLoadingNotebooks, setIsLoadingNotebooks] = useState(false);
  // 各笔记本的笔记列表：按 notebookId 分桶，支持多笔记本同时展开且各自独立显示
  const [notesByNotebook, setNotesByNotebook] = useState<
    Record<string, Note[]>
  >({});
  // 已加载过笔记的笔记本集合，避免重复请求
  const loadedNotebooksRef = useRef<Set<string>>(new Set());
  // 受控展开集合：数组记录多个笔记本，天然非互斥
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  // 挂载时拉取笔记本列表；cleanup abort 防止卸载后 setState（异步 effect 内 setState 合法）
  useEffect(() => {
    const controller = new AbortController();

    const loadNotebooks = async () => {
      setIsLoadingNotebooks(true);
      try {
        const res = await getNotebooks();
        if (!controller.signal.aborted) {
          setNotebooks(res.data);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("加载笔记本列表失败", error);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingNotebooks(false);
        }
      }
    };

    loadNotebooks();

    return () => controller.abort();
  }, []);

  // 当前编辑笔记详情：由路由 noteId 驱动异步加载，abort 守卫防卸载后 setState
  // 不在 effect 体内做同步 setState：routeNoteId 置空时不主动清 note，
  // 渲染层用「note 且 note.id === routeNoteId」兜底，旧值不会串到新路由
  const [note, setNote] = useState<Note | null>(null);
  const [isLoadingNote, setIsLoadingNote] = useState(false);

  useEffect(() => {
    if (!routeNoteId) {
      return;
    }
    const controller = new AbortController();
    (async () => {
      setIsLoadingNote(true);
      try {
        const res = await getNoteById(routeNoteId);
        if (!controller.signal.aborted) {
          setNote(res.data);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("加载笔记详情失败", error);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingNote(false);
        }
      }
    })();
    return () => controller.abort();
  }, [routeNoteId]);

  // 选中「当前笔记本」：仅切换高亮；笔记加载与展开交由 handleToggleExpand 处理
  const handleSelectNotebook = (nb: Notebook) => {
    setSelectedNotebookId(nb.id);
  };

  // 切换笔记本展开：非互斥（数组记录）；首次展开时拉取该笔记本笔记并存入分桶
  const handleToggleExpand = (notebookId: string) => {
    setExpandedIds((prev) =>
      prev.includes(notebookId)
        ? prev.filter((id) => id !== notebookId)
        : [...prev, notebookId],
    );
    if (!loadedNotebooksRef.current.has(notebookId)) {
      loadedNotebooksRef.current.add(notebookId);
      getNotes({ notebookId })
        .then((res) => {
          setNotesByNotebook((prev) => ({ ...prev, [notebookId]: res.data }));
        })
        .catch((error) => {
          loadedNotebooksRef.current.delete(notebookId);
          console.error("加载笔记列表失败", error);
        });
    }
  };

  // 新建笔记本：成功后头部插入并设为当前，默认展开（空列表）
  const handleCreateNotebook = async (title: string) => {
    try {
      const res = await createNotebook(title);
      const newNotebook = res.data;
      setNotebooks((prev) => [newNotebook, ...prev]);
      setSelectedNotebookId(newNotebook.id);
      setExpandedIds((prev) => [...prev, newNotebook.id]);
      setNotesByNotebook((prev) => ({ ...prev, [newNotebook.id]: [] }));
    } catch (error) {
      console.error("创建笔记本失败", error);
    }
  };

  // 删除笔记本：成功后移除；若删的是当前选中则清空选中态
  const handleDeleteNotebook = async (id: string) => {
    try {
      await deleteNotebook(id);
      setNotebooks((prev) => prev.filter((nb) => nb.id !== id));
      setSelectedNotebookId((prev) => (prev === id ? null : prev));
    } catch (error) {
      console.error("删除笔记本失败", error);
    }
  };

  // 新建笔记：直接创建空笔记并入对应笔记本分桶，随后跳转进入编辑态
  const handleCreateNote = async (notebookId: string) => {
    try {
      const res = await createNote({
        title: "未命名笔记",
        content: "",
        notebookId,
      });
      const newNote = res.data;
      setNotesByNotebook((prev) => ({
        ...prev,
        [notebookId]: [newNote, ...(prev[notebookId] ?? [])],
      }));
      // 确保该笔记本处于展开态，新建笔记立即可见
      setExpandedIds((prev) =>
        prev.includes(notebookId) ? prev : [...prev, notebookId],
      );
      navigate(`/note/${newNote.id}`);
    } catch (error) {
      console.error("创建笔记失败", error);
    }
  };

  // 删除笔记：从对应笔记本分桶中移除（按 noteId 扫描，无需预先知道 notebookId）；
  // 若删除的是当前编辑笔记则回退到 /note 清空编辑区
  const handleDeleteNote = async (noteId: string) => {
    try {
      await deleteNote(noteId);
      setNotesByNotebook((prev) => {
        const next = { ...prev };
        for (const id of Object.keys(next)) {
          next[id] = next[id].filter((note) => note.id !== noteId);
        }
        return next;
      });
      if (routeNoteId === noteId) {
        navigate("/note");
      }
    } catch (error) {
      console.error("删除笔记失败", error);
    }
  };

  // 点击笔记行：跳转到该笔记的编辑态（编辑区载入归步骤 6）
  const handleSelectNote = (note: Note) => {
    navigate(`/note/${note.id}`);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {/* 左侧：笔记列表侧边栏 */}
      <aside className="w-64 shrink-0 border-r border-border">
        <NotebookNoteList
          notebooks={notebooks}
          notes={Object.values(notesByNotebook).flat()}
          selectedNoteId={selectedNoteId}
          onSelectNote={handleSelectNote}
          expandedIds={expandedIds}
          onToggleExpand={handleToggleExpand}
          selectedNotebookId={selectedNotebookId}
          isLoadingNotebooks={isLoadingNotebooks}
          onSelectNotebook={handleSelectNotebook}
          onAddNotebook={handleCreateNotebook}
          onDeleteNotebook={handleDeleteNotebook}
          onAddNote={handleCreateNote}
          onDeleteNote={handleDeleteNote}
        />
      </aside>

      {/* 中间：笔记编辑区 —— 空态 / 载入中 / 已加载编辑区（key 重置避免跨笔记状态串台） */}
      <main className="flex-1 min-w-0 flex flex-col">
        {!routeNoteId ? (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-sm text-muted-foreground">
              选择或新建笔记开始记录
            </span>
          </div>
        ) : isLoadingNote || !(note && note.id === routeNoteId) ? (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-sm text-muted-foreground">载入中…</span>
          </div>
        ) : (
          <NoteEditorPane
            key={note.id}
            noteId={note.id}
            initialTitle={note.title}
            initialContent={note.content}
          />
        )}
      </main>

      {/* 右侧：AI 会话窗口 */}
      <div className="w-[500px] shrink-0 border-l border-border">
        <AIChatWindow />
      </div>
    </div>
  );
};

export default NoteEditor;
