import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AIChatWindow from "./AiChatWindow";
import NotebookNoteList from "@/components/NotebookNoteList";
import NoteEditorPane from "@/components/NoteEditorPane";
import { getNotes, createNote, deleteNote, getNoteById } from "@/api/note";
import {
  getNotebooks,
  createNotebook,
  deleteNotebook,
} from "@/api/notebook";
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
  // 当前笔记本下的笔记列表
  const [notes, setNotes] = useState<Note[]>([]);
  // 仅应用最新一次笔记拉取的结果，防止快速切换笔记本时旧响应覆盖新响应
  const notesRequestIdRef = useRef<string | null>(null);

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

  // 选中「当前笔记本」：切换选中并拉取该笔记本的笔记
  // getNotes 未暴露 signal，改用请求 id 守卫：仅应用最新一次请求的结果
  const handleSelectNotebook = async (nb: Notebook) => {
    setSelectedNotebookId(nb.id);
    notesRequestIdRef.current = nb.id;
    try {
      const res = await getNotes({ notebookId: nb.id });
      if (notesRequestIdRef.current === nb.id) {
        setNotes(res.data);
      }
    } catch (error) {
      if (notesRequestIdRef.current === nb.id) {
        console.error("加载笔记列表失败", error);
      }
    }
  };

  // 新建笔记本：成功后头部插入并设为当前（选中即展开）
  const handleCreateNotebook = async (title: string) => {
    try {
      const res = await createNotebook(title);
      const newNotebook = res.data;
      setNotebooks((prev) => [newNotebook, ...prev]);
      setSelectedNotebookId(newNotebook.id);
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

  // 新建笔记：直接创建空笔记并入列，随后跳转进入编辑态（编辑区渲染归步骤 6）
  const handleCreateNote = async (notebookId: string) => {
    try {
      const res = await createNote({ title: "", content: "", notebookId });
      const newNote = res.data;
      setNotes((prev) => [newNote, ...prev]);
      navigate(`/note/${newNote.id}`);
    } catch (error) {
      console.error("创建笔记失败", error);
    }
  };

  // 删除笔记：成功后移除；若删除的是当前编辑笔记则回退到 /note 清空编辑区
  const handleDeleteNote = async (noteId: string) => {
    try {
      await deleteNote(noteId);
      setNotes((prev) => prev.filter((note) => note.id !== noteId));
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
          notes={notes}
          selectedNoteId={selectedNoteId}
          onSelectNote={handleSelectNote}
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
