import { StoryInitializer } from "../../../src/page/components/StoryInitializer";
import { accessibleText, notesIn, renderMarkup } from "../../helpers/staticMarkup";

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../src/config", () =>
  jest.requireActual("../../__mocks__/client/config")
);
// Jest's mapper resolves this ".js" import to core's ESM build; use the source
jest.mock("core/utils/difficultyUtils.js", () =>
  jest.requireActual("../../../../core/utils/difficultyUtils")
);
// The setup page at step 3, the step with the create button. Each test sets
// the rest of the query string, which is where the images setting comes from.
const STEP_3 = "step=3&category=enjoy-fiction";
let mockSearch = STEP_3;
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => jest.fn(),
  useSearchParams: () => [new URLSearchParams(mockSearch), jest.fn()],
}));
const IDLE_CREATION = {
  isLoading: false,
  storyId: null as string | null,
  playerCodes: null as Record<string, string> | null,
  storyReady: false,
  setupFailed: false,
  createStory: jest.fn(),
  retryStoryCreation: jest.fn(),
  resetStoryCreation: jest.fn(),
  handleCodeSubmit: jest.fn(),
};
let mockCreation = IDLE_CREATION;
jest.mock("../../../src/page/hooks/useStoryCreation", () => ({
  useStoryCreation: () => mockCreation,
}));
jest.mock("../../../src/shared/auth/useAuth", () => ({
  useAuth: () => ({ user: null }),
}));

const SETUP_WITH_IMAGES =
  "An AI system will write your story and create its images from your premise.";
const SETUP_WITHOUT_IMAGES =
  "An AI system will write your story from your premise.";

function renderSetupStep3(templateMode: boolean, query = ""): string {
  mockSearch = query ? `${STEP_3}&${query}` : STEP_3;
  return renderMarkup(
    <StoryInitializer onBack={jest.fn()} templateMode={templateMode} />
  );
}

describe("StoryInitializer AI notice", () => {
  it("says next to the create button that an AI system writes the story", () => {
    const html = renderSetupStep3(false);

    const notes = notesIn(html);
    expect(notes).toEqual([
      expect.objectContaining({
        name: "AI system",
        lang: "en",
        text: SETUP_WITH_IMAGES,
      }),
    ]);
    // Directly before the row with the Back and Create Story buttons
    const afterNote = html
      .slice(notes[0]?.offset ?? 0)
      .replace(/<p[\s\S]*?<\/p>/, "");
    expect(afterNote).toMatch(/^<div[^>]*><button[^>]*>[\s\S]*?Back/);
    expect(afterNote).toContain("Create Story");
  });

  it.each([
    ["images=true", SETUP_WITH_IMAGES],
    ["images=false", SETUP_WITHOUT_IMAGES],
  ])("follows the images setting (%s)", (query, copy) => {
    expect(notesIn(renderSetupStep3(false, query))).toEqual([
      expect.objectContaining({ text: copy }),
    ]);
  });

  it("leaves template mode to the labelled AI Worldbuilding Assistant", () => {
    expect(notesIn(renderSetupStep3(true))).toEqual([]);
  });
});

describe("StoryInitializer after a setup", () => {
  afterEach(() => {
    mockCreation = IDLE_CREATION;
  });

  const CODES = { player1: "ABC123", player2: "DEF456" };

  it("replaces the waiting screen with the failure message when the setup failed", () => {
    mockCreation = { ...IDLE_CREATION, storyId: "story-1", playerCodes: CODES, setupFailed: true };

    const text = accessibleText(renderSetupStep3(false));

    expect(text).toContain("We couldn't create this story. Please try again.");
    expect(text).toContain("Try again");
    expect(text).not.toContain("ABC123");
    expect(text).not.toContain("Waiting");
  });

  it("still shows the codes while the story is being created", () => {
    mockCreation = { ...IDLE_CREATION, storyId: "story-1", playerCodes: CODES };

    const text = accessibleText(renderSetupStep3(false));

    expect(text).toContain("ABC123");
    expect(text).not.toContain("We couldn't create this story");
  });

  it("shows the setup form, not the failure message, when the request itself was refused (e.g. by moderation)", () => {
    const text = accessibleText(renderSetupStep3(false));

    expect(text).toContain("Create Story");
    expect(text).not.toContain("We couldn't create this story");
  });
});
