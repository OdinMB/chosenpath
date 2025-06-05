import { RouteObject, Navigate } from "react-router-dom";
import { UsersStories } from "./stories/UsersStories.js";
import { UsersArchive } from "./stories/UsersArchive.js";
import { UserTemplateList } from "./templates/UserTemplateList.js";
import { UserTemplateEditor } from "./templates/UserTemplateEditor.js";
import { UserAccountPage } from "./components/UserAccountPage";
import { UsersLayout } from "./components/UsersLayout";
import { UserRouteGuard } from "./components/UserRouteGuard";
import { UsersErrorBoundary } from "./components/UsersErrorBoundary";
import { userTemplatesLoader } from "./templates/userTemplatesLoader.js";
import { templateLoader } from "../resources/templates/loaders/templateLoader.js";

export const userRoutes: RouteObject[] = [
  {
    path: "/users", // Base path for all user-related routes
    element: (
      <UserRouteGuard>
        <UsersLayout />
      </UserRouteGuard>
    ),
    errorElement: <UsersErrorBoundary />,
    children: [
      {
        index: true, // Default route for /users
        element: <Navigate to="/users/my-stories" replace />,
      },
      {
        path: "my-stories",
        element: <UsersStories />,
        id: "user-stories",
      },
      {
        path: "archive",
        element: <UsersArchive />,
        id: "user-archive",
      },
      {
        path: "my-worlds",
        element: <UserTemplateList />,
        loader: userTemplatesLoader,
        id: "user-templates",
      },
      {
        path: "my-worlds/:id",
        element: <UserTemplateEditor />,
        loader: ({ params }) => {
          if (!params.id) {
            throw new Response("Template ID is required", { status: 400 });
          }
          return templateLoader(params.id);
        },
        id: "user-template-editor",
      },
    ],
  },
  {
    // Sign-in route remains outside the guarded layout
    path: "/users/signin",
    element: <UserAccountPage />,
    id: "user-signin",
  },
];
