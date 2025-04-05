import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import { SessionProvider } from "./providers/SessionProvider";
import { Admin } from "./admin/Admin";
import "./index.css";

const router = createBrowserRouter([
  {
    path: "/admin/*",
    element: <Admin />,
  },
  {
    path: "/*",
    element: (
      <SessionProvider>
        <App />
      </SessionProvider>
    ),
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
