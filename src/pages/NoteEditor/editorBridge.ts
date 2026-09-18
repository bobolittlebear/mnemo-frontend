// src/pages/NoteEditor/editorBridge.ts
import type { Editor } from "@tiptap/react";
import type { MarkdownStorage } from "tiptap-markdown";
import type {
  CursorContextSnapshot,
  SelectionSnapshot,
} from "@/utils/chatStream";

/** 光标锚点取文窗口：光标前后各取 200 字符（设计 §5.1） */
const CURSOR_CONTEXT_CHARS = 200;

/**
 * 编辑器桥：把「当前编辑器实例」的能力以稳定接口交给 AI 对话框。
 *
 * 为什么用 bridge 而非直接把 editor 实例传给对话框：编辑器按 key={noteId} 重挂载，
 * 实例随时可能被替换（旧实例已销毁），对话框只该拿到一个能读到"当前实例"的取值入口，
 * 而不是一份会过期的引用快照。
 */
export interface EditorBridge {
  /** 消息发送瞬间的选区 / 光标快照；无编辑器、无选区时对应字段为 null */
  getSelectionContext(): {
    selection: SelectionSnapshot;
    cursorContext: CursorContextSnapshot;
  };
  /** 消息发送瞬间的文档哈希（标题 + 正文），整 run 锁的失效守卫基线 */
  computeDocHash(): string;
  /** 当前编辑器实例；无笔记 / 尚未就绪时为 null（工具执行前的前置检查） */
  getEditor(): Editor | null;
  /**
   * 整标题替换（update_title 专用）。
   *
   * 约定：本方法返回后，紧接着的 computeDocHash() 必须已经反映新标题——工具回执
   * 要带上「应用后的」docHash 作下一轮守卫基线，若标题读数滞后到下一次渲染，
   * 多轮 run 的第二轮必然自比不等而误报 doc drifted。
   */
  setTitle(title: string): void;
}

/**
 * FNV-1a 32 位哈希 → 8 位 hex。
 * 选它是因为同步、无依赖、对同一输入跨会话稳定（不能用对象引用等运行期标识，
 * 锁守卫比较的是"内容是否变过"）；非加密用途，不做密钥/防碰撞考量。
 */
function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // Math.imul 保证 32 位乘法不溢出成浮点
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * 读写入参都是取值函数而非快照值：编辑器实例会随换笔记重挂载而更换、标题也会变，
 * 传快照就会指向已销毁的实例或过期标题。取值一律推迟到方法被调用那一刻
 * （发送 / 工具回执续轮），调用方因此不需要维护任何镜像状态。
 *
 * @param getEditor  取当前编辑器实例（无笔记 / 未就绪时为 null）
 * @param getTitle   取当前标题（React 状态里的实时值）
 * @param applyTitle 把标题写回 React 状态（列表联动 + 触发自动保存）
 */
export function createEditorBridge(
  getEditor: () => Editor | null,
  getTitle: () => string,
  applyTitle: (title: string) => void,
): EditorBridge {
  /**
   * 本 bridge 生命周期内的标题覆写：非 null 即优先于 getTitle() 的实时读数。
   *
   * 为什么需要它：update_title 之后 applyTitle 只是排队了一次 setState，要等下一次
   * 渲染才看得见新标题；而工具回执紧接着就要算「应用后的」docHash。若这里读的是
   * React 状态，回执带的就是旧哈希，下一轮守卫必判不等。
   *
   * 作用域恰好是一次 run——bridge 在发送那一刻新建、整 run 复用；run 结束后下一次
   * 发送的 bridge 是新的，自然回到实时读数，不会长期盖住真实标题。
   */
  let titleOverride: string | null = null;
  const readTitle = (): string => titleOverride ?? getTitle();

  const readMarkdown = (): string => {
    const editor = getEditor();
    if (!editor) return "";
    // tiptap-markdown 在运行时把 getMarkdown 挂到 editor.storage.markdown，
    // 但未扩充 tiptap 的 Storage 类型，这里按 MarkdownStorage 窄化取值
    const storage = editor.storage as unknown as {
      markdown?: MarkdownStorage;
    };
    return storage.markdown?.getMarkdown() ?? "";
  };

  return {
    getEditor,

    setTitle: (title: string) => {
      // 先落覆写再回写状态：applyTitle 会排队渲染，但本方法返回时读数已生效
      titleOverride = title;
      applyTitle(title);
    },

    // \u0000 分隔标题与正文：正文里不可能出现 NUL，避免「标题尾部+正文头部」
    // 与「标题+正文」拼出同一串而哈希等值
    computeDocHash: () => fnv1aHex(`${readTitle()}\u0000${readMarkdown()}`),

    getSelectionContext: () => {
      const editor = getEditor();
      if (!editor) return { selection: null, cursorContext: null };

      const { doc, selection } = editor.state;
      const { from, to } = selection;
      // 位置合法区间为 [0, doc.content.size]，越界会被 ProseMirror 拒绝
      const size = doc.content.size;
      const beforeStart = Math.max(0, from - CURSOR_CONTEXT_CHARS);
      const afterEnd = Math.min(size, to + CURSOR_CONTEXT_CHARS);

      return {
        // 空选区（纯光标）不产生选区快照：§5.1 中 selection 为 null 时模型应改走
        // insert_at_cursor 或澄清，而不是拿一个空串当作可替换选区
        selection: from === to ? null : { text: doc.textBetween(from, to, "\n") },
        cursorContext: {
          beforeText: doc.textBetween(beforeStart, from, "\n"),
          afterText: doc.textBetween(to, afterEnd, "\n"),
        },
      };
    },
  };
}
