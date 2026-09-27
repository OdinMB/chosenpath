import { GameModes, PublicationStatus } from "core/types";
import type { TemplateMetadata } from "core/types";
import { TemplateConfigurator } from "../../../src/page/components/TemplateConfigurator";
import { accessibleText, notesIn, renderMarkup } from "../../helpers/staticMarkup";

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../src/config", () =>
  jest.requireActual("../../__mocks__/client/config")
);
// The share button reads window.location, which Node has no window for
jest.mock("../../../src/shared/components/ShareLink", () => ({
  ShareLink: () => null,
}));

const TEMPLATE: TemplateMetadata = {
  id: "template-1",
  title: "The Lighthouse",
  teaser: "A keeper, a storm, a ship on the rocks.",
  gameMode: GameModes.Cooperative,
  tags: [],
  playerCountMin: 1,
  playerCountMax: 2,
  maxTurnsMin: 10,
  maxTurnsMax: 10,
  publicationStatus: PublicationStatus.Published,
  showOnWelcomeScreen: true,
  order: 0,
  containsImages: true,
  createdAt: "2026-09-26T00:00:00.000Z",
  updatedAt: "2026-09-26T00:00:00.000Z",
};

// /templates/:id/configure, where library and home "Play" buttons and shared
// links arrive
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => jest.fn(),
  useLoaderData: () => ({ template: TEMPLATE }),
}));
const IDLE_CREATION = {
  isLoading: false,
  storyId: null as string | null,
  playerCodes: null as Record<string, string> | null,
  storyReady: false,
  setupFailed: false,
  createStoryFromTemplate: jest.fn(),
  retryStoryCreation: jest.fn(),
  resetStoryCreation: jest.fn(),
  handleCodeSubmit: jest.fn(),
};
let mockCreation = IDLE_CREATION;
jest.mock("../../../src/page/hooks/useStoryCreation", () => ({
  useStoryCreation: () => mockCreation,
}));

describe("TemplateConfigurator AI notice", () => {
  it("says next to the Start Story button that an AI system writes the story from this template", () => {
    const html = renderMarkup(<TemplateConfigurator />);

    const notes = notesIn(html);
    // Images are off until the player ticks "Add unique images to your story"
    expect(notes).toEqual([
      expect.objectContaining({
        name: "AI system",
        lang: "en",
        text: "An AI system will write your story from this template.",
      }),
    ]);
    // Directly before the row with the Back and Start Story buttons
    const afterNote = html
      .slice(notes[0]?.offset ?? 0)
      .replace(/<p[\s\S]*?<\/p>/, "");
    expect(afterNote).toMatch(/^<div[^>]*><button[^>]*>[\s\S]*?Back/);
    expect(afterNote).toContain("Start Story");
  });
});

describe("TemplateConfigurator after a setup", () => {
  afterEach(() => {
    mockCreation = IDLE_CREATION;
  });

  it("shows the failure message instead of the codes when the story couldn't be set up", () => {
    mockCreation = { ...IDLE_CREATION, storyId: "story-1", playerCodes: { player1: "ABC123" }, setupFailed: true };

    const text = accessibleText(renderMarkup(<TemplateConfigurator />));

    expect(text).toContain("We couldn't create this story. Please try again.");
    expect(text).not.toContain("ABC123");
  });
});
