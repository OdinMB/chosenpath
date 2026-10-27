import { TRAINED_ALGORITHMIC_MEDIA, type OutcomeAtEnd } from "core/types";
import { StoryOutcomes } from "../../../../src/game/components/StoryOutcomes";
import { accessibleText, attribute, openingTag, renderMarkup } from "../../../helpers/staticMarkup";

const outcome = (overrides: Partial<OutcomeAtEnd> = {}): OutcomeAtEnd => ({
  id: "shared_harbour",
  owner: "shared",
  question: "Does the harbour reopen before winter?",
  milestones: [],
  intended: 2,
  complete: false,
  ...overrides,
});

/** A shared question the story resolved, and the player's own, which it left at one milestone of three. */
const HARBOUR = outcome({ milestones: ["The storm wall holds.", "The fleet sails home."], complete: true });
const NAME = outcome({
  id: "player1_name",
  owner: "player1",
  question: "Does the keeper clear the family name?",
  milestones: ["The ledger is found."],
  intended: 3,
});

const render = (outcomes: OutcomeAtEnd[] | undefined) => renderMarkup(<StoryOutcomes outcomes={outcomes} />);

/**
 * What a screen reader reads: accessibleText puts a space at every tag, but
 * inline spans join without one, so punctuation in a span of its own (the
 * visually hidden ": ") sits against the word before it.
 */
function spoken(html: string): string {
  return accessibleText(html).replace(/\s+([.:])/g, "$1");
}

/** The markup of every element with this tag, its own tag included (none nested in another of the same tag). */
function elements(html: string, tag: string): string[] {
  return html.match(new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>`, "g")) ?? [];
}

/** The opening tag of the first progress bar. */
function progressBar(html: string): string {
  return openingTag(html, "div", "role", "progressbar");
}

/** What each element marked as AI-generated says, in order. */
function aiMarked(html: string): string[] {
  const pattern = /<(\w+)(\s[^>]*data-ai-generated="true"[^>]*)>([\s\S]*?)<\/\1>/g;
  return [...html.matchAll(pattern)].map(([, , , inner = ""]) => spoken(inner));
}

describe("StoryOutcomes", () => {
  it("shows nothing when the state says nothing of the outcomes, or names none", () => {
    expect(render(undefined)).toBe("");
    expect(render([])).toBe("");
  });

  it("heads the section 'Where the story's questions landed' for screen readers' heading navigation, naming the section by it", () => {
    const html = render([HARBOUR]);

    expect(openingTag(html, "section", "aria-labelledby", "story-outcomes-title")).not.toBe("");
    const heading = elements(html, "h2")[0] ?? "";
    expect(attribute(openingTag(heading, "h2", "id", "story-outcomes-title"), "id")).toBe("story-outcomes-title");
    expect(spoken(heading)).toBe("Where the story's questions landed");
  });

  it("gives each question a card in a list, as the state orders them, headed by whose it is and the question", () => {
    const html = render([HARBOUR, NAME]);

    expect(openingTag(html, "ul", "role", "list")).not.toBe("");
    expect(elements(html, "h3").map(spoken)).toEqual([
      "Shared: Does the harbour reopen before winter?",
      "Yours: Does the keeper clear the family name?",
    ]);
  });

  it("shows how many of its milestones a question reached as a progress bar with that value for screen readers, and as text", () => {
    const html = render([NAME]);
    const bar = progressBar(html);

    expect(attribute(bar, "aria-label")).toBe("Milestones reached");
    expect(attribute(bar, "aria-valuemin")).toBe("0");
    expect(attribute(bar, "aria-valuemax")).toBe("3");
    expect(attribute(bar, "aria-valuenow")).toBe("1");
    expect(attribute(bar, "aria-valuetext")).toBe("1 of 3 milestones");
    // Seen once, heard once: the text beside the bar is hidden from screen readers, which hear the bar's value
    expect(html).toMatch(/<span aria-hidden="true"[^>]*>1 of 3 milestones<\/span>/);
  });

  it("counts a question that needed a single milestone in the singular, seen and heard", () => {
    const html = render([outcome({ intended: 1, milestones: ["The bell rings."], complete: true })]);

    expect(attribute(progressBar(html), "aria-valuetext")).toBe("1 of 1 milestone");
    expect(html).toMatch(/<span aria-hidden="true"[^>]*>1 of 1 milestone<\/span>/);
  });

  it("lists the milestones a question reached, in order, as an ordered list", () => {
    const html = render([HARBOUR]);

    const [list = ""] = elements(html, "ol");
    expect(elements(list, "li").map(spoken)).toEqual(["The storm wall holds.", "The fleet sails home."]);
  });

  it("says in words whether each question was resolved or left open, in the same plain look either way (no check, no success colour)", () => {
    const resolved = render([HARBOUR]);
    const open = render([NAME]);
    /** The class of the status line that says this. */
    const statusClass = (html: string, words: string) =>
      new RegExp(`<p class="([^"]*)">${words}</p>`).exec(html)?.[1];
    /** The classes of the card, the bar's filled segments and the status line, which say nothing of how it ended. */
    const looks = (html: string) => [
      html.match(/<li class="flex"><div class="([^"]*)"/)?.[1],
      html.match(/<span class="h-2 flex-1 rounded-full (bg-[\w-]+)"/)?.[1],
    ];

    expect(spoken(resolved)).toContain(
      "Shared: Does the harbour reopen before winter? Resolved The storm wall holds. The fleet sails home."
    );
    expect(spoken(open)).toContain("Yours: Does the keeper clear the family name? Left open The ledger is found.");
    expect(resolved).not.toMatch(/<svg/);
    expect(resolved).not.toMatch(/accent/);
    expect(statusClass(resolved, "Resolved")).toBe(statusClass(open, "Left open"));
    expect(looks(resolved)).toEqual(looks(open));
  });

  it("says so when a question reached no milestone, with an empty bar", () => {
    const html = render([outcome({ intended: 1 })]);

    expect(spoken(html)).toContain("Shared: Does the harbour reopen before winter? Left open No milestones reached.");
    expect(html).not.toMatch(/<ol[\s>]/);
    expect(attribute(progressBar(html), "aria-valuetext")).toBe("0 of 1 milestone");
  });

  it("fills the bar at its intended number when a question went past it, and lists every milestone", () => {
    const beyond = outcome({ intended: 2, complete: true, milestones: ["One.", "Two.", "And after."] });
    const html = render([beyond]);
    const bar = progressBar(html);

    expect(attribute(bar, "aria-valuenow")).toBe("2");
    expect(attribute(bar, "aria-valuetext")).toBe("2 of 2 milestones");
    expect(elements(elements(html, "ol")[0] ?? "", "li").map(spoken)).toEqual(["One.", "Two.", "And after."]);
  });

  it("marks the questions and milestones as AI-generated, as the beat text is, and nothing the game writes itself", () => {
    const html = render([HARBOUR, NAME]);

    expect(aiMarked(html)).toEqual([
      "Does the harbour reopen before winter?",
      "The storm wall holds. The fleet sails home.",
      "Does the keeper clear the family name?",
      "The ledger is found.",
    ]);
    const marked = [...html.matchAll(/<\w+\s[^>]*data-ai-generated="true"[^>]*>/g)].map(([tag]) => tag);
    for (const tag of marked) {
      expect(attribute(tag, "data-digital-source-type")).toBe(TRAINED_ALGORITHMIC_MEDIA);
    }
  });

  describe("reflection questions", () => {
    const REFLECT = ["Who paid for the storm wall?", "Would you have sailed home?"];
    /** Each card's markup, from its heading to the next card's. */
    const cards = (html: string) => html.split("<h3").slice(1);

    it("lists a question's reflection questions under its card, after its milestones, under a heading of their own", () => {
      const html = render([outcome({ ...HARBOUR, reflectionQuestions: REFLECT }), NAME]);
      const [harbour = "", name = ""] = cards(html);

      expect(elements(harbour, "h4").map(spoken)).toEqual(["Questions to reflect on"]);
      const [list = ""] = elements(harbour, "ul");
      expect(elements(list, "li").map(spoken)).toEqual(REFLECT);
      expect(spoken(harbour)).toMatch(/The fleet sails home\. Questions to reflect on Who paid for the storm wall\?/);
      expect(name).not.toContain("Questions to reflect on");
    });

    it("shows nothing more on a card without reflection questions", () => {
      const html = render([HARBOUR, outcome({ ...NAME, reflectionQuestions: [] })]);

      expect(html).not.toContain("reflect");
      expect(elements(html, "h4")).toEqual([]);
    });

    it("marks no reflection question as AI-generated: people write them", () => {
      const html = render([outcome({ ...HARBOUR, reflectionQuestions: REFLECT })]);

      for (const marked of aiMarked(html)) {
        for (const question of REFLECT) expect(marked).not.toContain(question);
      }
      expect(aiMarked(html)).toEqual(["Does the harbour reopen before winter?", "The storm wall holds. The fleet sails home."]);
    });
  });
});
