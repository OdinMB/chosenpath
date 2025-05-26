import { RouteObject, Navigate } from "react-router-dom";
import { AdminLayout } from "./components/AdminLayout.js";
import { UsersOverview } from "./users/UsersOverview";
import { TemplateOverview } from "../resources/templates/TemplateOverview.js";
import { TemplateCarouselManager } from "../resources/templates/TemplateCarouselManager.js";
import { StoriesOverview } from "./stories/StoriesOverview.js";
import { TemplateForm } from "../resources/templates/components/index.js";
import { AdminRouteGuard } from "./components/AdminRouteGuard";
import { adminStoryLoader } from "./stories/adminStoryLoader";
import { adminUsersLoader } from "./users/usersLoader";
import { adminTemplatesLoader } from "../resources/templates/adminTemplatesLoader.js";
import { adminTemplateLoader } from "../resources/templates/adminTemplateLoader.js";
import { AdminErrorBoundary } from "./components/AdminErrorBoundary";

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
        element: <TemplateOverview />,
        loader: adminTemplatesLoader,
      },
      {
        path: "templates/:id",
        element: <TemplateForm />,
        loader: adminTemplateLoader,
      },
      {
        path: "carousel",
        element: <TemplateCarouselManager />,
      },
    ],
  },
];
