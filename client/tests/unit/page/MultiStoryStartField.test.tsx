import { MultiStoryStartField } from "../../../src/page/components/MultiStoryStartField";
import {
  accessibleText,
  attribute,
  openingTag,
  renderMarkup,
} from "../../helpers/staticMarkup";
import { AUDIENCE_WORDS } from "../../helpers/genericWording";

/*
 * "Start several stories at once" on a World's settings. Ticked, the form
 * switches from starting a story to starting several: the number of stories
 * becomes the panel's centre, and the summary says how many will start.
 */

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../src/config", () =>
  jest.requireActual("../../__mocks__/client/config")
);
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => jest.fn(),
}));

function render(enabled: boolean, count = 4, disabled = false): string {
  return renderMarkup(
    <MultiStoryStartField
      enabled={enabled}
      count={count}
      onEnabledChange={jest.fn()}
      onCountChange={jest.fn()}
      disabled={disabled}
    />
  );
}

const isDisabled = (tag: string): boolean => /\sdisabled=""/.test(tag);
/** Disabled outright, or marked unavailable while staying focusable. */
const isUnavailable = (tag: string): boolean =>
  isDisabled(tag) || attribute(tag, "aria-disabled") === "true";
const fewer = (html: string) => openingTag(html, "button", "aria-label", "One story fewer");
const more = (html: string) => openingTag(html, "button", "aria-label", "One story more");
const panelClass = (html: string): string =>
  attribute(openingTag(html, "div", "id", "several-stories-panel"), "class") ?? "";

describe("MultiStoryStartField, not ticked", () => {
  it("offers the checkbox and nothing to count yet", () => {
    const html = render(false);

    const checkbox = openingTag(html, "input", "id", "start-several-stories");
    expect(attribute(checkbox, "type")).toBe("checkbox");
    expect(checkbox).not.toMatch(/\schecked/);
    expect(html).not.toContain('id="story-count"');
    expect(html).not.toContain('aria-live="polite"');
  });

  it("names the checkbox by its text alone, with an info button beside it described by its tooltip", () => {
    const html = render(false);

    expect(/<label[^>]*for="start-several-stories"[^>]*>([\s\S]*?)<\/label>/.exec(html)?.[1]).toBe(
      "Start several stories at once"
    );
    const button = openingTag(html, "button", "aria-label", "About starting several stories");
    expect(attribute(button, "type")).toBe("button");
    expect(html).toContain(
      `<span id="${attribute(button, "aria-describedby")}" hidden="">Starts several copies of this story, all with these settings. Each copy has its own seat codes, for one player or several.</span>`
    );
  });
});

describe("MultiStoryStartField, ticked", () => {
  it("puts the number of stories in a labelled field and says how many start", () => {
    const html = render(true, 4);

    expect(openingTag(html, "input", "id", "start-several-stories")).toMatch(/\schecked/);
    const field = openingTag(html, "input", "id", "story-count");
    expect(attribute(field, "value")).toBe("4");
    expect(attribute(field, "min")).toBe("2");
    expect(attribute(field, "max")).toBe("12");
    expect(html).toContain('for="story-count"');
    // The summary is announced as the count changes
    const summary = /<[^>]*aria-live="polite"[^>]*>([\s\S]*?)<\/(h3|p)>/.exec(html);
    expect(accessibleText(summary?.[1] ?? "")).toContain("4 stories at once");
  });

  it("counts an empty or out-of-range field as the start will", () => {
    const empty = render(true, Number.NaN);
    expect(attribute(openingTag(empty, "input", "id", "story-count"), "value")).toBe("");
    expect(accessibleText(empty)).toContain("2 stories at once");

    expect(accessibleText(render(true, 40))).toContain("12 stories at once");
  });

  it("lets the stepper go no lower than 2 and no higher than 12", () => {
    const atMin = render(true, 2);
    expect(isUnavailable(fewer(atMin))).toBe(true);
    expect(isUnavailable(more(atMin))).toBe(false);

    const between = render(true, 5);
    expect(isUnavailable(fewer(between))).toBe(false);
    expect(isUnavailable(more(between))).toBe(false);

    const atMax = render(true, 12);
    expect(isUnavailable(fewer(atMax))).toBe(false);
    expect(isUnavailable(more(atMax))).toBe(true);
  });

  it("keeps a stepper button at its limit focusable, and drops its hover look", () => {
    // A keyboard user pressing + up to 12 keeps their place on the button
    const button = more(render(true, 12));

    expect(isDisabled(button)).toBe(false);
    expect(attribute(button, "class")).toMatch(/cursor-not-allowed/);
    expect(attribute(button, "class")).not.toMatch(/hover:/);
    expect(attribute(more(render(true, 5)), "class")).toMatch(/hover:/);
  });

  it("tints the panel only while ticked, with nothing white competing", () => {
    expect(panelClass(render(true))).toMatch(/\bbg-accent-100\b/);
    expect(panelClass(render(true))).not.toMatch(/\bbg-white\b/);
    expect(panelClass(render(false))).toMatch(/\bbg-white\b/);
    expect(panelClass(render(false))).not.toMatch(/\bbg-accent/);
  });

  it("keeps the left bar's width in both states, so ticking moves nothing", () => {
    expect(panelClass(render(false))).toMatch(/\bborder-l-8\b/);
    expect(panelClass(render(true))).toMatch(/\bborder-l-8\b/);
  });

  it("locks every control while stories are starting", () => {
    const html = render(true, 5, true);

    expect(isDisabled(openingTag(html, "input", "id", "start-several-stories"))).toBe(true);
    expect(isDisabled(openingTag(html, "input", "id", "story-count"))).toBe(true);
    expect(isDisabled(fewer(html))).toBe(true);
    expect(isDisabled(more(html))).toBe(true);
  });
});

describe("MultiStoryStartField wording", () => {
  it("names no audience or group, ticked or not", () => {
    expect(accessibleText(render(false))).not.toMatch(AUDIENCE_WORDS);
    expect(accessibleText(render(true))).not.toMatch(AUDIENCE_WORDS);
  });
});
