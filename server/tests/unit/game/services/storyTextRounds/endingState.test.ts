import { describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import type { Story } from "core/models/Story.js";
import { GameModes, type GameMode } from "core/types/index.js";
import {
  ENDING_STATE_TEXT,
  endingStateRequest,
  outcomeStateLines,
  outcomeStatesAtEnding,
  productionEndingForm,
  scoreboardEnding,
} from "../../../../../src/game/services/storyTextRounds/endingState.js";
import { round0BeatStep } from "../../../../../src/game/services/storyTextRound0/round0Steps.js";
import { beatStep } from "../../../../../src/game/services/storyTextSteps.js";
import { evalFiles } from "../../../../../src/evals/textModelEval/evalFiles.js";
import { caseStory } from "../../../../../src/evals/textModelEval/cases.js";
import { callLimitsOf, requestFor, requestText } from "../../../../../src/evals/textModelEval/variants.js";
import { endedChapter, outcome, roundStory, topicSwitch } from "../../../../helpers/roundStories.js";
import { stat } from "../../../../helpers/textFixtures.js";

/*
 * The ending told as its milestones leave it (the owner's decision of
 * 2026-09-30: "Unfinished outcomes should be narrated in their current state,
 * even if that state is inconclusive"), eval only: production's ending (today's
 * form, with the scoreboard rule on a scored contest's ending) with its
 * outcome lines replaced. Each outcome is told as its milestones leave it,
 * counting the milestones this beat adds: a complete one resolved as its
 * milestones point, an unfinished one in its current state and never beyond
 * its milestones; the game states which is which, per outcome. A contest's
 * rule gains its unfinished half: nobody has won, the side ahead is told as
 * ahead. Everything else is production's request, byte for byte.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const json = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(toJsonSchema(schema));
const occurrences = (text: string, passage: string) => text.split(passage).length - 1;

const RING = "player1_expose_ring";
const IDENTITY = "player1_identity";
const COUNCIL = "player1_council";

/** A single player's ending after two chapters on the ring (recorded before this beat: 1), the chapter just ended on it. */
function onePlayerEnding(ringIntended = 2): Story {
  return roundStory({
    turns: 7,
    maxTurns: 7,
    playerOutcomes: {
      player1: [
        outcome(RING, { intendedNumberOfMilestones: ringIntended, milestones: ["Arielle finds the ledger"] }),
        outcome(IDENTITY, { intendedNumberOfMilestones: 2, possibleResolutions: { resolution1: "Belongs", resolution2: "Outsider with a path", resolution3: "Isolated" } }),
        outcome(COUNCIL, { intendedNumberOfMilestones: 1 }),
      ],
    },
    phases: [topicSwitch([["Dig", RING]], 0), endedChapter(RING, 2, 1, "The ledger"), topicSwitch([["Dig", RING]], 3), endedChapter(RING, 3, 4, "The exposé")],
  });
}

/** The contest's scoreboard, a shared opposites stat, as a contest setup writes it. */
const SCOREBOARD = stat("shared_voice_score", { name: "Enclave's Voice|Printers' Voice", type: "opposites", initialValue: 50 });

/** A contest's ending: the contest at `recorded` of `intended` before this beat, the chapter just ended on it. */
function contestEnding(players: number, { mode = GameModes.Competitive, intended = 2, recorded = 1, scoreboard = true }: { mode?: GameMode; intended?: number; recorded?: number; scoreboard?: boolean } = {}): Story {
  const slots = Array.from({ length: players }, (_, i) => `player${i + 1}`);
  const story = roundStory({
    players,
    turns: 6,
    maxTurns: 6,
    gameMode: mode,
    sharedOutcomes: [
      outcome("shared_voice", {
        intendedNumberOfMilestones: intended,
        milestones: Array.from({ length: recorded }, (_, i) => `The council hears side ${i % 2 ? "B" : "A"}`),
        possibleResolutions: { sideAWins: "The enclave speaks", mixed: "They share the seat", sideBWins: "The printers speak" },
        resonance: "Who speaks for the goblins. Scored by Enclave's Voice|Printers' Voice.",
      }),
    ],
    playerOutcomes: Object.fromEntries(slots.map((slot) => [slot, [outcome(`${slot}_pride`)]])),
    phases: [
      topicSwitch([["Speak", "shared_voice"]], 0, slots),
      endedChapter("shared_voice", 2, 1, "The council hears the enclave", slots),
      topicSwitch([["Speak", "shared_voice"]], 3, slots),
      endedChapter("shared_voice", 2, 4, "The printers win the vote", slots),
    ],
  });
  return scoreboard ? story.clone({ sharedStats: [SCOREBOARD], sharedStatValues: [{ statId: SCOREBOARD.id, value: 40 }] }) : story;
}

/** Production's block the variant replaces, as it reads in the base (the measured scoreboard rule where it applies). */
function baseBlock(story: Story): string {
  return `${ENDING_STATE_TEXT.sharedOutcomesLine}${scoreboardEnding(story) ? ENDING_STATE_TEXT.measuredScoreboardRule : ""}`;
}

describe("the base: production's ending as measured", () => {
  it.each([
    ["one player", () => onePlayerEnding()],
    ["two players, a scored contest", () => contestEnding(2)],
    ["three players (two camps), a scored contest", () => contestEnding(3, { mode: GameModes.CooperativeCompetitive })],
    ["two players, a contest without a scoreboard", () => contestEnding(2, { scoreboard: false })],
    ["two players, cooperative", () => contestEnding(2, { mode: GameModes.Cooperative })],
  ] as const)("%s: today's form, with the measured scoreboard rule only on a scored contest's ending", (_, build) => {
    const story = build();
    expect(story.getCurrentBeatType()).toBe("ending");
    const today = round0BeatStep.request(story);
    const base = productionEndingForm(story);
    expect(occurrences(today.prompt, ENDING_STATE_TEXT.sharedOutcomesLine)).toBe(1);
    expect(base.prompt).toBe(today.prompt.replace(ENDING_STATE_TEXT.sharedOutcomesLine, baseBlock(story)));
    expect(json(base.schema)).toBe(json(today.schema));
  });

  it.each([
    ["one player", () => onePlayerEnding()],
    ["two players, a scored contest", () => contestEnding(2)],
    ["three players (two camps), a scored contest", () => contestEnding(3, { mode: GameModes.CooperativeCompetitive })],
  ] as const)("%s: production's ending byte for byte, prompt and schema", (_, build) => {
    const story = build();
    const production = beatStep.request(story);
    const base = productionEndingForm(story);
    expect(base.prompt).toBe(production.prompt);
    expect(json(base.schema)).toBe(json(production.schema));
  });

  it("takes the scoreboard rule where production does: a contest mode, a contested shared outcome and a shared opposites stat", () => {
    expect(scoreboardEnding(contestEnding(2))).toBe(true);
    expect(scoreboardEnding(contestEnding(3, { mode: GameModes.CooperativeCompetitive }))).toBe(true);
    expect(scoreboardEnding(contestEnding(2, { scoreboard: false }))).toBe(false);
    expect(scoreboardEnding(contestEnding(2, { mode: GameModes.Cooperative }))).toBe(false);
    expect(scoreboardEnding(onePlayerEnding())).toBe(false);
    expect(scoreboardEnding(contestEnding(2).clone({ maxTurns: 20 }))).toBe(false);
  });

  it("builds endings only", () => {
    const before = onePlayerEnding().clone({ maxTurns: 20 });
    expect(before.getCurrentBeatType()).not.toBe("ending");
    expect(() => productionEndingForm(before)).toThrow(/ending/);
    expect(() => endingStateRequest(before)).toThrow(/ending/);
  });
});

describe("where each outcome stands after this beat", () => {
  it("counts the milestone the chapter that just ended adds, on its own outcome only", () => {
    expect(outcomeStatesAtEnding(onePlayerEnding())).toEqual([
      { id: RING, owner: "player1", milestones: 2, intended: 2, complete: true },
      { id: IDENTITY, owner: "player1", milestones: 0, intended: 2, complete: false },
      { id: COUNCIL, owner: "player1", milestones: 0, intended: 1, complete: false },
    ]);
    expect(outcomeStatesAtEnding(onePlayerEnding(3))[0]).toEqual({ id: RING, owner: "player1", milestones: 2, intended: 3, complete: false });
  });

  it("reads shared outcomes first, then each player's, a shared id copied into a player's list once", () => {
    const story = contestEnding(2);
    const copied = story.clone({
      players: Object.fromEntries(
        Object.entries(story.getState().players).map(([slot, p]) => [slot, { ...p, outcomes: [...story.getSharedOutcomes(), ...p.outcomes] }])
      ),
    });
    expect(outcomeStatesAtEnding(copied).map((s) => `${s.owner}:${s.id} ${s.milestones}/${s.intended}`)).toEqual([
      "shared:shared_voice 2/2",
      "player1:player1_pride 0/2",
      "player2:player2_pride 0/2",
    ]);
  });

  it("counts an outcome past its intended number as complete", () => {
    const states = outcomeStatesAtEnding(contestEnding(2, { intended: 1, recorded: 1 }));
    expect(states[0]).toEqual({ id: "shared_voice", owner: "shared", milestones: 2, intended: 1, complete: true });
  });

  it("writes one line of complete outcomes and one of unfinished ones, a player's own outcome with its seat in a group", () => {
    expect(outcomeStateLines(onePlayerEnding())).toBe(
      `--- Complete after this beat: ${RING} (2 of 2 milestones).\n--- Unfinished after this beat: ${IDENTITY} (0 of 2 milestones), ${COUNCIL} (0 of 1 milestones).\n`
    );
    expect(outcomeStateLines(contestEnding(2, { intended: 3 }))).toBe(
      "--- Complete after this beat: none.\n--- Unfinished after this beat: shared_voice (shared, 2 of 3 milestones), player1_pride (player1, 0 of 2 milestones), player2_pride (player2, 0 of 2 milestones).\n"
    );
  });
});

describe("the variant: each outcome told as its milestones leave it", () => {
  const CASES = [
    ["one player", () => onePlayerEnding()],
    ["two players, a scored contest", () => contestEnding(2)],
    ["three players (two camps), a scored contest", () => contestEnding(3, { mode: GameModes.CooperativeCompetitive })],
    ["two players, a contest without a scoreboard", () => contestEnding(2, { scoreboard: false })],
  ] as const;

  it.each(CASES)("%s: production's request with its outcome lines replaced, once, and its schema", (_, build) => {
    const story = build();
    const base = productionEndingForm(story);
    const variant = endingStateRequest(story);
    const block = `${ENDING_STATE_TEXT.sharedOutcomesLine}${ENDING_STATE_TEXT.tellAsLeft}${outcomeStateLines(story)}${ENDING_STATE_TEXT.complete}${ENDING_STATE_TEXT.unfinished}${scoreboardEnding(story) ? ENDING_STATE_TEXT.contestRule : ""}`;
    expect(variant.prompt).toBe(base.prompt.replace(baseBlock(story), block));
    expect(occurrences(variant.prompt, ENDING_STATE_TEXT.tellAsLeft)).toBe(1);
    expect(json(variant.schema)).toBe(json(base.schema));
  });

  it("keeps the rule's place: after the shared outcomes' line and before the stats' line", () => {
    const prompt = endingStateRequest(contestEnding(2)).prompt;
    const [shared, tell, contest, stats] = [
      ENDING_STATE_TEXT.sharedOutcomesLine,
      ENDING_STATE_TEXT.tellAsLeft,
      ENDING_STATE_TEXT.contestRule,
      "- Include any individual and shared stats that you think are worth mentioning in the ending.\n",
    ].map((passage) => prompt.indexOf(passage));
    expect(shared).toBeGreaterThan(0);
    expect(shared).toBeLessThan(tell);
    expect(tell).toBeLessThan(contest);
    expect(contest).toBeLessThan(stats);
  });

  it("replaces the measured scoreboard rule with one that has an unfinished half, on the same endings", () => {
    const scored = endingStateRequest(contestEnding(2)).prompt;
    expect(scored).not.toContain(ENDING_STATE_TEXT.measuredScoreboardRule);
    expect(scored).toContain(ENDING_STATE_TEXT.contestRule);
    expect(ENDING_STATE_TEXT.contestRule).toContain("a score between 45 and 55 is a draw (the mixed resolution)");
    expect(ENDING_STATE_TEXT.contestRule).toContain("While it is unfinished, no side has won yet: tell which side is ahead (neither, between 45 and 55) and that the contest isn't settled.");
    expect(ENDING_STATE_TEXT.contestRule).toContain("with three players, player1's camp");
    for (const story of [onePlayerEnding(), contestEnding(2, { scoreboard: false }), contestEnding(2, { mode: GameModes.Cooperative })]) {
      expect(endingStateRequest(story).prompt).not.toContain(ENDING_STATE_TEXT.contestRule);
    }
  });

  it("says what a complete and an unfinished outcome get, and states each outcome's standing", () => {
    const prompt = endingStateRequest(onePlayerEnding()).prompt;
    expect(prompt).toContain("- Tell each outcome as its milestones leave it, counting the milestones this beat adds.\n");
    expect(prompt).toContain("--- A complete outcome is resolved: narrate the possible resolution its milestones point to.\n");
    expect(prompt).toContain(
      "--- An unfinished outcome is told in its current state, even if that state is inconclusive: what its milestones so far have settled, and what is still open. Never resolve it beyond its milestones: none of its possible resolutions has been reached yet.\n"
    );
    expect(prompt).toContain(`--- Complete after this beat: ${RING} (2 of 2 milestones).`);
    // The held ending format (B8) stays out: no outcome endings field, no rule that an outcome without milestones ends mixed
    expect(prompt).not.toContain("ends in its mixed resolution");
    expect(JSON.stringify(toJsonSchema(endingStateRequest(onePlayerEnding()).schema as Parameters<typeof toJsonSchema>[0]))).not.toContain("outcomeEndings");
  });
});

describe("the eval variant (endingState)", () => {
  it("sends the request with production's turn limits for the player count, on beats only", () => {
    for (const [story, cap] of [
      [onePlayerEnding(), 12_000],
      [contestEnding(2), 14_000],
      [contestEnding(3, { mode: GameModes.CooperativeCompetitive }), 16_000],
    ] as const) {
      const request = requestFor("endingState", { role: "beat", story });
      expect(requestText(request)).toBe(endingStateRequest(story).prompt);
      expect(callLimitsOf(request)).toEqual({ timeoutMs: 90_000, maxCompletionTokens: cap });
    }
    expect(() => requestFor("endingState", { role: "thread", story: onePlayerEnding() })).toThrow(/does not cover role thread/);
  });
});

const CASES_DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const frozen = fs.existsSync(path.join(CASES_DIR, "cases", "cases.json")) ? evalFiles(CASES_DIR).readCases() : [];

(frozen.length ? describe : describe.skip)("every frozen ending", () => {
  it("builds the base and the variant, the variant differing from the base in its outcome lines only", () => {
    const endings = frozen.filter((c) => c.role === "beat" && c.tags.ending);
    expect(endings.length).toBeGreaterThanOrEqual(3);
    for (const c of endings) {
      const story = caseStory(c);
      const base = productionEndingForm(story);
      const variant = endingStateRequest(story);
      const block = `${ENDING_STATE_TEXT.sharedOutcomesLine}${ENDING_STATE_TEXT.tellAsLeft}${outcomeStateLines(story)}${ENDING_STATE_TEXT.complete}${ENDING_STATE_TEXT.unfinished}${scoreboardEnding(story) ? ENDING_STATE_TEXT.contestRule : ""}`;
      expect({ id: c.id, same: variant.prompt === base.prompt.replace(baseBlock(story), block), schema: json(variant.schema) === json(base.schema) }).toEqual({ id: c.id, same: true, schema: true });
    }
  });
});
