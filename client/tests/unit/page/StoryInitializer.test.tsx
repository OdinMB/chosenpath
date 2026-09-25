import { StoryInitializer } from "../../../src/page/components/StoryInitializer";
import { notesIn, renderMarkup } from "../../helpers/staticMarkup";

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../src/config", () =>
  jest.requireActual("../../__mocks__/client/config")
);
// Jest's mapper resolves this ".js" import to core's ESM build; use the source
jest.mock("core/utils/difficultyUtils.js", () =>
  jest.requireActual("../../../../core/utils/difficultyUtils")
);
// The setup page at step 3, the step with the create button
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => jest.fn(),
  useSearchParams: () => [
    new URLSearchParams("step=3&category=enjoy-fiction"),
    jest.fn(),
  ],
}));
jest.mock("../../../src/page/hooks/useStoryCreation", () => ({
  useStoryCreation: () => ({
    isLoading: false,
    storyId: null,
    playerCodes: null,
    storyReady: false,
    createStory: jest.fn(),
    handleCodeSubmit: jest.fn(),
  }),
}));
jest.mock("../../../src/shared/auth/useAuth", () => ({
  useAuth: () => ({ user: null }),
}));

const SETUP =
  "An AI system will write your story and create its images from your premise.";

function renderSetupStep3(templateMode: boolean): string {
  return renderMarkup(
    <StoryInitializer onBack={jest.fn()} templateMode={templateMode} />
  );
}

describe("StoryInitializer AI notice", () => {
  it("says next to the create button that an AI system writes the story", () => {
    const html = renderSetupStep3(false);

    const notes = notesIn(html);
    expect(notes).toEqual([
      expect.objectContaining({ name: "AI system", lang: "en", text: SETUP }),
    ]);
    // Directly before the row with the Back and Create Story buttons
    const afterNote = html
      .slice(notes[0]?.offset ?? 0)
      .replace(/<p[\s\S]*?<\/p>/, "");
    expect(afterNote).toMatch(/^<div[^>]*><button[^>]*>[\s\S]*?Back/);
    expect(afterNote).toContain("Create Story");
  });

  it("leaves template mode to the labelled AI Worldbuilding Assistant", () => {
    expect(notesIn(renderSetupStep3(true))).toEqual([]);
  });
});
