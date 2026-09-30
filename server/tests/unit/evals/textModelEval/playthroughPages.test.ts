import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { indexPage, storyFileName, storyPage } from "../../../../src/evals/textModelEval/playthroughPages.js";
import { PLAYTHROUGHS, playStory, type PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
import { beatSet, SIX_PARAGRAPHS } from "../../../helpers/textFixtures.js";
import { DEFAULT, fakeCall, input } from "./playFixtures.js";

/*
 * Each played story as a page for the owner (offline HTML, one file per
 * story, and an index): the setup, then every turn in order with the choice
 * made, its mechanics and stat changes, chapter headers with their question
 * and result, and the ending.
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function played(options: { endingText?: string; turnLimit?: number } = {}): Promise<PlayRun> {
  const { call } = fakeCall(1, {
    reply: (role, nth) => (role === "beat" && nth === 10 && options.endingText ? beatSet(1, { player1: { ...beatSet(1).player1, text: options.endingText, title: "The End", options: [] } } as never) : DEFAULT),
  });
  const { run } = await playStory(PLAYTHROUGHS[0], input(1), call, { sample: 1, turnLimit: options.turnLimit });
  return run;
}

describe("storyPage", () => {
  it("shows the setup, every turn in order with its choice, mechanics and changes, the chapters and the ending", async () => {
    const run = await played();
    const html = storyPage(run);
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("<title>The Harbour</title>");
    // The setup: the character chosen, each outcome's question, the stats
    expect(html).toContain(run.start?.players.player1.name as string);
    expect(html).toContain("Question of player1_main?");
    expect(html).toContain("Courage");
    // Every turn, in order, with its kind
    const turns = [...html.matchAll(/id="turn-(\d+)"/g)].map((m) => Number(m[1]));
    expect(turns).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(html).toContain("chapter opening");
    // The chapters: title, question (its kind of milestone here), stage, length, and the result after the last step
    expect(html).toContain("Chapter 1");
    expect(html).toContain("The Ferry Chase");
    expect(html).toContain("who holds the ferry");
    expect(html).toContain("stage 1 of 2");
    expect(html).toMatch(/Chapter result/);
    // The choice made, with the policy's reason, and the option's mechanics
    expect(html).toMatch(/class="option chosen"/);
    expect(html).toContain("a sacrifice is offered");
    expect(html).toContain("base points");
    // What a turn changes, and the previous lever's payment
    expect(html).toContain("Previous choice sacrificed");
    // The ending, and each outcome as its milestones leave it
    expect(html).toContain('id="ending"');
    expect(html).toMatch(/player1_side[\s\S]*unfinished/);
    // The code's readings for the story
    expect(html).toContain("Ends on its turn count");
  });

  it("escapes the story's own words", async () => {
    const run = await played({ endingText: `${SIX_PARAGRAPHS}\n\nThe <script>alert(1)</script> gull & the "tide".` });
    const html = storyPage(run);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("says where a story stopped short of its ending", async () => {
    const run = await played({ turnLimit: 2 });
    const html = storyPage(run);
    expect(html).toContain("after turn 2 (the turns asked for)");
    expect(html).not.toContain('id="ending"');
  });
});

describe("indexPage and file names", () => {
  it("links each story's page with its main facts", async () => {
    const run = await played();
    expect(storyFileName(run)).toBe("play-lemonade.html");
    expect(storyFileName({ ...run, sample: 2 })).toBe("play-lemonade-s2.html");
    const html = indexPage([run], new Date("2026-09-30T12:00:00Z"));
    expect(html).toContain('href="play-lemonade.html"');
    expect(html).toContain("The Harbour");
    expect(html).toMatch(/10 turns/);
  });
});
