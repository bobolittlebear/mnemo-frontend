// src/pages/NoteEditor/editorExecutor.ts
import type { Editor } from "@tiptap/react";
import { AI_PATCH_HIGHLIGHT_NAME } from "@/components/editor/extensions/ai-patch-highlight";
import type { EditorBridge } from "./editorBridge";
import type { SSEEventMap } from "@/types/sse";

/** 待执行工具调用：tool_call 事件里与执行相关的三个字段（runId 由调用方另行持有） */
export type PendingToolCall = Pick<
  SSEEventMap["tool_call"],
  "toolCallId" | "tool" | "args"
>;

/**
 * 工具执行回执：字段名与后端 buildToolResult 的读取面一一对应
 * （status 必带，docHash / titleAfter / error 有值才带）。
 *
 * 不含 cancelled：取消是 run 级决策（由对话框在整 run 中止时另行回传），
 * 执行器只回答「这一次写入成没成」。
 */
export type ToolResultPayload = {
  status: "applied" | "failed";
  /** 应用后的文档哈希：调用方据此推进下一轮的守卫基线 */
  docHash?: string;
  /** update_title 应用后的标题，供模型验证 */
  titleAfter?: string;
  /** 失败原因（下发给模型，供其修正参数重试） */
  error?: string;
};

/** 锁失效守卫的约定失败串（设计 §7.2）：出现即说明锁实现有 bug 或竞态漏网 */
const DRIFT_ERROR = "doc drifted";

/** 工具参数缺失 / 非法的失败串前缀，便于回执里一眼看出是哪一步坏的 */
const argError = (tool: string, detail: string) => `${tool}: ${detail}`;

/**
 * 归一化 tool_call.args。
 *
 * 后端可能给对象，也可能给 JSON 字符串（Function Calling 的 arguments 本身就是
 * 字符串，落库/透传时未再解包）。两种都得认；解不出来就返回 null，由调用方按
 * 参数非法处理，绝不把 undefined 当默认值蒙混过去。
 */
function normalizeArgs(
  args: SSEEventMap["tool_call"]["args"],
): Record<string, unknown> | null {
  if (typeof args === "string") {
    try {
      const parsed: unknown = JSON.parse(args);
      return typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return args ?? null;
}

/** 取字符串参数：非字符串一律视为缺失（数字/布尔不做隐式转换，避免写坏内容） */
function readString(
  args: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = args?.[key];
  return typeof value === "string" ? value : null;
}

/**
 * 写入 markdown，并在同一事务内给写入范围打上高亮 mark（设计 §7.1 单 step + §7.3）。
 *
 * 单 history step 的关键：insertContentAt 与 addMark 挂在同一个 editor.chain() 上。
 * tiptap 的链只在 run() 末尾统一 dispatch 一次（链内命令共用一个 transaction），
 * 因此写入与打 Mark 同属一个 step，一次 Ctrl+Z 能把「内容 + 高亮」整体撤销。
 * 绝不能拆成「先 insertContentAt 再单独 setMark」——那是两次 dispatch、两个 step。
 *
 * 高亮范围取自「本次写入实际插入的区间」，即两侧步映射的 newStart/newEnd：
 * 不能用光标位置去 map——块级写入（标题/列表/多段落）时 tiptap 会先把当前块 split
 * 再把新块插到后面，单个光标位置在正反两个方向上会塌缩到同一点（to === from），
 * 于是高亮被整段跳过，表现为「内容写了但一点没高亮」，而纯行内写入恰好正常。
 * newEnd > newStart 即该步真实插入了内容（删除步不满足，故天然被排除）；
 * 对全部步取并集，行内与块级都能覆盖，且起点不会前移到写入前的已有正文上。
 *
 * @param position insert_at_cursor 传光标位（number）；replace_selection 传 {from,to}
 * @returns 写入是否成功（即 chain().run() 的返回值，语义与原先的 commands 调用一致）
 */
function applyPatchWithHighlight(
  editor: Editor,
  position: number | { from: number; to: number },
  markdown: string,
): boolean {
  return editor
    .chain()
    .insertContentAt(position, markdown, { updateSelection: false })
    .command(({ tr, state }) => {
      const markType = state.schema.marks[AI_PATCH_HIGHLIGHT_NAME];
      // 扩展未注册（如测试用编辑器）时退化为纯写入，不阻断工具执行
      if (!markType) return true;

      let from = Infinity;
      let to = -Infinity;
      tr.mapping.maps.forEach((stepMap) => {
        stepMap.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
          if (newEnd > newStart) {
            from = Math.min(from, newStart);
            to = Math.max(to, newEnd);
          }
        });
      });

      // 空写入（如用空 markdown 替换选区）时没有任何插入区间，addMark 无意义
      if (to > from) tr.addMark(from, to, markType.create());
      return true;
    })
    .run();
}

/**
 * 执行一次工具调用 → 组装回执载荷。
 *
 * 同步执行：tiptap 的 insertContentAt 走 editor.commands，单次 dispatch 即单事务，
 * 因此「写入」与「单 history step」一起成立（设计 §7.1），一次 Ctrl+Z 可整体撤销。
 * 末尾不调 editor.commands.focus()——执行响应来自 SSE 回调而非用户手势，
 * 抢焦点会把用户正在别处操作的输入打断，也不影响写入本身。
 *
 * @param bridge        编辑器桥（取值推迟到此刻，见 editorBridge 注释）
 * @param toolCall      本轮待执行工具
 * @param guardBaseline 上一轮应用后的 docHash（首轮为发送瞬间的 docHashAtSend）；
 *                      为 null 表示没有基线可比，跳过守卫
 */
export function executeToolCall(
  bridge: EditorBridge,
  toolCall: Pick<SSEEventMap["tool_call"], "tool" | "args">,
  guardBaseline: string | null,
): ToolResultPayload {
  const editor = bridge.getEditor();
  if (!editor) {
    return { status: "failed", error: argError(toolCall.tool, "编辑器未就绪") };
  }

  // 锁失效守卫（设计 §7.2）：整 run 锁下 docHash 应恒定，不等即拒绝应用。
  // 必须在任何写入之前——先写再比就把「拒绝应用」变成了「应用完再报错」
  if (guardBaseline !== null && bridge.computeDocHash() !== guardBaseline) {
    return { status: "failed", error: DRIFT_ERROR };
  }

  const args = normalizeArgs(toolCall.args);

  switch (toolCall.tool) {
    case "update_title": {
      const newTitle = readString(args, "new_title");
      if (newTitle === null) {
        return {
          status: "failed",
          error: argError("update_title", "缺少 new_title"),
        };
      }
      // setTitle 同步生效（见 EditorBridge.setTitle）：紧接着的 computeDocHash
      // 必须反映新标题，否则下一轮守卫基线是旧值
      bridge.setTitle(newTitle);
      return {
        status: "applied",
        titleAfter: newTitle,
        docHash: bridge.computeDocHash(),
      };
    }

    case "insert_at_cursor": {
      const markdown = readString(args, "markdown");
      if (markdown === null) {
        return {
          status: "failed",
          error: argError("insert_at_cursor", "缺少 markdown"),
        };
      }
      // 位置取当前光标：整 run 锁期间 editable=false，ProseMirror 不接受鼠标/键盘
      // 改选区，故当前选区恒等于发送瞬间的快照位置（§5.1）
      const pos = editor.state.selection.from;
      // 内容传 markdown 而非 HTML：tiptap-markdown 覆盖了 insertContentAt 命令，
      // 内部先 parser.parse(content, {inline:true}) 再交给核心命令，同一事务内完成；
      // updateSelection: false —— 不把选区挪到插入内容尾部，run 中途不动用户视线。
      // 该命令链是同一事务（含高亮 mark），详见 applyPatchWithHighlight 注释
      const applied = applyPatchWithHighlight(editor, pos, markdown);
      if (!applied) {
        return {
          status: "failed",
          error: argError("insert_at_cursor", "编辑器拒绝了本次写入"),
        };
      }
      return { status: "applied", docHash: bridge.computeDocHash() };
    }

    case "replace_selection": {
      const markdown = readString(args, "markdown");
      if (markdown === null) {
        return {
          status: "failed",
          error: argError("replace_selection", "缺少 markdown"),
        };
      }
      const { from, to, empty } = editor.state.selection;
      // 无选区时模型本不该调这个工具（§5.1 提示词约束）：宁可失败让模型改道，
      // 也不按「插入」兜底——那会把「替换」静默降级成用户没要求的内容
      if (empty) {
        return {
          status: "failed",
          error: argError("replace_selection", "当前无选区可替换"),
        };
      }
      const applied = applyPatchWithHighlight(editor, { from, to }, markdown);
      if (!applied) {
        return {
          status: "failed",
          error: argError("replace_selection", "编辑器拒绝了本次写入"),
        };
      }
      return { status: "applied", docHash: bridge.computeDocHash() };
    }

    default:
      // 后端加了新工具而前端未适配：明确失败让模型别重试同一个，不要静默 applied
      return {
        status: "failed",
        error: argError(String(toolCall.tool), "前端不支持该工具"),
      };
  }
}
