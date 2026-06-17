import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import router from "./router";
import "./index.css"; // 🌟 核心：在这里引入全局样式

createRoot(document.getElementById("root")!).render(
  <RouterProvider router={router} />,
);
