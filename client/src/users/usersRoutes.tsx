import { RouteObject } from "react-router-dom";
import { Users } from "./Users.js";

export const userRoutes: RouteObject[] = [
  {
    path: "/my-stories",
    element: <Users />,
    id: "user-stories",
  },
];
