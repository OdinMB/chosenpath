import type { ReactNode } from "react";
import { GameModes, PublicationStatus } from "core/types";
import type { PlayerCount, TemplateMetadata } from "core/types";
import {
  LibraryBrowser,
  ShareFilterModal,
} from "../../../src/page/components/LibraryBrowser";
import { attribute, openingTag, renderMarkup } from "../../helpers/staticMarkup";

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../src/config", () =>
  jest.requireActual("../../__mocks__/client/config")
);
// The modal renders through a portal, which a static render can't
jest.mock("../../../src/shared/components/ui", () => ({
  ...jest.requireActual("../../../src/shared/components/ui"),
  Modal: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

function template(
  id: string,
  playerCountMin: PlayerCount,
  playerCountMax: PlayerCount,
  tags: string[]
): TemplateMetadata {
  return {
    id,
    title: id,
    teaser: "",
    gameMode: GameModes.Cooperative,
    tags,
    playerCountMin,
    playerCountMax,
    maxTurnsMin: 10,
    maxTurnsMax: 10,
    publicationStatus: PublicationStatus.Published,
    showOnWelcomeScreen: true,
    order: 0,
    containsImages: false,
    createdAt: "2026-10-26T00:00:00.000Z",
    updatedAt: "2026-10-26T00:00:00.000Z",
  };
}

// /library?tags=Fantasy&players=2
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => jest.fn(),
  useLoaderData: () => ({
    templates: [
      template("lighthouse", 1, 2, ["Fantasy", "Cozy"]),
      template("station", 2, 3, ["Sci-Fi"]),
    ],
    tagCategories: { Genre: ["Fantasy", "Sci-Fi"], Mood: ["Cozy"] },
    initialTags: ["Fantasy"],
    initialPlayerCount: 2,
  }),
}));
// Whether the filters start open depends on the screen width, which Node has
// none of; each test sets it
let mockShowFilters = true;
jest.mock("../../../src/page/hooks/useLibraryBrowser", () => {
  const actual = jest.requireActual<
    typeof import("../../../src/page/hooks/useLibraryBrowser")
  >("../../../src/page/hooks/useLibraryBrowser");
  return {
    useLibraryBrowser: (
      props: Parameters<typeof actual.useLibraryBrowser>[0]
    ) => ({ ...actual.useLibraryBrowser(props), showFilters: mockShowFilters }),
  };
});

const filtersToggle = (html: string) =>
  /<button[^>]*>Filters<svg/.exec(html)?.[0] ?? "";
const tagChip = (html: string, tag: string) =>
  new RegExp(`<button[^>]*>${tag}</button>`).exec(html)?.[0] ?? "";

describe("LibraryBrowser filters", () => {
  afterEach(() => {
    mockShowFilters = true;
  });

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
