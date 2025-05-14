import { RouteObject } from "react-router-dom";
import { GamePage } from "./GamePage"; // Placeholder for the main game page component
import { GameSessionProvider } from "./GameSessionProvider";
import { ErrorBoundary } from "../shared/components/ErrorBoundary";

export const gameRoutes: RouteObject[] = [
  {
    path: "/game/:code", // This is the primary route for joining/playing a game
    element: (
      <GameSessionProvider>
        <GamePage />
      </GameSessionProvider>
    ),
    errorElement: <ErrorBoundary />,
    // Children routes for different game states or views can be added here if needed
    // e.g., character selection, active play, game over
  },
];
