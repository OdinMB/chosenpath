import { RouteObject } from "react-router-dom";
import { Admin } from "./Admin.js";

export const adminRoutes: RouteObject[] = [
  {
    path: "/admin/*",
    element: <Admin />,
    id: "admin",
  },
];
