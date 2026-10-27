import type { MouseEvent } from "react";
import { TemplateCard } from "../../../src/page/components/TemplateCard";
import { accessibleText, attribute, renderMarkup } from "../../helpers/staticMarkup";
import { templateMetadata } from "../../helpers/templateFixtures";

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../src/config", () =>
  jest.requireActual("../../__mocks__/client/config")
);

/*
 * A library card's title is a link to the World's page, where its Play button
 * goes too: keyboard and screen-reader users get a link named after the World.
 * The link's and the Play button's click handlers are kept as the markup is
 * built, for the tests to press.
 */

// The parts of a click the link reads
type LinkClick = Pick<
  MouseEvent<HTMLAnchorElement>,
  "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "preventDefault"
>;
type Clickable = { onClick?: (event: LinkClick) => void };
const mockLinks: Clickable[] = [];
const mockPlayButtons: Array<{ onClick?: () => void }> = [];
jest.mock("react/jsx-runtime", () => {
  const runtime = jest.requireActual<typeof import("react/jsx-runtime")>("react/jsx-runtime");
  const keepingClicks =
    (create: typeof runtime.jsx): typeof runtime.jsx =>
    (type, props, key) => {
      if (type === "a") mockLinks.push(props as Clickable);
      if ((props as { children?: unknown }).children === "Play") {
        mockPlayButtons.push(props as { onClick?: () => void });
      }
      return create(type, props, key);
    };
  return { ...runtime, jsx: keepingClicks(runtime.jsx), jsxs: keepingClicks(runtime.jsxs) };
});

afterEach(() => {
  mockLinks.length = 0;
  mockPlayButtons.length = 0;
});

const lighthouse = { ...templateMetadata("lighthouse", 1, 2, ["Cozy"]), title: "The Last Lighthouse" };

/** The first link in the markup: its opening tag and its text. */
function firstLink(html: string) {
  const match = /(<a\b[^>]*>)([\s\S]*?)<\/a>/.exec(html);
  return { tag: match?.[1] ?? "", text: accessibleText(match?.[2] ?? "") };
}

function click(overrides: Partial<Omit<LinkClick, "preventDefault">> = {}) {
  return {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault: jest.fn(),
    ...overrides,
  };
}

describe("TemplateCard title link", () => {
  it("links the title, inside its heading, to the World's page", () => {
    const html = renderMarkup(<TemplateCard template={lighthouse} onPlay={jest.fn()} />);

    const link = firstLink(html);
    expect(attribute(link.tag, "href")).toBe("/templates/lighthouse/configure");
    expect(link.text).toBe("The Last Lighthouse");
    expect(html).toMatch(/<h3[^>]*><a\b[^>]*>The Last Lighthouse<\/a><\/h3>/);
    // Shown as a link only on hover and keyboard focus
    expect(attribute(link.tag, "class")).toContain("hover:underline");
    expect(attribute(link.tag, "class")).toContain("focus-visible:ring-2");
  });

  it("keeps the Play button beside it", () => {
    const html = renderMarkup(<TemplateCard template={lighthouse} onPlay={jest.fn()} />);

    expect(html).toMatch(/<button[^>]*>[\s\S]*?Play[\s\S]*?<\/button>/);
  });

  it("opens the World the way the Play button does on a plain click", () => {
    const onPlay = jest.fn();
    renderMarkup(<TemplateCard template={lighthouse} onPlay={onPlay} />);

    const event = click();
    mockLinks[0]!.onClick!(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(onPlay).toHaveBeenCalledWith(lighthouse);

    mockPlayButtons[0]!.onClick!();
    expect(onPlay).toHaveBeenCalledTimes(2);
    expect(onPlay).toHaveBeenLastCalledWith(lighthouse);
  });

  it.each([
    ["Ctrl", { ctrlKey: true }],
    ["Cmd", { metaKey: true }],
    ["Shift", { shiftKey: true }],
    ["middle-button", { button: 1 }],
  ])("leaves a %s click to the browser, which opens the link's address", (_, overrides) => {
    const onPlay = jest.fn();
    renderMarkup(<TemplateCard template={lighthouse} onPlay={onPlay} />);

    const event = click(overrides);
    mockLinks[0]!.onClick!(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(onPlay).not.toHaveBeenCalled();
  });

  it("has no link where the card has no Play button (on the World's own page)", () => {
    const html = renderMarkup(<TemplateCard template={lighthouse} onPlay={jest.fn()} showPlayButton={false} />);

    expect(html).not.toContain("<a ");
    expect(html).toMatch(/<h3[^>]*>The Last Lighthouse<\/h3>/);
  });
});
