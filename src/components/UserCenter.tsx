import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { User, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logout } from "@/api/auth";

type UserCenterProps = {
  /** 目录栏是否处于收起态：true 只渲染图标按钮（弹层向右），false 渲染图标+文字（弹层向上） */
  collapsed: boolean;
};

/**
 * 目录栏底部的用户中心按钮。
 *
 * 触发方式按需求：鼠标 hover 即展开、点击也能切换（再点收起）。
 * 弹层用自托管绝对定位而非 Radix DropdownMenu —— 后者内容 portal 到 body，
 * hover 从 trigger 移到 content 时会因为中间空隙触发 mouseleave 而误关，
 * 自托管把菜单作为 wrapper 的后代，移动期间仍在子树内不会误关。
 * 展开态菜单贴着 wrapper 上沿（bottom-full）、收起态贴右沿（left-full），
 * 不额外留间距，避免“空隙导致鼠标离开 wrapper”的关闭问题。
 */
const UserCenter = ({ collapsed }: UserCenterProps) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      // 即便后端失败（如 cookie 已过期）也仍跳登录页，避免停留在需鉴权的 /note
      console.error("登出失败", err);
    } finally {
      setOpen(false);
      navigate("/login");
    }
  };

  if (collapsed) {
    return (
      <div
        className="relative mt-auto flex justify-center p-2"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="用户中心"
          title="用户中心"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="text-muted-foreground hover:text-foreground"
        >
          <User />
        </Button>
        {open && (
          <div
            role="menu"
            className="absolute left-full top-1/2 z-50 w-40 -translate-y-1/2 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
          >
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
            >
              <LogOut className="h-4 w-4" />
              退出登录
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="relative shrink-0 border-t border-border p-2"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="用户中心"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="w-full justify-start text-muted-foreground hover:text-foreground"
      >
        <User className="h-4 w-4 shrink-0" />
        <span className="ml-2">用户中心</span>
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-50 w-full rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
          >
            <LogOut className="h-4 w-4" />
            退出登录
          </button>
        </div>
      )}
    </div>
  );
};

export default UserCenter;
