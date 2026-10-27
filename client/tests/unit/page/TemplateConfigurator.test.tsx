import { GameModes, PublicationStatus } from "core/types";
import type { TemplateMetadata } from "core/types";
import { TemplateConfigurator } from "../../../src/page/components/TemplateConfigurator";
import {
  accessibleText,
  attribute,
  notesIn,
  openingTag,
  renderMarkup,
} from "../../helpers/staticMarkup";
import { AUDIENCE_WORDS } from "../../helpers/genericWording";

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
let mockTemplate = TEMPLATE;
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => jest.fn(),
  useLoaderData: () => ({ template: mockTemplate }),
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
// Signed out unless a test signs in
let mockUser: { id: string } | null = null;
jest.mock("../../../src/shared/auth/useAuth", () => ({
  useAuth: () => ({ user: mockUser }),
}));
// Whether the form asks for the account's starts left
const mockUseStartsLeft = jest.fn((enabled: boolean) => {
  void enabled;
  return { startsLeft: null, refresh: jest.fn() };
});
jest.mock("../../../src/page/hooks/useStartsLeft", () => ({
  useStartsLeft: (enabled: boolean) => mockUseStartsLeft(enabled),
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

describe("TemplateConfigurator sliders", () => {
  afterEach(() => {
    mockTemplate = TEMPLATE;
  });

  it("reads out the player count with its unit", () => {
    const slider = openingTag(renderMarkup(<TemplateConfigurator />), "input", "id", "player-count");

    expect(attribute(slider, "value")).toBe("1");
    expect(attribute(slider, "aria-valuetext")).toBe("1 player");
  });

  it("reads out the story length in turns", () => {
    mockTemplate = { ...TEMPLATE, maxTurnsMin: 8, maxTurnsMax: 12 };

    const slider = openingTag(renderMarkup(<TemplateConfigurator />), "input", "id", "max-turns");

    expect(attribute(slider, "aria-valuetext")).toBe(`${attribute(slider, "value")} turns`);
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

  it("shows the codes under the template's title once the story is set up", () => {
    mockCreation = { ...IDLE_CREATION, storyId: "story-1", playerCodes: { player1: "ABC123" }, storyReady: true };

    const text = accessibleText(renderMarkup(<TemplateConfigurator />));

    expect(text).toContain("The Lighthouse");
    expect(text).toContain("ABC123");
    expect(text).not.toContain("Settings");
  });
});

describe("TemplateConfigurator settings", () => {
  afterEach(() => {
    mockTemplate = TEMPLATE;
  });

  it("shows the settings panel even when the template fixes players, length and difficulty", () => {
    mockTemplate = { ...TEMPLATE, playerCountMax: 1 };

    const html = renderMarkup(<TemplateConfigurator />);

    expect(accessibleText(html)).toContain("Settings");
    expect(html).not.toContain('id="player-count"');
    expect(html).toContain('id="generate-images"');
    expect(html).toContain('id="pregenerate-beats"');
  });
});

/** What a checkbox's label holds: its name, when it holds no other control. */
const labelFor = (html: string, id: string) =>
  new RegExp(`<label[^>]*for="${id}"[^>]*>([\\s\\S]*?)</label>`).exec(html)?.[1];

describe("TemplateConfigurator info buttons", () => {
  it.each([
    [
      "generate-images",
      "Add unique images to your story",
      "About unique images",
      "The story always has default images. We will add additional ones for your unique story.",
    ],
    [
      "pregenerate-beats",
      "Reduce wait time after choices",
      "About reducing wait time",
      "Creates story content in advance for each possible choice. More expensive but eliminates waiting.",
    ],
  ])(
    "names the %s checkbox by its text alone, with an info button beside it described by its tooltip",
    (id, text, name, tooltip) => {
      const html = renderMarkup(<TemplateConfigurator />);

      expect(labelFor(html, id)).toBe(text);
      const button = openingTag(html, "button", "aria-label", name);
      expect(attribute(button, "type")).toBe("button");
      expect(html).toContain(`<span id="${attribute(button, "aria-describedby")}" hidden="">${tooltip}</span>`);
    }
  );
});

describe("TemplateConfigurator several stories at once", () => {
  afterEach(() => {
    mockUser = null;
  });

  it("offers no several-stories start to a visitor who is not signed in", () => {
    const html = renderMarkup(<TemplateConfigurator />);

    expect(html).not.toContain('id="start-several-stories"');
    expect(accessibleText(html)).toContain("Start Story");
  });

  it("offers a signed-in user to start several stories, off by default", () => {
    mockUser = { id: "user-1" };

    const html = renderMarkup(<TemplateConfigurator />);

    const checkbox = openingTag(html, "input", "id", "start-several-stories");
    expect(attribute(checkbox, "type")).toBe("checkbox");
    expect(checkbox).not.toMatch(/\schecked/);
    // Until it is ticked, the form starts one story: no count, images allowed
    expect(html).not.toContain('id="story-count"');
    expect(html).not.toContain('id="several-stories-images-note"');
    expect(openingTag(html, "input", "id", "generate-images")).not.toMatch(/\sdisabled/);
    expect(accessibleText(html)).toContain("Start Story");
  });

  it("names no audience or group on the signed-in user's form", () => {
    mockUser = { id: "user-1" };

    expect(accessibleText(renderMarkup(<TemplateConfigurator />))).not.toMatch(AUDIENCE_WORDS);
  });

  it("asks for the starts left only once several stories are to start", () => {
    mockUseStartsLeft.mockClear();
    mockUser = { id: "user-1" };
    const signedIn = renderMarkup(<TemplateConfigurator />);
    mockUser = null;
    renderMarkup(<TemplateConfigurator />);

    expect(mockUseStartsLeft.mock.calls.map(([enabled]) => enabled)).toEqual([false, false]);
    // Nothing next to Start for a single story
    expect(signedIn).not.toContain('id="several-stories-start-note"');
    expect(openingTag(signedIn, "button", "type", "submit")).not.toContain("aria-describedby");
  });
});
