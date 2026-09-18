/**
 * 布局偏好的 localStorage 读写封装。
 *
 * 统一在此 try/catch：隐私模式、禁用站点存储、SSR 等场景下访问 localStorage
 * 会直接抛异常。布局偏好属于「有则更好」的增强项，读写失败一律退化为默认值 /
 * 静默丢弃，绝不把页面拖垮；调用方因此无需再包一层 try。
 */

/** 读数值；缺省或非法（NaN / 非数字）时返回 fallback */
export const getNumber = (key: string, fallback: number): number => {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  } catch (error) {
    console.error(`读取布局偏好失败: ${key}`, error);
    return fallback;
  }
};

/** 写数值；写入失败只记日志（如存储配额耗尽） */
export const setNumber = (key: string, value: number): void => {
  try {
    localStorage.setItem(key, String(value));
  } catch (error) {
    console.error(`写入布局偏好失败: ${key}`, error);
  }
};

/** 读布尔；仅 "true" 视作真，其余（含缺失、被写坏的值）返回 fallback */
export const getBool = (key: string, fallback: boolean): boolean => {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === "true";
  } catch (error) {
    console.error(`读取布局偏好失败: ${key}`, error);
    return fallback;
  }
};

/** 写布尔 */
export const setBool = (key: string, value: boolean): void => {
  try {
    localStorage.setItem(key, String(value));
  } catch (error) {
    console.error(`写入布局偏好失败: ${key}`, error);
  }
};
