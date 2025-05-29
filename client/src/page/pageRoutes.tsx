import { RouteObject } from "react-router-dom";
import { Page } from "./Page";
import { templatesLoader } from "../resources/templates/loaders/templatesLoader";
import { configurableTemplateLoader } from "../resources/templates/loaders/templateLoader";
import { TemplateErrorBoundary } from "./TemplateErrorBoundary";
import { LibraryBrowser } from "./components/LibraryBrowser";
import { TemplateConfigurator } from "./components/TemplateConfigurator";
import { StoryInitializer } from "./components/StoryInitializer";
import { PageLayout } from "./PageLayout";
import { Credits } from "./components/Credits";
import { Privacy } from "./components/Privacy";
import { ForStorytellers } from "./components/ForStorytellers";
import { ScrollRestoration } from "react-router-dom";
import { libraryLoader } from "./loaders/libraryLoader";

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
        loader: async () =>
          templatesLoader({
            context: "published",
            forWelcomeScreen: true,
          }),
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
      {
        path: "/for-storytellers",
        element: <ForStorytellers />,
        id: "for-storytellers",
      },
      // Group template-related routes under a shared error boundary
      {
        errorElement: <TemplateErrorBoundary />,
        children: [
          {
            path: "/templates/:id/configure",
            loader: ({ params }) => {
              if (!params.id) {
                throw new Response("Template ID is required", { status: 400 });
              }
              return configurableTemplateLoader(params.id);
            },
            element: <TemplateConfigurator />,
            id: "template-config",
          },
          {
            path: "/library",
            loader: libraryLoader,
            element: <LibraryBrowser />,
            id: "library",
          },
        ],
      },
    ],
  },
];
