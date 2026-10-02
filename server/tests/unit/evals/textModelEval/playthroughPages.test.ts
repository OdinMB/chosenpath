import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { indexPage, storyFileName, storyPage } from "../../../../src/evals/textModelEval/playthroughPages.js";
import { PLAYTHROUGHS, PLAYTHROUGHS_2, PLAYTHROUGHS_3, PLAYTHROUGHS_4, playStory, type PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
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
    // The side outcome's chapter came last (production's paced lengths leave a thread for it): complete, as the main one
    expect(html).toMatch(/<code class="muted">player1_side<\/code><\/td><td>[^<]*<\/td><td>1 of 1<\/td><td>complete<\/td>/);
    expect(html).toMatch(/<code class="muted">player1_main<\/code><\/td><td>[^<]*<\/td><td>2 of 2<\/td><td>complete<\/td>/);
    // The code's readings for the story
    expect(html).toContain("Ends on its turn count");
  });

  // The review of the third round (2026-10-01): the pages printed the older allowed lengths where the .md printed the paced
  // ones production's PACING showed (New Avalon chapter 5: "allowed: 2, 3, 4" against "3 (3, 4)")
  it("prints each chapter's lengths as its PACING printed them: the paced ones where the run recorded them", async () => {
    const run = structuredClone(await played());
    const opening = run.turns.find((t) => t.plan?.kind === "chapter plan");
    if (!opening?.plan) throw new Error("no chapter plan");
    opening.plan.pacing = { ...opening.plan.pacing, allowedLengths: [2, 3, 4], pacedLengths: [3, 4] };
    expect(storyPage(run)).toContain(`Chapter 1 · turns ${opening.turn}-`);
    expect(storyPage(run)).toMatch(/Chapter 1 · turns \d+-\d+ · \d+ turns \(allowed: 3, 4\)/);
    const older = structuredClone(run);
    const plan = older.turns.find((t) => t.turn === opening.turn)?.plan;
    if (plan) delete plan.pacing.pacedLengths;
    expect(storyPage(older)).toMatch(/Chapter 1 · turns \d+-\d+ · \d+ turns \(allowed: 2, 3, 4\)/);
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
  // player2's own outcome in the second chapter (turns 6-7, the two beats the paced lengths allow there), both players in
  // it; a switch before it where player2 picks that outcome
  async function group(): Promise<PlayRun> {
    const { call } = fakeCall(2, {
      reply: (role, nth) => {
        if (role !== "thread" || nth !== 1) return DEFAULT;
        const plan = threadAnalysis("exploration", 2, 0, ["player1", "player2"]);
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
    const phase = old.end?.storyPhases.find((p) => "threads" in p && p.firstBeatIndex === 5);
    if (!phase || !("threads" in phase)) throw new Error("no second chapter");
    phase.threads[0].progression[0].resolution = run.turns.find((t) => t.turn === 6)?.picks[0].resolution as never;
    expect(storyPage(old)).toContain("another player's choice decided this step, on this player's own outcome");
  });

  it("says where the planner was told another count of the threads that fit than the turns left give", async () => {
    const run = await played();
    const told = structuredClone(run);
    // The switch at turn 8 of 10 (3 turns left): one more chapter fits, where turns left ÷ 4 alone said 0
    const plan = told.turns.find((t) => t.turn === 8)?.plan;
    if (!plan) throw new Error("no switch plan at turn 8");
    plan.pacing.threadsFit = 0;
    expect(storyPage(told)).toContain("1 more chapter fits (production told the planner 0)");
  });
});

describe("storyPage: round 2 (production's resend, the judged options and results)", () => {
  it("says where production sent a failed turn again, and where the players saw the notice and pressed Try again", async () => {
    const unusable = () => {
      const plan = threadAnalysis("challenge", 4, 0, ["player1"]);
      return { ...plan, threads: [{ ...plan.threads[0], outcomeId: "no_such_outcome" }] };
    };
    const { call } = fakeCall(1, { reply: (role, nth) => (role === "thread" && (nth <= 1 || (nth >= 3 && nth <= 6)) ? unusable() : DEFAULT) });
    const { run } = await playStory(PLAYTHROUGHS_2[0], input(1), call, { sample: 1, tryAgain: 1 });
    const html = storyPage({ ...run, round: 2 });
    // The line goes through the page's escaping (the failure's own words may hold quotes)
    expect(html).toContain("Production&#39;s turn failed (the first send: Failed to generate a usable thread plan");
    expect(html).toContain("the queue sent it once more, and that worked");
    expect(html).toContain("The players saw “Unable to continue the story. Please try again.” and pressed Try again");
    // Round 2 points at its own report
    expect(html).toContain("2026-09-30_playthroughs-2-report.md");
    expect(storyPage(run)).toContain("2026-09-30_playthroughs-report.md");
  });

  it("shows the judged options check under a turn and the judged results check on a chapter", async () => {
    const run = structuredClone(await played());
    run.judged = [
      { key: "play-lemonade-s1-t4-player1", kind: "options", turn: 4, label: "player1", verdict: false, evidence: "Option 2 asks instead.", lines: ["option 2 → none (asks)"], costUsd: 0 },
      { key: "play-lemonade-s1-t2", kind: "results", turn: 2, label: "player1_main", verdict: true, evidence: "Each result is an outcome.", lines: [], costUsd: 0 },
    ];
    const html = storyPage(run);
    const turn4 = html.slice(html.indexOf('id="turn-4"'), html.indexOf("</article>", html.indexOf('id="turn-4"')));
    expect(turn4).toContain("Judged: the options don't each carry out the result at their position (Option 2 asks instead.)");
    expect(html).toContain("Judged, the results fit the chapter's kind: yes (Each result is an outcome.)");
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

  it("titles round 2's index by its round and story count, and links round 1's pages and round 2's report", async () => {
    const run = { ...(await played()), round: 2 };
    const html = indexPage([run, { ...run, sample: 2 }], new Date("2026-09-30T20:00:00Z"), 2);
    expect(html).toContain("<h1>Round 2: two stories on production's current code</h1>");
    expect(html).toContain('href="../index.html"');
    expect(html).toContain("2026-09-30_playthroughs-2-report.md");
    expect(indexPage([run], new Date(0))).toContain("<h1>One story on production's own code</h1>");
  });

  it("titles round 3's index by its round, links both earlier rounds' pages and names round 3's report", async () => {
    const run = { ...(await played()), round: 3 };
    const html = indexPage([run], new Date("2026-10-01T20:00:00Z"), 3);
    expect(html).toContain("<h1>Round 3: one story on production's current code</h1>");
    expect(html).toContain('href="../index.html"');
    expect(html).toContain('href="../round2/index.html"');
    expect(html).toContain("2026-10-01_playthroughs-3-report.md");
    expect(storyPage(run)).toContain("2026-10-01_playthroughs-3-report.md");
  });
});

describe("round 4's pages (the places check on group turns, money and counted stats)", () => {
  it("titles round 4's index by its round, links the three earlier rounds' pages and names round 4's report", async () => {
    const run = { ...(await played()), round: 4 };
    const html = indexPage([run], new Date("2026-10-02T12:00:00Z"), 4);
    expect(html).toContain("<h1>Round 4: one story on production's current code</h1>");
    expect(html).toContain('href="../index.html"');
    expect(html).toContain('href="../round2/index.html"');
    expect(html).toContain('href="../round3/index.html"');
    expect(html).toContain("2026-10-02_playthroughs-4-report.md");
    expect(storyPage(run)).toContain("2026-10-02_playthroughs-4-report.md");
  });

  it("shows the judged places check under a group turn, flagged where it fails, and lists it and the counted stats among the readings", async () => {
    const { run: group } = await playStory(PLAYTHROUGHS_4[2], input(2), fakeCall(2).call, { sample: 1 });
    const run = structuredClone(group);
    run.judged = [
      { key: "play-food-trucks-s1-t3", kind: "places", turn: 3, label: "places", verdict: false, evidence: "Omar is at the yard and at the showcase.", lines: ["Omar (two places): yard; showcase"], costUsd: 0 },
      { key: "play-food-trucks-s1-t4", kind: "places", turn: 4, label: "places", verdict: true, evidence: "Everyone is in one place.", lines: [], costUsd: 0 },
    ];
    const html = storyPage(run);
    const turn3 = html.slice(html.indexOf('id="turn-3"'), html.indexOf("</article>", html.indexOf('id="turn-3"')));
    expect(turn3).toContain('<p class="flag">Judged: someone or something is in two places across the players&#39; texts (Omar is at the yard and at the showcase.)');
    expect(turn3).toContain("Omar (two places): yard; showcase");
    const turn4 = html.slice(html.indexOf('id="turn-4"'), html.indexOf("</article>", html.indexOf('id="turn-4"')));
    expect(turn4).toContain('<p class="muted">Judged: everyone and everything is in one place across the players&#39; texts (Everyone is in one place.)');
    expect(html).toContain("Group chapter turns whose people and places add up across the players&#39; texts (judged, placesConsistent v2): 1 of 2");
    expect(html).toContain("Money and counted stats");
  });
});

describe("storyPage: round 3's readings (a child's age band, the owner's roll, the pacing)", () => {
  it("shows, under each turn of a story read with a child, how it reads against the band's limits", async () => {
    const { call } = fakeCall(1);
    const { run } = await playStory(PLAYTHROUGHS_3[5], { ...input(1), kids: true, kidAges: { min: 5, max: 5 } }, call, { sample: 1 });
    const html = storyPage({ ...run, round: 3 });
    const turn1 = html.slice(html.indexOf('id="turn-1"'), html.indexOf("</article>", html.indexOf('id="turn-1"')));
    expect(turn1).toMatch(/For a child aged 5 \(the 3-5 band\): \d+ words, \d+\.\d words a sentence, grade -?\d+\.\d: (within|outside) the band&#39;s limits/);
    expect(html).toContain("Read with a child aged 5 (the 3-5 band)");
    // Not on a grown-up story
    expect(storyPage(await played())).not.toContain("For a child aged");
  });

  it("flags a group step on a player's own outcome that went another way than the owner's roll, and lists the pacing among the readings", async () => {
    const { call } = fakeCall(2, {
      reply: (role, nth) => {
        if (role !== "thread" || nth !== 1) return DEFAULT;
        const plan = threadAnalysis("challenge", 2, 0, ["player1", "player2"]);
        return { ...plan, threads: [{ ...plan.threads[0], outcomeId: "player2_main", title: "Luz's Trial" }] };
      },
    });
    const { run } = await playStory(PLAYTHROUGHS[2], input(2), call, { sample: 1 });
    const html = storyPage(run);
    expect(html).toContain("the owner&#39;s roll decided 2 of 2");
    expect(html).not.toContain("went another way than the owner");
    expect(html).toContain("Pacing: the last chapter keeps a milestone to settle");
    // As production pooled the rolls before 2026-10-01
    const pooled = structuredClone(run);
    const phase = pooled.end?.storyPhases.find((p) => "threads" in p && p.firstBeatIndex === 5);
    if (!phase || !("threads" in phase)) throw new Error("no second chapter");
    const own = run.turns.find((t) => t.turn === 6)?.picks.find((p) => p.slot === "player2")?.resolution;
    phase.threads[0].progression[0].resolution = (own === "mixed" ? "favorable" : "mixed") as never;
    expect(storyPage(pooled)).toContain("The step went another way than the owner&#39;s own roll, on the owner&#39;s own outcome.");
  });
});
