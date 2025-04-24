import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import { SessionProvider } from "./shared/SessionProvider";
import { Admin } from "./admin/Admin";
import "./index.css";

// Use browser router with specific routes to avoid capturing image URLs
const router = createBrowserRouter([
  {
    path: "/admin/*",
    element: <Admin />,
  },
  {
    // Exclude /images and /api paths from being captured by the router
    path: "*",
    element: (
      <SessionProvider>
        <App />
      </SessionProvider>
    ),
  },
]);

// Add a global error handler for network issues
window.addEventListener("error", (event) => {
  if (event.target instanceof HTMLImageElement) {
    console.error("Image loading error:", event.target.src);
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
