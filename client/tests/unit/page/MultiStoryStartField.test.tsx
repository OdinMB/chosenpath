import {
  MultiStoryStartField,
  MultiStoryStartNote,
} from "../../../src/page/components/MultiStoryStartField";
import {
  formatRenewalTime,
  type StartsLeft,
} from "../../../src/page/utils/startsLeft";
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

function render(
  enabled: boolean,
  count = 4,
  disabled = false,
  startsLeft: StartsLeft | null = null
): string {
  return renderMarkup(
    <MultiStoryStartField
      enabled={enabled}
      count={count}
      onEnabledChange={jest.fn()}
      onCountChange={jest.fn()}
      disabled={disabled}
      startsLeft={startsLeft}
    />
  );
}

const RENEWS_AT = Date.UTC(2026, 9, 27, 13, 20);
// As accessibleText reads it: its no-break spaces as plain ones
const RENEWAL = formatRenewalTime(RENEWS_AT).replace(/\s/g, " ");
const startsLeft = (remaining: number, renewsAt: number | null = RENEWS_AT): StartsLeft => ({
  remaining,
  limit: 15,
  windowMs: 60 * 60 * 1000,
  renewsAt,
});

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

describe("MultiStoryStartField, the account's starts left", () => {
  const startsLeftLine = (html: string) =>
    accessibleText(/<p[^>]*id="starts-left"[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? "");

  it("says, before Start, how many more stories can start this hour and when that renews", () => {
    const html = render(true, 4, false, startsLeft(7));

    expect(startsLeftLine(html)).toBe(
      `You can start 7 more stories this hour, and up to 15 again from ${RENEWAL}.`
    );
    // Read out with the number of stories
    expect(attribute(openingTag(html, "input", "id", "story-count"), "aria-describedby")).toBe(
      "story-count-range starts-left"
    );
  });

  it("says nothing about it until the count is known", () => {
    const html = render(true, 4);

    expect(html).not.toContain('id="starts-left"');
    expect(attribute(openingTag(html, "input", "id", "story-count"), "aria-describedby")).toBe(
      "story-count-range"
    );
  });

  it("lets the number go no higher than can start", () => {
    const html = render(true, 7, false, startsLeft(7));

    expect(attribute(openingTag(html, "input", "id", "story-count"), "max")).toBe("7");
    expect(isUnavailable(more(html))).toBe(true);
    expect(accessibleText(html)).toContain("2 to 7 stories");
    expect(isUnavailable(more(render(true, 6, false, startsLeft(7))))).toBe(false);
  });

  it("counts a number above what can start as the most that can", () => {
    expect(accessibleText(render(true, 9, false, startsLeft(7)))).toContain(
      "7 stories at once"
    );
  });

  it("keeps 2 as the fewest to choose when fewer can start", () => {
    const html = render(true, 2, false, startsLeft(1));

    expect(attribute(openingTag(html, "input", "id", "story-count"), "max")).toBe("2");
    expect(isUnavailable(more(html))).toBe(true);
    expect(isUnavailable(fewer(html))).toBe(true);
    expect(accessibleText(html)).toContain("2 stories");
    expect(accessibleText(html)).not.toContain("2 to 2");
  });

  const heading = (html: string) =>
    accessibleText(/<h3[^>]*aria-live="polite"[^>]*>([\s\S]*?)<\/h3>/.exec(html)?.[1] ?? "");

  it("heads the panel with the number that will start, not the number chosen", () => {
    expect(heading(render(true, 2, false, startsLeft(1)))).toBe("You're starting 1 story");
    expect(heading(render(true, 2, false, startsLeft(0)))).toBe("No stories can start right now");
    expect(heading(render(true, 5, false, startsLeft(7)))).toBe("You're starting 5 stories at once");
  });

  it("leaves the cap at 12 while 12 or more can start", () => {
    const html = render(true, 12, false, startsLeft(15, null));

    expect(attribute(openingTag(html, "input", "id", "story-count"), "max")).toBe("12");
    expect(startsLeftLine(html)).toBe("You can start up to 15 stories this hour.");
  });
});

describe("MultiStoryStartNote, next to Start", () => {
  const note = (count: number, left: StartsLeft | null) =>
    renderMarkup(<MultiStoryStartNote count={count} startsLeft={left} />);

  it("says plainly when fewer can start than chosen, and when the rest can", () => {
    const html = note(8, startsLeft(7));

    expect(accessibleText(html)).toBe(`Only 7 can start now; the rest from ${RENEWAL}.`);
    // Announced as it appears, and the Start button points to it
    expect(attribute(openingTag(html, "div", "id", "several-stories-start-note"), "role")).toBe(
      "status"
    );
  });

  it("says when none can start", () => {
    expect(accessibleText(note(2, startsLeft(0)))).toBe(
      `No stories can start now; try again from ${RENEWAL}.`
    );
  });

  it("stays empty, though present to announce a change, while every chosen story can start", () => {
    for (const html of [note(7, startsLeft(7)), note(12, null), note(Number.NaN, startsLeft(2))]) {
      expect(openingTag(html, "div", "id", "several-stories-start-note")).not.toBe("");
      expect(accessibleText(html)).toBe("");
    }
  });
});

describe("MultiStoryStartField wording", () => {
  it("names no audience or group, ticked or not", () => {
    expect(accessibleText(render(false))).not.toMatch(AUDIENCE_WORDS);
    expect(accessibleText(render(true))).not.toMatch(AUDIENCE_WORDS);
    expect(accessibleText(render(true, 9, false, startsLeft(7)))).not.toMatch(AUDIENCE_WORDS);
    expect(
      accessibleText(renderMarkup(<MultiStoryStartNote count={9} startsLeft={startsLeft(7)} />))
    ).not.toMatch(AUDIENCE_WORDS);
  });
});
