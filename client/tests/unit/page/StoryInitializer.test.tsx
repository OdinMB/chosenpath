import { KID_AGES_HINT } from "core/types";
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

/*
 * The read-with-kids setting (the owner's decision of 2026-10-01): the form
 * takes one age or a range ("5" or "8-10") in a text field, and a value it
 * can't read shows the hint and keeps the story from being created. Field
 * values come from the query string, as the form fills them back after a
 * reload.
 */
describe("StoryInitializer read-with-kids ages", () => {
  function renderKids(query: string): string {
    mockSearch = `step=3&category=read-with-kids${query ? `&${query}` : ""}`;
    return renderMarkup(<StoryInitializer onBack={jest.fn()} />);
  }
  const ageInput = (html: string) => /<input[^>]*id="category-kidAge"[^>]*>/.exec(html)?.[0] ?? "";
  const createButton = (html: string) => /<button[^>]*type="submit"[^>]*>/.exec(html)?.[0] ?? "";

  it("takes a range in a text field, with no error and the create button enabled", () => {
    const html = renderKids("field_kidAge=8-10");
    expect(ageInput(html)).toContain('type="text"');
    expect(ageInput(html)).toContain('value="8-10"');
    expect(ageInput(html)).not.toContain('aria-invalid="true"');
    expect(accessibleText(html)).not.toContain(KID_AGES_HINT);
    expect(createButton(html)).not.toContain("disabled");
  });

  it("says a placeholder with both forms", () => {
    expect(ageInput(renderKids(""))).toContain('placeholder="5 or 8-10"');
  });

  it("shows the hint and disables Create Story for a value it can't read", () => {
    const html = renderKids("field_kidAge=five");
    expect(ageInput(html)).toContain('aria-invalid="true"');
    expect(ageInput(html)).toContain('aria-describedby="category-kidAge-error"');
    expect(html).toMatch(new RegExp(`id="category-kidAge-error"[^>]*>${KID_AGES_HINT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<`));
    expect(createButton(html)).toContain("disabled");
  });

  it("leaves an empty field optional", () => {
    const html = renderKids("");
    expect(accessibleText(html)).not.toContain(KID_AGES_HINT);
    expect(createButton(html)).not.toContain("disabled");
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
