import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { indexPage, storyFileName, storyPage } from "../../../../src/evals/textModelEval/playthroughPages.js";
import { PLAYTHROUGHS, playStory, type PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
import { beatSet, SIX_PARAGRAPHS, threadAnalysis } from "../../../helpers/textFixtures.js";
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
    // The ending, shown as the game shows it (no options), and each outcome as its milestones leave it
    expect(html).toContain('id="ending"');
    const endingTurn = html.slice(html.indexOf('id="turn-11"'), html.indexOf("</article>", html.indexOf('id="turn-11"')));
    expect(endingTurn).not.toContain('class="options"');
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

describe("storyPage: what a group's choices did", () => {
  // player2's own outcome in the second chapter, both players in it; a switch before it where player2 picks that outcome
  async function group(): Promise<PlayRun> {
    const { call } = fakeCall(2, {
      reply: (role, nth) => {
        if (role !== "thread" || nth !== 1) return DEFAULT;
        const plan = threadAnalysis("exploration", 4, 0, ["player1", "player2"]);
        return { ...plan, threads: [{ ...plan.threads[0], outcomeId: "player2_main", title: "Luz's Promise" }] };
      },
    });
    const { run } = await playStory(PLAYTHROUGHS[2], input(2), call, { sample: 1 });
    return run;
  }

  it("shows, beside a group step's choice, the result the game used for the thread, and flags the owner's choice overridden", async () => {
    const run = await group();
    const html = storyPage(run);
    expect(html).toContain("The step's result for everyone in the thread");
    expect(html).not.toContain("another player's choice decided this step");
    // As production played it before 2026-09-30: player1's choice decided player2's outcome
    const old = structuredClone(run);
    const phase = old.end?.storyPhases.find((p) => "threads" in p && p.firstBeatIndex === 6);
    if (!phase || !("threads" in phase)) throw new Error("no second chapter");
    phase.threads[0].progression[0].resolution = run.turns.find((t) => t.turn === 7)?.picks[0].resolution as never;
    expect(storyPage(old)).toContain("another player's choice decided this step, on this player's own outcome");
  });

  it("says where the planner was told another count of the threads that fit than the turns left give", async () => {
    const run = await played();
    const told = structuredClone(run);
    const plan = told.turns.find((t) => t.turn === 6)?.plan;
    if (!plan) throw new Error("no switch plan at turn 6");
    plan.pacing.threadsFit = 0;
    expect(storyPage(told)).toContain("1 more chapter fits (production told the planner 0)");
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
