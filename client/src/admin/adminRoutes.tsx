import { RouteObject } from "react-router-dom";
import { AdminLayout } from "./components/AdminLayout.js";
import { AdminLogin } from "./components/AdminLogin.js";
import { UsersOverview } from "./users/UsersOverview";
import { TemplateLibrary } from "./template/TemplateLibrary.js";
import { TemplateCarouselManager } from "./template/TemplateCarouselManager.js";
import { StoriesOverview } from "./stories/StoriesOverview.js";
import { TemplateForm } from "./template/components";

// Define routes for the page section
export const adminRoutes: RouteObject[] = [
  {
    path: "/admin",
    element: isAuthenticated ? <AdminLayout /> : <AdminLogin />,
    children: [
      {
        path: "users",
        element: <UsersOverview />,
      },
      {
        path: "templates",
        element: <TemplateLibrary />,
      },
      {
        path: "carousel",
        element: <TemplateCarouselManager />,
      },
      {
        path: "stories",
        element: <StoriesOverview />,
      },
      {
        path: "templates/new",
        element: <TemplateForm />,
      },
    ],
  },
];
