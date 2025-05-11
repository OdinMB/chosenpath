import { RouteObject } from "react-router-dom";
import { Users } from "./Users.js";
import { UserAccountPage } from "./components/UserAccountPage";

export const userRoutes: RouteObject[] = [
  {
    path: "/users/signin",
    element: <UserAccountPage />,
    id: "user-signin",
  },
  {
    path: "/my-stories",
    element: <Users />,
    id: "user-stories",
  },
];
