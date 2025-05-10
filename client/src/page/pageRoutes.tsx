import { RouteObject } from "react-router-dom";
import { Page } from "./Page";
import { templateLoader } from "../shared/templateLoader";
import { templateConfigLoader } from "../shared/templateConfigLoader";
import { codeJoinLoader } from "../shared/codeJoinLoader";
import { TemplateErrorBoundary } from "./TemplateErrorBoundary";
import { WithProviders } from "../shared/WithProviders";
import { LibraryBrowser } from "./components/LibraryBrowser";
import { libraryLoader } from "../shared/libraryLoader";
import { TemplateConfigurator } from "./components/TemplateConfigurator";
import { StoryInitializer } from "./components/StoryInitializer";

// Define routes for the page section
export const pageRoutes: RouteObject[] = [
  {
    path: "/",
    element: (
      <WithProviders>
        <Page />
      </WithProviders>
    ),
    id: "welcome",
  },
  {
    path: "/setup",
    element: (
      <WithProviders>
        <StoryInitializer onBack={() => window.history.back()} />
      </WithProviders>
    ),
    id: "story-setup",
  },
  {
    path: "/templates/:id/configure",
    loader: templateConfigLoader,
    element: (
      <WithProviders>
        <TemplateConfigurator />
      </WithProviders>
    ),
    errorElement: <TemplateErrorBoundary />,
    id: "template-config",
  },
  {
    path: "/library",
    loader: libraryLoader,
    element: (
      <WithProviders>
        <LibraryBrowser />
      </WithProviders>
    ),
    errorElement: <TemplateErrorBoundary />,
    id: "library",
  },
  {
    path: "/join/:code",
    loader: codeJoinLoader,
    element: (
      <WithProviders>
        <div>Player Codes (Coming Soon)</div>
      </WithProviders>
    ),
    id: "player-codes",
  },
  // Special redirect route for shared templates
  {
    path: "/share/template/:id",
    loader: templateLoader,
    element: <div>Redirecting...</div>,
    errorElement: <TemplateErrorBoundary />,
    id: "shared-template",
  },
];
