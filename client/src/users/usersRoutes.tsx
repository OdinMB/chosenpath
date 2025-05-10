import { RouteObject } from "react-router-dom";
import { Users } from "./Users.js";
import { WithProviders } from "../shared/WithProviders.js";

export const userRoutes: RouteObject[] = [
  {
    path: "/my-stories",
    element: (
      <WithProviders>
        <Users />
      </WithProviders>
    ),
    id: "user-stories",
  },
];
