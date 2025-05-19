import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import "./index.css";
import { pageRoutes } from "./page/pageRoutes";
import { adminRoutes } from "./admin/adminRoutes";
import { userRoutes } from "./users/usersRoutes";
import { gameRoutes } from "./game/gameRoutes";
import { ErrorBoundary } from "./shared/components/ErrorBoundary";
import { LoadingSpinner } from "./shared/components/LoadingSpinner";
import { NotificationProvider } from "./shared/NotificationContext";
import { NotificationDisplay } from "./shared/notifications/NotificationDisplay";
import { SessionProvider } from "./shared/SessionProvider";
import { AuthProvider } from "./shared/AuthContext";
import { AppInitializer } from "./shared/AppInitializer";

// Combine all routes
const router = createBrowserRouter([
  ...pageRoutes,
  ...adminRoutes,
  ...userRoutes,
  ...gameRoutes,
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
    <NotificationProvider>
      <SessionProvider>
        <AuthProvider>
          <AppInitializer />
          <Suspense fallback={<LoadingSpinner size="large" />}>
            <RouterProvider router={router} />
          </Suspense>
          <NotificationDisplay />
        </AuthProvider>
      </SessionProvider>
    </NotificationProvider>
  </React.StrictMode>
);
