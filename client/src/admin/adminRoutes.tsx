import { RouteObject } from "react-router-dom";
import { AdminLayout } from "./components/AdminLayout.js";
import { UsersOverview } from "./users/UsersOverview";
import { TemplateLibrary } from "./template/TemplateLibrary.js";
import { TemplateCarouselManager } from "./template/TemplateCarouselManager.js";
import { StoriesOverview } from "./stories/StoriesOverview.js";
import { TemplateForm } from "./template/components";
import { AdminRouteGuard } from "./components/AdminRouteGuard";
import { adminStoryLoader } from "./stories/adminStoryLoader";
import { adminUsersLoader } from "./users/usersLoader";
import { adminTemplatesLoader } from "./template/adminTemplatesLoader.js";
import { adminTemplateLoader } from "./template/adminTemplateLoader.js";
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
        element: <TemplateLibrary />,
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
