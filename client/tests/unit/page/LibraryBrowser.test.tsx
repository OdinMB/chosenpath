import type { ReactNode } from "react";
import type { TemplateMetadata } from "core/types";
import {
  LibraryBrowser,
  ShareFilterModal,
} from "../../../src/page/components/LibraryBrowser";
import type { LibraryLoaderData } from "../../../src/page/loaders/libraryLoader";
import {
  accessibleText,
  attribute,
  openingTag,
  renderMarkup,
} from "../../helpers/staticMarkup";
import { templateMetadata } from "../../helpers/templateFixtures";

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../src/config", () =>
  jest.requireActual("../../__mocks__/client/config")
);
// The modal renders through a portal, which a static render can't. Mocked at
// its own module: a mock of the ui barrel would hand the components that import
// the barrel themselves (Notification) a half-built copy of it.
jest.mock("../../../src/shared/components/ui/Modal", () => ({
  Modal: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

// /library?tags=Fantasy&players=2
const libraryWithFilters: LibraryLoaderData = {
  templates: [
    templateMetadata("lighthouse", 1, 2, ["Fantasy", "Cozy"]),
    templateMetadata("station", 2, 3, ["Sci-Fi"]),
  ],
  tagCategories: { Genre: ["Fantasy", "Sci-Fi"], Mood: ["Cozy"] },
  initialTags: ["Fantasy"],
  initialPlayerCount: 2,
  loadFailed: false,
};

// What the loader returns when the templates couldn't be fetched
const libraryThatFailedToLoad: LibraryLoaderData = {
  templates: [],
  tagCategories: {},
  initialTags: [],
  initialPlayerCount: null,
  loadFailed: true,
};

let mockLoaderData = libraryWithFilters;
const mockRevalidate = jest.fn();
let mockRevalidatorState: "idle" | "loading" = "idle";
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => jest.fn(),
  useLoaderData: () => mockLoaderData,
  useRevalidator: () => ({
    revalidate: mockRevalidate,
    state: mockRevalidatorState,
  }),
}));
// Whether the filters start open depends on the screen width, which Node has
// none of; each test sets it. What the filters match is set by an effect, which
// a static render never runs, so a test that needs no matches sets that too.
let mockShowFilters = true;
let mockFilteredTemplates: TemplateMetadata[] | undefined;
jest.mock("../../../src/page/hooks/useLibraryBrowser", () => {
  const actual = jest.requireActual<
    typeof import("../../../src/page/hooks/useLibraryBrowser")
  >("../../../src/page/hooks/useLibraryBrowser");
  return {
    useLibraryBrowser: (
      props: Parameters<typeof actual.useLibraryBrowser>[0]
    ) => {
      const state = actual.useLibraryBrowser(props);
      return {
        ...state,
        showFilters: mockShowFilters,
        filteredTemplates: mockFilteredTemplates ?? state.filteredTemplates,
      };
    },
  };
});
// The notice as it is, with the handler its Retry button gets kept for the
// tests to press
type NoticeProps = { onRetry: () => void; isRetrying: boolean };
const mockNoticeProps: NoticeProps[] = [];
jest.mock("../../../src/page/components/LibraryLoadFailedNotice", () => {
  const actual = jest.requireActual<
    typeof import("../../../src/page/components/LibraryLoadFailedNotice")
  >("../../../src/page/components/LibraryLoadFailedNotice");
  return {
    LibraryLoadFailedNotice: (props: NoticeProps) => {
      mockNoticeProps.push(props);
      return actual.LibraryLoadFailedNotice(props);
    },
  };
});

const filtersToggle = (html: string) =>
  /<button[^>]*>Filters<svg/.exec(html)?.[0] ?? "";
const tagChip = (html: string, tag: string) =>
  new RegExp(`<button[^>]*>${tag}</button>`).exec(html)?.[0] ?? "";
const buttonsIn = (html: string) =>
  Array.from(html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g), (match) =>
    accessibleText(match[1] ?? "")
  );

const LOAD_FAILED_TITLE = "We couldn't load the library";
const NO_MATCHES_TITLE = "No Matches";

afterEach(() => {
  mockLoaderData = libraryWithFilters;
  mockShowFilters = true;
  mockFilteredTemplates = undefined;
  mockRevalidatorState = "idle";
  mockNoticeProps.length = 0;
  mockRevalidate.mockClear();
});

describe("LibraryBrowser filters", () => {
  it("says whether the filter panel is open on its toggle", () => {
    expect(attribute(filtersToggle(renderMarkup(<LibraryBrowser />)), "aria-expanded")).toBe("true");

    mockShowFilters = false;
    const closed = filtersToggle(renderMarkup(<LibraryBrowser />));
    expect(attribute(closed, "aria-expanded")).toBe("false");
    // Named by its text, its state carried by aria-expanded
    expect(closed).not.toContain("aria-label");
  });

  it("marks the selected player count as pressed and names each count", () => {
    const html = renderMarkup(<LibraryBrowser />);

    expect(attribute(openingTag(html, "button", "aria-label", "2 players"), "aria-pressed")).toBe("true");
    expect(attribute(openingTag(html, "button", "aria-label", "1 player"), "aria-pressed")).toBe("false");
    expect(attribute(openingTag(html, "button", "aria-label", "3 players"), "aria-pressed")).toBe("false");
  });

  it.each([
    ["Fantasy", "true"],
    ["Sci-Fi", "false"],
    ["Cozy", "false"],
  ])("marks the %s tag chip pressed=%s", (tag, pressed) => {
    expect(attribute(tagChip(renderMarkup(<LibraryBrowser />), tag), "aria-pressed")).toBe(pressed);
  });
});

describe("LibraryBrowser results", () => {
  it("shows the no-matches card, not a load failure, when the library loaded and the filters match nothing", () => {
    mockFilteredTemplates = [];

    const html = renderMarkup(<LibraryBrowser />);

    expect(accessibleText(html)).toContain(NO_MATCHES_TITLE);
    expect(buttonsIn(html)).toContain("Clear Filters");
    expect(filtersToggle(html)).not.toBe("");
    expect(accessibleText(html)).not.toContain(LOAD_FAILED_TITLE);
  });

  it("says the library couldn't load and offers Retry instead of filters or the no-matches card", () => {
    mockLoaderData = libraryThatFailedToLoad;

    const html = renderMarkup(<LibraryBrowser />);

    expect(openingTag(html, "div", "role", "alert")).not.toBe("");
    expect(accessibleText(html)).toContain(
      `${LOAD_FAILED_TITLE} We couldn't load the story templates. Check your connection and try again in a moment.`
    );
    expect(buttonsIn(html)).toEqual(["Back", "Retry"]);
    expect(accessibleText(html)).not.toContain(NO_MATCHES_TITLE);
    expect(filtersToggle(html)).toBe("");
  });

  it("loads the library again when Retry is pressed, and shows it is loading meanwhile", () => {
    mockLoaderData = libraryThatFailedToLoad;
    renderMarkup(<LibraryBrowser />);

    mockNoticeProps[mockNoticeProps.length - 1]!.onRetry();
    expect(mockRevalidate).toHaveBeenCalledTimes(1);

    mockRevalidatorState = "loading";
    const html = renderMarkup(<LibraryBrowser />);
    expect(mockNoticeProps[mockNoticeProps.length - 1]!.isRetrying).toBe(true);
    expect(openingTag(html, "button", "disabled", "")).not.toBe("");
  });
});

describe("ShareFilterModal", () => {
  it("labels the link field", () => {
    const html = renderMarkup(
      <ShareFilterModal
        isOpen
        onClose={jest.fn()}
        shareUrl="https://example.com/library?tags=Fantasy"
      />
    );

    const input = openingTag(html, "input", "readonly", "");
    expect(attribute(input, "aria-label")).toBe("Link to the filtered library");
    expect(attribute(input, "value")).toBe("https://example.com/library?tags=Fantasy");
  });
});
