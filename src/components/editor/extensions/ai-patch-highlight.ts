// Mark / Extension 取自 @tiptap/react（它 `export * from "@tiptap/core"`）：
// 本项目未把 @tiptap/core 列为直接依赖，pnpm 严格解析下顶层不可见，
// 与 InlineCodeIme 的引入方式保持一致。
import { Mark } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";
import type { MarkType } from "@tiptap/pm/model";

/**
 * AI 工具写入高亮（设计 §7.3）：标记「AI 刚写进来的范围」，供用户一眼看到改动落点，
 * 随后自动消散。纯展示 mark——不参与 markdown 序列化、不改变文档语义（见 addStorage）。
 */
export const AI_PATCH_HIGHLIGHT_NAME = "aiPatchHighlight";

/** 高亮存活时长，与 editor.css 里 ai-patch-fade 动画时长一致（15s） */
const HIGHLIGHT_TTL_MS = 15_000;

const dismissKey = new PluginKey("aiPatchHighlightDismiss");

/** 文档中是否还存在高亮 mark：rangeHasMark 命中即提前结束遍历，不必扫完整篇 */
function hasPatchMark(state: EditorState): boolean {
  // 索引签名的静态类型是 MarkType，但扩展未注册时运行期确实可能取不到
  const markType: MarkType | undefined =
    state.schema.marks[AI_PATCH_HIGHLIGHT_NAME];
  if (!markType) return false;
  return state.doc.rangeHasMark(0, state.doc.content.size, markType);
}

export const AiPatchHighlight = Mark.create({
  name: AI_PATCH_HIGHLIGHT_NAME,

  // 不声明 excludes：默认不排除任何 mark，故可与 bold / italic / code 等共存，
  // 不会把 AI 写入段落里原有的行内样式顶掉。
  //
  // 也不声明 parseHTML：本 mark 是纯展示态，不应从任何输入（粘贴 HTML、被解析的
  // markdown）回流进文档——粘贴进来的高亮会变成一段无法解释、只能等定时器收走的
  // 残留样式。渲染只走 renderHTML，DOM 上带 class 供 CSS 命中。
  renderHTML({ HTMLAttributes }) {
    return ["span", { ...HTMLAttributes, class: "ai-patch-highlight" }, 0];
  },

  addStorage() {
    return {
      /**
       * 序列化为空串。
       *
       * 必须显式声明：tiptap-markdown 会为 schema 里每个 mark 提供 HTMLMark 兜底
       * （open/close 由 renderHTML 反推），而本项目 Markdown 配了 html: true，
       * 于是本 mark 会在 getMarkdown() 里吐成 <span class="ai-patch-highlight">…</span>。
       * docHash 是「标题 + markdown」的哈希（见 editorBridge），一旦展示态进了
       * markdown，高亮消散（mousedown / 15s）就会让哈希变化，下一轮守卫必然误判
       * doc drifted 而拒绝写入（设计 §7.2）——整个多轮 run 会就此崩掉。
       * 声明空串后，带高亮与不带高亮的同一段文本 markdown 完全一致，哈希稳定。
       */
      markdown: {
        serialize: {
          open: () => "",
          close: () => "",
        },
      },
    };
  },

  /**
   * 消散插件：起于「文档里出现高亮」，止于「一次 mousedown」或「15 秒超时」。
   * 定时器与消散逻辑全在插件闭包内（DOM / PM 层），不引入任何组件级副作用。
   */
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: dismissKey,
        view: (editorView) => {
          let timer: ReturnType<typeof setTimeout> | null = null;

          const clearTimer = () => {
            if (timer !== null) {
              clearTimeout(timer);
              timer = null;
            }
          };

          /** 一次性摘掉全文档的高亮 mark；已无高亮时只清定时器 */
          const dismiss = () => {
            clearTimer();
            const { state } = editorView;
            const markType = state.schema.marks[AI_PATCH_HIGHLIGHT_NAME];
            if (!markType) return;
            const size = state.doc.content.size;
            if (!state.doc.rangeHasMark(0, size, markType)) return;
            editorView.dispatch(state.tr.removeMark(0, size, markType));
          };

          return {
            update: (view, prevState) => {
              // doc 引用不变即这次更新与文档内容无关（选中等）：mark 不可能变化，跳过
              if (view.state.doc === prevState.doc) return;
              if (hasPatchMark(view.state)) {
                // 已起过定时器就不重置：15s 从高亮出现时算起，而非从最后一次编辑算起
                if (timer === null)
                  timer = setTimeout(dismiss, HIGHLIGHT_TTL_MS);
              } else {
                clearTimer();
              }
            },

            handleDOMEvents: {
              // 任意 mousedown 即消散；返回 false 让事件照常冒泡给选区逻辑
              mousedown: () => {
                dismiss();
                return false;
              },
            },

            destroy: () => {
              clearTimer();
            },
          };
        },
      }),
    ];
  },
});
