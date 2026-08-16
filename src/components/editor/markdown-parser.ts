// utils/md.ts
import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";

// 'default' preset 包含 table、strikethrough 等 GFM 扩展
const md = new MarkdownIt("default", {
  html: true, // 允许 HTML 标签透传
  breaks: true, // \n → <br>
  linkify: true,
});

md.use(taskLists, { enabled: true, label: true });

// 双重保险
md.enable(["table", "strikethrough"]);

export function mdToHtml(markdown: string): string {
  return md.render(markdown);
}
