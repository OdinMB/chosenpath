import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import "./index.css";
import { pageRoutes } from "./page/pageRoutes";
import { adminRoutes } from "./admin/adminRoutes";
import { userRoutes } from "./users/usersRoutes";
import { ErrorBoundary } from "./shared/components/ErrorBoundary";

// Combine all routes
const router = createBrowserRouter([
  ...pageRoutes,
  ...adminRoutes,
  ...userRoutes,
  // Fallback route for 404s
  {
    path: "*",
    element: <ErrorBoundary type="not-found" />,
    errorElement: <ErrorBoundary />,
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
