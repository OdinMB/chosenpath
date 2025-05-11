import { RouteObject } from "react-router-dom";
import { Admin } from "./Admin.js";
import { UsersOverview } from "./users/UsersOverview";
import { TemplateLibrary } from "./template/TemplateLibrary.js";
import { TemplateCarouselManager } from "./template/TemplateCarouselManager.js";
import { StoriesOverview } from "./StoriesOverview";
import { TemplateForm } from "./template/components";

export const adminRoutes: RouteObject[] = [
  {
    path: "/admin",
    element: <Admin />,
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
