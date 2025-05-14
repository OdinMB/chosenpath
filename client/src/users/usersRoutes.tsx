import { RouteObject, Navigate } from "react-router-dom";
import { Users } from "./Users.js";
import { UserAccountPage } from "./components/UserAccountPage";
import { UsersLayout } from "./components/UsersLayout";
import { UserRouteGuard } from "./components/UserRouteGuard";
import { UsersErrorBoundary } from "./components/UsersErrorBoundary";
import { userStoriesLoader } from "./usersLoader";

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
        index: true, // Default route for /users, maybe redirect to my-stories or a dashboard
        element: <Navigate to="/users/my-stories" replace />,
      },
      {
        path: "my-stories",
        element: <Users />,
        loader: userStoriesLoader, // Add the loader here
        id: "user-stories",
      },
      // You can add other user-specific child routes here, e.g., account settings
      // {
      //   path: "settings",
      //   element: <UserSettingsPage />,
      // },
    ],
  },
  {
    // Sign-in route remains outside the guarded layout
    path: "/users/signin",
    element: <UserAccountPage />,
    id: "user-signin",
  },
];
