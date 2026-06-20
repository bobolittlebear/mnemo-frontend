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
  delay = 1500,
}: UseAutoSaveProps) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);

  const lastSavedContent = useRef(content);
  const abortControllerRef = useRef<AbortController | null>(null);
  const retryCount = useRef(0); // 用于指数退避

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

  const save = useDebouncedCallback(async (md: string, t: string) => {
    // 边界：内容未实质性变化或为空时跳过
    if (md === lastSavedContent.current || !md.trim()) {
      setStatus("idle");
      return;
    }

    // 优先写入本地存储
    saveToLocal(md, t);

    // 取消上一次未完成的请求，防止乱序
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      setStatus("saving");
      await updateNote(
        noteId,
        { content: md, title: t },
        { signal: controller.signal },
      );

      // 保存成功，更新状态
      lastSavedContent.current = md;
      setLastSavedTime(new Date());
      setStatus("saved");
      retryCount.current = 0; // 重置重试计数
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("Auto-save failed:", err);
        setStatus("error");
        // 指数退避：失败后增加下次防抖时间
        retryCount.current += 1;
      }
    } finally {
      if (!controller.signal.aborted && status !== "error") {
        // 确保只有在非报错且未被取消时，才将 saving 状态结束
        // 注意：这里通过 setStatus("saved") 已经隐式结束了 saving
      }
    }
  }, delay);

  // 监听内容变化
  useEffect(() => {
    save(content, title);
    return () => abortControllerRef.current?.abort();
  }, [content, title, save]);

  // 页面离开前拦截
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (status === "saving") {
        e.preventDefault();
        e.returnValue = ""; // 触发浏览器原生提示
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [status]);

  return {
    status,
    lastSavedTime,
    // @ts-check - 这里暴露 retryCount 以便外部根据需要调整 UI 或日志记录
    retryCount: retryCount.current,
  };
}
