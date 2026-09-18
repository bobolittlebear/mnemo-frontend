import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Editor } from "@tiptap/react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import AIChatWindow from "./AiChatWindow";
import { createEditorBridge } from "./editorBridge";
import NotebookNoteList from "@/components/NotebookNoteList";
import NoteEditorPane from "@/components/NoteEditorPane";
import { Button } from "@/components/ui/button";
import { getNumber, setNumber, getBool, setBool } from "@/utils/layoutStorage";
import { getNotes, createNote, deleteNote, getNoteById } from "@/api/note";
import { getNotebooks, createNotebook, deleteNotebook } from "@/api/notebook";
import type { Notebook, Note } from "@/api/notebook";

/** 布局偏好的 localStorage key（改前缀时只改这里） */
const LAYOUT_KEYS = {
  sidebarWidth: "mnemo:layout:sidebarWidth",
  aiWidth: "mnemo:layout:aiWidth",
  sidebarCollapsed: "mnemo:layout:sidebarCollapsed",
  aiCollapsed: "mnemo:layout:aiCollapsed",
} as const;

// 默认宽沿用改造前的写死值（aside w-64 = 256、AI 栏 w-[500px]），老用户视觉不变
const SIDEBAR_WIDTH_DEFAULT = 256;
const AI_WIDTH_DEFAULT = 500;
// 拖拽边界：左栏窄于 200 放不下条目文字，右栏窄于 320 对话气泡几乎不可读
const SIDEBAR_WIDTH_RANGE = { min: 200, max: 480 } as const;
const AI_WIDTH_RANGE = { min: 320, max: 800 } as const;
/** 收起态宽度：恰好容纳一个展开按钮（size-7 = 28px + 两侧各 6px 留白） */
const COLLAPSED_WIDTH = 40;
/** 拖拽手柄宽度 */
const RESIZE_HANDLE_WIDTH = 5;

/** 把宽度夹到允许区间；持久化读回的值与拖拽过程中的实时值都走这里 */
const clampWidth = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

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
          // 标题取值镜像同步刷成新笔记的标题，否则 bridge 会拿上一笔记的标题算 docHash
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

  // 当前编辑器实例：NoteEditorPane 按 key={noteId} 重挂载，每次重挂载都要重新写入，
  // 否则 bridge 会指向已销毁的编辑器（选区/正文读不到，docHash 失真）
  const editorRef = useRef<Editor | null>(null);
  // 整 run 锁（设计 §3.3）：AI 写模式 run 期间编辑器只读，run_finished / 取消后释放
  const [editorLocked, setEditorLocked] = useState(false);
  // 就绪与被销毁都会回调本函数：卸载（含换笔记重挂载）时传 null。
  // 不置空的话 editorRef 会一直指着已销毁的实例，AI 的工具执行会往死编辑器里 dispatch
  const handleEditorReady = useCallback((editor: Editor | null) => {
    editorRef.current = editor;
  }, []);

  // 标题唯一写入口：用户输入（onTitleChange）与 AI update_title（bridge.setTitle）都走这里。
  // 只动 React 状态，不镜像任何 ref：工具回执要的「应用后立刻可读的标题」由 bridge
  // 自己的 run 级覆写负责（见 editorBridge.setTitle），那边不依赖渲染时机
  const applyTitle = useCallback((id: string, newTitle: string) => {
    // 更新所有分桶中匹配 noteId 的标题（驱动左侧列表跟随）
    setNotesByNotebook((prev) => {
      const next = { ...prev };
      for (const nbId of Object.keys(next)) {
        next[nbId] = next[nbId].map((n) =>
          n.id === id ? { ...n, title: newTitle } : n,
        );
      }
      return next;
    });
    // 同步当前编辑笔记详情：受控标题由 note.title 派生，这里就是它的真值来源
    setNote((prev) =>
      prev && prev.id === id ? { ...prev, title: newTitle } : prev,
    );
  }, []);

  // 受控标题派生自 note，不另立 state：applyTitle 已回写 note，两份状态必然打架。
  // note 落后于路由时（换笔记加载中）渲染层走「载入中」，不会把上一笔记的标题画出来
  const noteTitle = note?.title ?? "";

  // 编辑器桥的「工厂」（而非实例）：AI 对话框在发送那一刻调用它拿 bridge。
  // 为何不在渲染期就造好实例：渲染期把一个读 ref 的取值函数交给工厂，会被
  // react-hooks/refs 判定为「渲染期访问 ref」（规则看不穿工厂只是暂存取值函数）。
  // 推迟到发送时构造还有个好处——bridge 读的永远是当前实例，无需镜像状态。
  const getEditorBridge = useCallback(
    () =>
      createEditorBridge(
        () => editorRef.current,
        () => noteTitle,
        (nextTitle) => applyTitle(routeNoteId ?? "", nextTitle),
      ),
    [applyTitle, noteTitle, routeNoteId],
  );

  // ── 三栏布局：宽度拖拽 + 收起态（均持久化到 localStorage） ──
  // 初值用 lazy initializer 从存储读一次，避免把读存储塞进渲染期的重复计算。
  // 读回值同样过 clamp：手改过 localStorage 或换到更小的窗口时，宽度仍合法
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    clampWidth(
      getNumber(LAYOUT_KEYS.sidebarWidth, SIDEBAR_WIDTH_DEFAULT),
      SIDEBAR_WIDTH_RANGE.min,
      SIDEBAR_WIDTH_RANGE.max,
    ),
  );
  const [aiWidth, setAiWidth] = useState(() =>
    clampWidth(
      getNumber(LAYOUT_KEYS.aiWidth, AI_WIDTH_DEFAULT),
      AI_WIDTH_RANGE.min,
      AI_WIDTH_RANGE.max,
    ),
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    getBool(LAYOUT_KEYS.sidebarCollapsed, false),
  );
  const [aiCollapsed, setAiCollapsed] = useState(() =>
    getBool(LAYOUT_KEYS.aiCollapsed, false),
  );

  useEffect(() => {
    setNumber(LAYOUT_KEYS.sidebarWidth, sidebarWidth);
  }, [sidebarWidth]);

  useEffect(() => {
    setNumber(LAYOUT_KEYS.aiWidth, aiWidth);
  }, [aiWidth]);

  useEffect(() => {
    setBool(LAYOUT_KEYS.sidebarCollapsed, sidebarCollapsed);
  }, [sidebarCollapsed]);

  useEffect(() => {
    setBool(LAYOUT_KEYS.aiCollapsed, aiCollapsed);
  }, [aiCollapsed]);

  /**
   * 拖拽手柄的按下处理（左右两侧共用一套）。
   *
   * resolveWidth 把指针的 clientX 换算成该栏宽度，applyWidth 落到对应 state。
   * 拖拽期间给 body 锁 cursor / userSelect：指针移出手柄后光标不会闪回箭头，
   * 文本也不会被误选中；松手（或 pointercancel）统一复位并摘掉全局监听。
   */
  const startResize = (
    e: React.PointerEvent<HTMLDivElement>,
    resolveWidth: (clientX: number) => number,
    applyWidth: (width: number) => void,
  ) => {
    e.preventDefault();
    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMove = (event: PointerEvent) => {
      applyWidth(resolveWidth(event.clientX));
    };

    const handleEnd = () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleEnd);
    window.addEventListener("pointercancel", handleEnd);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {/* 左侧：笔记列表侧边栏（收起态只剩一个展开按钮） */}
      <aside
        style={{ width: sidebarCollapsed ? COLLAPSED_WIDTH : sidebarWidth }}
        className="relative shrink-0 border-r border-border bg-gray"
      >
        {sidebarCollapsed && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="展开目录栏"
            title="展开目录栏"
            onClick={() => setSidebarCollapsed(false)}
            className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
          >
            <PanelLeftOpen />
          </Button>
        )}
        {/* 收起态只隐藏、不卸载：列表的滚动位置等内部状态得以保留，展开即原样恢复 */}
        <div className={sidebarCollapsed ? "hidden" : "h-full"}>
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
            // 收起按钮交给列表头部渲染：与「新建笔记本」按钮同处一行流式布局，
            // 不用绝对定位去压住它
            topRightSlot={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="收起目录栏"
                title="收起目录栏"
                onClick={() => setSidebarCollapsed(true)}
                className="text-muted-foreground hover:text-foreground"
              >
                <PanelLeftClose />
              </Button>
            }
          />
        </div>
      </aside>

      {/* 左栏拖拽手柄：aside 左缘贴屏幕左，故新宽即指针 clientX */}
      {!sidebarCollapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="拖拽调整目录栏宽度"
          style={{ width: RESIZE_HANDLE_WIDTH }}
          className="shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-border"
          onPointerDown={(e) =>
            startResize(
              e,
              (clientX) =>
                clampWidth(
                  clientX,
                  SIDEBAR_WIDTH_RANGE.min,
                  SIDEBAR_WIDTH_RANGE.max,
                ),
              setSidebarWidth,
            )
          }
        />
      )}

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
            title={noteTitle}
            initialContent={note.content}
            onTitleChange={applyTitle}
            onEditorReady={handleEditorReady}
            editable={!editorLocked}
          />
        )}
      </main>

      {/* 右栏拖拽手柄：右栏右缘贴屏幕右，故新宽 = 视口宽 - 指针 clientX */}
      {!aiCollapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="拖拽调整 AI 对话框宽度"
          style={{ width: RESIZE_HANDLE_WIDTH }}
          className="shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-border"
          onPointerDown={(e) =>
            startResize(
              e,
              (clientX) =>
                clampWidth(
                  window.innerWidth - clientX,
                  AI_WIDTH_RANGE.min,
                  AI_WIDTH_RANGE.max,
                ),
              setAiWidth,
            )
          }
        />
      )}

      {/* 右侧：AI 会话窗口（收起态只剩一个展开按钮） */}
      <div
        style={{ width: aiCollapsed ? COLLAPSED_WIDTH : aiWidth }}
        className="relative shrink-0 border-l border-border"
      >
        {aiCollapsed && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="展开AI对话框"
            title="展开AI对话框"
            onClick={() => setAiCollapsed(false)}
            className="absolute top-2 left-2 text-muted-foreground hover:text-foreground"
          >
            <PanelRightOpen />
          </Button>
        )}
        {/* 收起态只隐藏、不卸载：写模式 run 进行中收起再展开不应丢掉正在流式的会话
            （卸载会连 abort 句柄一起丢，后端 run 仍在跑），普通场景也免去重新选会话 */}
        <div className={aiCollapsed ? "hidden" : "h-full"}>
          <AIChatWindow
            noteId={selectedNoteId}
            getEditorBridge={getEditorBridge}
            onEditorLockChange={setEditorLocked}
            // 收起按钮交给对话头部渲染，与会话选择器同处一行
            leftSlot={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="收起AI对话框"
                title="收起AI对话框"
                onClick={() => setAiCollapsed(true)}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <PanelRightClose />
              </Button>
            }
          />
        </div>
      </div>
    </div>
  );
};

export default NoteEditor;
