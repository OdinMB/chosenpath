import { RouteObject } from "react-router-dom";
import { Page } from "./Page";
import { libraryLoader } from "./loaders/libraryLoader";
import { templateConfigLoader } from "./loaders/templateConfigLoader";
import { templateLoader } from "shared/templateLoader";
import { TemplateErrorBoundary } from "./TemplateErrorBoundary";
import { LibraryBrowser } from "./components/LibraryBrowser";
import { TemplateConfigurator } from "./components/TemplateConfigurator";
import { StoryInitializer } from "./components/StoryInitializer";
import { PageLayout } from "./PageLayout";
import { Credits } from "./components/Credits";
import { Privacy } from "./components/Privacy";
import { ScrollRestoration } from "react-router-dom";

// Define routes for the page section
export const pageRoutes: RouteObject[] = [
  {
    element: (
      <>
        <PageLayout />
        <ScrollRestoration />
      </>
    ),
    children: [
      {
        path: "/",
        loader: libraryLoader,
        element: <Page />,
        id: "welcome",
      },
      {
        path: "/setup",
        element: (
          <StoryInitializer
            onBack={() => window.history.back()}
            showDifficultySlider={false}
          />
        ),
        id: "story-setup",
      },
      {
        path: "/credits",
        element: <Credits />,
        id: "credits",
      },
      {
        path: "/privacy",
        element: <Privacy />,
        id: "privacy",
      },
      // Group template-related routes under a shared error boundary
      {
        errorElement: <TemplateErrorBoundary />,
        children: [
          {
            path: "/templates/:id/configure",
            loader: templateConfigLoader,
            element: <TemplateConfigurator />,
            id: "template-config",
          },
          {
            path: "/library",
            loader: libraryLoader,
            element: <LibraryBrowser />,
            id: "library",
          },
          {
            path: "/share/template/:id",
            loader: templateLoader,
            element: <div>Redirecting...</div>,
            id: "shared-template",
          },
        ],
      },
    ],
  },
];
