// src/hooks/useAutoSave.ts
import { useEffect, useRef, useState, useCallback } from "react";
import { useDebouncedCallback } from "use-debounce";
import { updateNote } from "@/api/note";

interface UseAutoSaveProps {
  noteId: string;
  content: string;
  title: string;
  delay?: number;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function useAutoSave({
  noteId,
  content,
  title,
  delay = 5000,
}: UseAutoSaveProps) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);

  const lastSavedContent = useRef(content);
  const lastSavedTitle = useRef(title);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [retryCount, setRetryCount] = useState(0); // 用于指数退避

  // 镜像最新 content/title，供 beforeunload / flush 等闭包外场景读取
  const latest = useRef({ content, title });
  useEffect(() => {
    latest.current = { content, title };
  }, [content, title]);

  // 组件是否已挂载：unmount 后跳过 setState，避免对已卸载组件更新告警
  const mountedRef = useRef(true);

  // 本地存储兜底
  const saveToLocal = useCallback(
    (md: string, t: string) => {
      try {
        localStorage.setItem(
          `note_draft_${noteId}`,
          JSON.stringify({ content: md, title: t, timestamp: Date.now() }),
        );
      } catch (e) {
        console.error("Local storage save failed:", e);
      }
    },
    [noteId],
  );

  const setStatusSafe = useCallback((s: SaveStatus) => {
    if (mountedRef.current) setStatus(s);
  }, []);

  // 立即保存（无防抖）：防抖定时器与各类兜底场景共用，避免重复逻辑
  const saveNow = useCallback(
    async (md: string, t: string) => {
      // 内容与标题都未变化时才跳过；允许「仅改标题（即使内容为空）」也触发保存
      if (md === lastSavedContent.current && t === lastSavedTitle.current) {
        setStatusSafe("idle");
        return;
      }

      // 本地同步兜底：即使随后异步请求因页面卸载来不及完成，本地草稿也已落地
      saveToLocal(md, t);

      // 取消上一次未完成的请求，防止乱序
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        setStatusSafe("saving");
        await updateNote(
          noteId,
          { content: md, title: t },
          { signal: controller.signal },
        );

        // 保存成功，更新状态
        lastSavedContent.current = md;
        lastSavedTitle.current = t;
        if (mountedRef.current) setLastSavedTime(new Date());
        setStatusSafe("saved");
        setRetryCount(0); // 重置重试计数
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Auto-save failed:", err);
          setStatusSafe("error");
          // 指数退避：失败后增加下次防抖时间
          if (mountedRef.current) setRetryCount((c) => c + 1);
        }
      }
    },
    [noteId, saveToLocal, setStatusSafe],
  );

  // 防抖包装：内容变化后延迟 delay 再保存
  const save = useDebouncedCallback(
    (md: string, t: string) => {
      void saveNow(md, t);
    },
    delay,
  );

  // 兜底保存：不等待防抖定时器，立即把最新内容落地
  const flush = useCallback(() => {
    const { content: c, title: t } = latest.current;
    void saveNow(c, t);
  }, [saveNow]);

  // 监听内容变化（触发防抖保存）
  useEffect(() => {
    save(content, title);
  }, [content, title, save]);

  // 生命周期兜底：切换笔记（组件卸载）/ 页面切走或卸载时，把尚未触发的保存立即 flush
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const onPageHide = () => flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      // 先标记已卸载，使 flush 触发的 saveNow 跳过对已卸载组件的 setState
      mountedRef.current = false;
      // 切换笔记时组件卸载 → 把 5 秒内未完成的防抖保存立即发出，避免内容丢失
      flush();
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [flush]);

  // 页面离开前拦截：只要有未保存改动就提示（不再局限于 saving 中）
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const { content: c, title: t } = latest.current;
      if (c !== lastSavedContent.current || t !== lastSavedTitle.current) {
        e.preventDefault();
        e.returnValue = ""; // 触发浏览器原生提示
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () =>
      window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  return {
    status,
    lastSavedTime,
    // 暴露 retryCount 以便外部根据需要调整 UI 或日志记录
    retryCount,
    // 暴露 flush 供外部在关键时机主动兜底保存（如路由切换前）
    flush,
  };
}
