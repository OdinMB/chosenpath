import { afterEach, describe, expect, it } from "@jest/globals";
import { ENDING_TITLE } from "../../../../harness/lib/fake-story.mjs";
import { CHOICES_PER_TURN, beatOnScreen, endingProblems, playToEnd, type ScreenBeat } from "../../../../harness/steps/ending.mjs";

/*
 * The ending journey (harness/steps/ending.mjs) without a browser: reading
 * the beat on screen from a stand-in document, and "play to the end" on stub
 * pages (the choices it makes, the screenshots it names, when it takes a story
 * as ended, gives up or records a finding). A stub page's beat reads return
 * the next one scripted, and its locators record which choice is clicked.
 */

const turn = (n: number): ScreenBeat => ({
  beat: n,
  of: n,
  writing: false,
  title: `Placeholder player1 ${n}`,
  text: true,
  choices: ["a (placeholder)", "b (placeholder)", "c (placeholder)"],
});
const noChoices = (n: number, title = ENDING_TITLE): ScreenBeat => ({ ...turn(n), title, choices: [] });

/** A page whose beat reads come from `reads` in order (the last one repeats), and the choices clicked on it. */
function stubPage(reads: ScreenBeat[]) {
  let read = 0;
  let nth = -1;
  const clicks: number[] = [];
  const locator = {
    locator: () => locator,
    last: () => locator,
    first: () => locator,
    getByRole: () => locator,
    filter: () => locator,
    nth: (i: number) => {
      nth = i;
      return locator;
    },
    waitFor: async () => undefined,
    click: async () => {
      clicks.push(nth);
    },
  };
  const page = {
    locator: () => locator,
    evaluate: async () => reads[Math.min(read++, reads.length - 1)],
    waitForFunction: async () => undefined,
    waitForTimeout: async () => undefined,
  };
  return { page, clicks };
}

function recorder() {
  const shots: string[] = [];
  const findings: string[] = [];
  return { shots, findings, shot: async (name: string) => void shots.push(name), log: () => undefined, finding: (text: string) => void findings.push(text) };
}

describe("playing a story to its end", () => {
  it("takes a different option each turn, a screenshot before each, until a beat shows no choices", async () => {
    // Beat 1 on screen, then beats 2 and 3, then the ending (read twice: once more after the settle)
    const { page, clicks } = stubPage([turn(1), turn(2), turn(3), noChoices(4), noChoices(4)]);
    const { shots, findings, shot, log, finding } = recorder();
    const played = await playToEnd({ pages: [page], shot, log, finding, maxChoices: 7 });
    expect(played).toMatchObject({ choices: 3, beat: 4 });
    expect(played.endings.map((e) => e.title)).toEqual([ENDING_TITLE]);
    expect(clicks).toEqual([0, 1, 2]);
    expect(shots).toEqual(["turn-1", "turn-2", "turn-3"]);
    expect(findings).toEqual([]);
  });

  it("goes on where a new beat's choices come a render after its text", async () => {
    const { page, clicks } = stubPage([turn(1), noChoices(2), turn(2), noChoices(3), noChoices(3)]);
    const { shot, log } = recorder();
    await expect(playToEnd({ pages: [page], shot, log, maxChoices: 7 })).resolves.toMatchObject({ choices: 2, beat: 3 });
    expect(clicks).toEqual([0, 1]);
  });

  it("plays every seat of a group each turn, naming each seat's screenshots", async () => {
    const seats = [stubPage([turn(1), turn(2), noChoices(3)]), stubPage([turn(1), turn(2), noChoices(3)])];
    const { shots, shot, log } = recorder();
    const played = await playToEnd({ pages: seats.map((s) => s.page), shot, log, maxChoices: 5 });
    expect(played).toMatchObject({ choices: 2, beat: 3 });
    expect(played.endings).toHaveLength(2);
    expect(shots).toEqual(["seat-1-turn-1", "seat-2-turn-1", "seat-1-turn-2", "seat-2-turn-2"]);
    for (const seat of seats) expect(seat.clicks).toEqual([0, 1]);
  });

  it("chooses as `choose` says", async () => {
    const { page, clicks } = stubPage([turn(1), turn(2), noChoices(3)]);
    const { shot, log } = recorder();
    await playToEnd({ pages: [page], shot, log, maxChoices: 5, choose: (_turn, count) => count - 1 });
    expect(clicks).toEqual([2, 2]);
  });

  it("records a finding for a turn that offers another number of choices than the beat schema asks for", async () => {
    const two = { ...turn(2), choices: ["a (placeholder)", "b (placeholder)"] };
    const { page } = stubPage([turn(1), two, noChoices(3)]);
    const { findings, shot, log, finding } = recorder();
    await playToEnd({ pages: [page], shot, log, finding, maxChoices: 5 });
    expect(CHOICES_PER_TURN).toBe(3);
    expect(findings).toEqual(["turn 2 (beat 2) offers 2 choices, not 3"]);
  });

  it("gives up when the story doesn't end within the choices it allows", async () => {
    const { page } = stubPage([turn(1), turn(2), turn(3), turn(4)]);
    const { shot, log } = recorder();
    await expect(playToEnd({ pages: [page], shot, log, maxChoices: 3 })).rejects.toThrow("the story did not end within 3 choices");
  });

  it("fails when some seats reach the ending and others go on", async () => {
    const seats = [stubPage([turn(1), noChoices(2)]), stubPage([turn(1), turn(2)])];
    const { shot, log } = recorder();
    await expect(playToEnd({ pages: seats.map((s) => s.page), shot, log, maxChoices: 5 })).rejects.toThrow("after 1 choices 1 of 2 seats show a beat with no choices");
  });
});

describe("what the ending journey reports", () => {
  it("nothing for a story that ends on the beat after its last turn, titled as the fake model titles it", () => {
    expect(endingProblems({ played: { choices: 3, beat: 4, endings: [noChoices(4)] }, maxTurns: 3 })).toEqual([]);
  });

  it("an ending after another number of choices than the World has turns, on another beat, or under another title", () => {
    expect(endingProblems({ played: { choices: 5, beat: 6, endings: [noChoices(6)] }, maxTurns: 3 })).toEqual([
      "the story ended after 5 choices; the World has 3 turns",
      "the ending is beat 6, not 4, the beat after the World's last turn",
    ]);
    expect(endingProblems({ played: { choices: 3, beat: 4, endings: [noChoices(4, "Placeholder player1 7018")] }, maxTurns: 3 })).toEqual([
      `the ending's title reads "Placeholder player1 7018", not "${ENDING_TITLE}"`,
    ]);
  });
});

/** A stand-in for the elements beatOnScreen reads: text, tag, siblings, buttons. */
type FakeElement = { tagName?: string; textContent?: string; disabled?: boolean; previousElementSibling?: FakeElement; nextElementSibling?: FakeElement; buttons?: FakeElement[] };

const page = globalThis as unknown as { document?: unknown };
afterEach(() => {
  delete page.document;
});

/** Puts a beat on the stand-in document: the counter, the title heading, the narrative, and blocks of buttons after it. */
function showBeat({ counter, title, narrative, blocks }: { counter: string; title: string; narrative: string; blocks: FakeElement[][] }) {
  const after: FakeElement[] = blocks.map((buttons) => ({ buttons }));
  after.forEach((block, i) => (block.nextElementSibling = after[i + 1]));
  for (const block of after) Object.assign(block, { querySelectorAll: () => block.buttons ?? [] });
  const text: FakeElement = { textContent: narrative, previousElementSibling: { tagName: "H2", textContent: title }, nextElementSibling: after[0] };
  page.document = {
    querySelectorAll: (selector: string) =>
      selector === "span" ? [{ textContent: "Previous" }, { textContent: `\n  ${counter}  ` }] : selector.startsWith(".narrative-container") ? [{ textContent: "an older beat" }, text] : [],
  };
}

describe("reading the beat on screen", () => {
  it("reads the counter, the title, the fake model's text and the enabled choices after it", () => {
    showBeat({
      counter: "Beat 3 of 3",
      title: "Placeholder player1 6017",
      narrative: "This placeholder scene comes from the fake.",
      blocks: [[{ textContent: "Thumbs up" }], [{ textContent: "One (placeholder text 1)" }, { textContent: "Two (placeholder text 2)", disabled: true }, { textContent: "Three (placeholder text 3)" }]],
    });
    expect(beatOnScreen("placeholder scene")).toEqual({
      beat: 3,
      of: 3,
      writing: false,
      title: "Placeholder player1 6017",
      text: true,
      choices: ["One (placeholder text 1)", "Three (placeholder text 3)"],
    });
  });

  it("tells a beat still being written, and an ending with no choices", () => {
    showBeat({ counter: "Beat 4 of 4 (Next)", title: ENDING_TITLE, narrative: "This placeholder scene ends.", blocks: [] });
    expect(beatOnScreen("placeholder scene")).toMatchObject({ beat: 4, of: 4, writing: true, title: ENDING_TITLE, choices: [] });
  });
});
