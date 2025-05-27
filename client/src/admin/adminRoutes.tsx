import { RouteObject, Navigate } from "react-router-dom";
import { AdminLayout } from "./components/AdminLayout.js";
import { UsersOverview } from "./users/UsersOverview.js";
import { StoriesOverview } from "./stories/StoriesOverview.js";
import { AdminRouteGuard } from "./components/AdminRouteGuard.js";
import { adminStoryLoader } from "./stories/adminStoryLoader.js";
import { adminUsersLoader } from "./users/usersLoader.js";
import { templatesLoader } from "../resources/templates/loaders/templatesLoader.js";
import { templateLoader } from "../resources/templates/loaders/templateLoader.js";
import { AdminErrorBoundary } from "./components/AdminErrorBoundary.js";
import { AdminTemplateList } from "./templates/AdminTemplateList.js";
import { AdminTemplateEditor } from "./templates/AdminTemplateEditor.js";
import { TemplateCarouselManager } from "../resources/templates/TemplateCarouselManager.js";

// Define routes for the admin section
export const adminRoutes: RouteObject[] = [
  {
    path: "/admin",
    element: (
      <AdminRouteGuard>
        <AdminLayout />
      </AdminRouteGuard>
    ),
    errorElement: <AdminErrorBoundary />,
    children: [
      {
        index: true,
        element: <Navigate to="/admin/templates" replace />,
      },
      {
        path: "stories",
        element: <StoriesOverview />,
        loader: adminStoryLoader,
      },
      {
        path: "users",
        element: <UsersOverview />,
        loader: adminUsersLoader,
      },
      {
        path: "templates",
        element: <AdminTemplateList />,
        loader: async () =>
          templatesLoader({
            context: "admin",
          }),
      },
      {
        path: "templates/:id",
        element: <AdminTemplateEditor />,
        loader: (args) => templateLoader(args),
      },
      {
        path: "carousel",
        element: <TemplateCarouselManager />,
      },
    ],
  },
];
