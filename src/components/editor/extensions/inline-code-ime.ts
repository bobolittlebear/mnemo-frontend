// Extension 取自 @tiptap/react（它 `export * from "@tiptap/core"`）：
// 本项目未把 @tiptap/core 列为直接依赖，pnpm 严格解析下顶层不可见，
// 而 @tiptap/react 已是既有依赖，与 EditorToolbar 的引入方式一致。
import { Extension } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/**
 * 中文输入法（IME）下也能把 `文本`（成对反引号）自动转成 inline code。
 *
 * 背景：StarterKit 的 code mark 自带 inputRule（/`([^`]+)$/），但它依赖
 * ProseMirror 的 handleTextInput 逐字符触发；IME 组字期间不走该路径，
 * 中文输入法下敲出的反引号被当作裸文本留在文档里，最终被 tiptap-markdown
 * 序列化转义成 \`文本\`。
 *
 * 所以这里不依赖输入事件，改用 appendTransaction：每次文档变更后检查光标
 * 所在文本块内「未被 code mark 包裹的成对反引号」，就地删掉反引号并给中间
 * 文本加 code mark。转换后反引号已消失，下一次不再匹配，不会递归。
 *
 * 已知取舍（强假设）：把「成对反引号 = 行内代码」当作无条件规则，正文中写
 * 字面反引号文本会被自动转成 code 节点；手动 toggleCode 取消后，下一次文档
 * 变更又会被转回。确需字面反引号时应临时移除本扩展。
 */
export const InlineCodeIme = Extension.create({
  name: "inlineCodeIme",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("inlineCodeIme"),
        appendTransaction: (transactions, _oldState, newState) => {
          // 文档没变（选中等）就无需处理。
          if (!transactions.some((tr) => tr.docChanged)) {
            return null;
          }

          // 快速跳过：绝大多数输入不含反引号，先过滤掉，避免无谓的块级扫描。
          if (!newState.doc.textContent.includes("`")) {
            return null;
          }

          const { $from } = newState.selection;
          const block = $from.parent;
          if (!block.isTextblock) {
            return null;
          }

          const text = block.textContent;
          if (!text.includes("`")) {
            return null;
          }

          // mark 取自 schema，不硬编码。
          const codeType = newState.schema.marks.code;
          // 块类型不允许 code mark 时退出：典型是代码块（marks: ""）里写反引号
          // 应当保持字面文本；且此时 addMark 是 no-op，只删反引号会丢内容。
          if (!codeType || !block.type.allowsMarkType(codeType)) {
            return null;
          }

          // 位置换算前提：块内必须全是文本节点。textContent 会跳过 hardBreak /
          // image 等非文本子节点，字符偏移与文档 position 不再一一对应，
          // 按偏移删改会写坏内容，故直接跳过。
          for (let i = 0; i < block.childCount; i++) {
            if (!block.child(i).isText) {
              return null;
            }
          }

          // 块内容起点：textContent 下标 i 对应的文档位置是 blockStart + i。
          const blockStart = $from.start();

          // 收集所有「开反引号 … 闭反引号」区间（中间不含反引号）。
          const ranges: Array<{ open: number; close: number }> = [];
          const pattern = /`([^`]+)`/g;
          let match: RegExpExecArray | null;
          while ((match = pattern.exec(text)) !== null) {
            ranges.push({
              open: match.index,
              close: match.index + match[0].length - 1,
            });
          }
          if (ranges.length === 0) {
            return null;
          }

          // 从后往前处理：后面区间的删改不会影响前面区间的 position。
          const tr = newState.tr;
          for (let i = ranges.length - 1; i >= 0; i--) {
            const { open, close } = ranges[i];
            const openPos = blockStart + open;
            const closePos = blockStart + close;

            // 顺序：先删闭合反引号（不影响其之前的 position），再给中间文本加
            // mark（区间仍有效），最后删开启反引号——mark 随内容一起左移。
            tr.delete(closePos, closePos + 1);
            tr.addMark(openPos + 1, closePos, codeType.create());
            tr.delete(openPos, openPos + 1);
          }

          return tr;
        },
      }),
    ];
  },
});
