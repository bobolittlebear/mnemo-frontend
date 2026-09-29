import { createBrowserRouter, Navigate } from "react-router-dom";
import Login from "@/pages/Login";
import NoteEditor from "@/pages/NoteEditor";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to="/note" replace />, // 根路径自动重定向到笔记编辑页
  },
  {
    path: "/login",
    element: <Login />,
  },
  {
    path: "/note",
    element: <NoteEditor />,
  },
  {
    path: "/note/:id",
    element: <NoteEditor />,
  },
  {
    path: "*",
    element: (
      <div style={{ textAlign: "center", marginTop: "100px" }}>
        404 - 页面未找到
      </div>
    ),
  },
]);

export default router;
