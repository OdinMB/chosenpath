import { isValidElement, type ReactElement, type ReactNode } from "react";
import { Page } from "../../../src/page/Page";
import { CategoryTile } from "../../../src/page/components/CategoryTile";
import { renderMarkup } from "../../helpers/staticMarkup";

/*
 * The home page's category tiles: one click or key press opens the category
 * once. Every navigation adds a history entry, so a second one for the same
 * click would make the browser's Back button need two presses to get home.
 */

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../src/config", () =>
  jest.requireActual("../../__mocks__/client/config")
);
// Jest's mapper resolves this ".js" import (the setup page's, through the
// components index) to core's ESM build; use the source
jest.mock("core/utils/difficultyUtils.js", () =>
  jest.requireActual("../../../../core/utils/difficultyUtils")
);
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));
jest.mock("../../../src/shared/auth/useAuth", () => ({
  useAuth: () => ({ user: null }),
}));

const ENJOY_FICTION =
  "/setup?step=3&category=enjoy-fiction&players=1&images=true&pregenerate=true";

type FakeEvent = {
  key: string | undefined;
  stopped: boolean;
  preventDefault: jest.Mock;
  stopPropagation: () => void;
};
type Listeners = {
  onClick?: (event: FakeEvent) => void;
  onKeyDown?: (event: FakeEvent) => void;
};

function fakeEvent(key?: string): FakeEvent {
  const event: FakeEvent = {
    key,
    stopped: false,
    preventDefault: jest.fn(),
    stopPropagation: () => {
      event.stopped = true;
    },
  };
  return event;
}

/** The home page's element tree as its render returns it, before React renders its children. */
function homePage(): ReactNode {
  let tree: ReactNode = null;
  function Capture() {
    tree = Page();
    return null;
  }
  renderMarkup(<Capture />);
  return tree;
}

function childrenOf(element: ReactElement): ReactNode {
  return (element.props as { children?: ReactNode }).children;
}

/** Every element in the tree, in document order. */
function elementsIn(node: ReactNode): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(elementsIn);
  if (!isValidElement(node)) return [];
  return [node, ...elementsIn(childrenOf(node))];
}

/** The elements from the tree's root down to the target, the target last. */
function pathTo(node: ReactNode, target: ReactElement): ReactElement[] {
  if (Array.isArray(node)) {
    for (const child of node) {
      const path = pathTo(child, target);
      if (path.length > 0) return path;
    }
    return [];
  }
  if (!isValidElement(node)) return [];
  if (node === target) return [node];
  const below = pathTo(childrenOf(node), target);
  return below.length > 0 ? [node, ...below] : [];
}

/**
 * Fires an event as the browser does: on the innermost element of the path,
 * then on each element around it, until a listener stops it. Only DOM elements
 * listen; a component's props were handed to the elements it rendered.
 */
function dispatch(
  path: ReactElement[],
  listener: keyof Listeners,
  event: FakeEvent
): void {
  for (const element of [...path].reverse()) {
    if (typeof element.type !== "string") continue;
    (element.props as Listeners)[listener]?.(event);
    if (event.stopped) return;
  }
}

/** Each category tile on the home page, with the path from the page down to its image and to its own root. */
function categoryTiles() {
  const page = homePage();
  return elementsIn(page)
    .filter((element) => element.type === CategoryTile)
    .map((tile) => {
      const props = tile.props as Parameters<typeof CategoryTile>[0];
      const rendered = CategoryTile(props);
      const image = elementsIn(rendered).find((element) => element.type === "img")!;
      const toTile = pathTo(page, tile);
      return {
        title: props.title,
        root: rendered.props as { tabIndex?: number; role?: string },
        toImage: [...toTile, ...pathTo(rendered, image)],
        toRoot: [...toTile, rendered],
      };
    });
}

beforeEach(() => {
  mockNavigate.mockClear();
});

describe("Home page category tiles", () => {
  it("opens the category once per click, so Back returns home on the first press", () => {
    const tiles = categoryTiles();
    expect(tiles.map((tile) => tile.title)).toEqual([
      "Enjoy Fiction",
      "Vent about Reality",
      "Pretend to be",
      "Read with Kids",
      "Meet your Future Self",
      "Learn Something",
    ]);

    for (const tile of tiles) {
      mockNavigate.mockClear();
      dispatch(tile.toImage, "onClick", fakeEvent());

      expect(mockNavigate).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.stringMatching(/^\/setup\?step=3&category=[a-z-]+&/)
      );
    }

    mockNavigate.mockClear();
    dispatch(tiles[0]!.toImage, "onClick", fakeEvent());
    expect(mockNavigate).toHaveBeenCalledWith(ENJOY_FICTION);
  });

  it("can be focused and opened once from the keyboard with Enter or Space", () => {
    const [tile] = categoryTiles();

    expect(tile!.root).toEqual(expect.objectContaining({ tabIndex: 0, role: "button" }));

    for (const key of ["Enter", " "]) {
      mockNavigate.mockClear();
      const event = fakeEvent(key);
      dispatch(tile!.toRoot, "onKeyDown", event);

      expect(mockNavigate).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith(ENJOY_FICTION);
      // Space would otherwise scroll the page
      expect(event.preventDefault).toHaveBeenCalled();
    }

    mockNavigate.mockClear();
    dispatch(tile!.toRoot, "onKeyDown", fakeEvent("Tab"));
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
