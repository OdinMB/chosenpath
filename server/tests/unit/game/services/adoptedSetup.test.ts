import { describe, expect, it } from "@jest/globals";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { GameModes, type GameMode, type PlayerCount } from "core/types/index.js";
import type { TemplateIterationSections } from "core/types/admin.js";
import { iterationStep, setupStep } from "../../../../src/game/services/storyTextSteps.js";
import { ROUND3_PARTS, ROUND3B_PARTS } from "../../../../src/game/services/storyTextRounds/setupRound1.js";
import { assembleGenerationOrder, iterationRound2Request, setupRound2Request } from "../../../../src/game/services/storyTextRounds/setupRound2.js";
import { PLAYER_STATS_NAMELESS } from "../../../../src/game/services/storyTextRounds/setupRound3Text.js";
import { KIDS_EXAMPLES, SCOREBOARD_SENTENCES, adoptedSetupPrompt, isContestSetup } from "../../../helpers/adoptedDeltas.js";

/*
 * Production's setup form is setup round 3's as the eval measured it
 * (variant setupR3, round 2b's arm B on ROUND3_PARTS): the same prompt and
 * JSON schema, byte for byte, for a custom story, a template and AI
 * Iteration, over every player count, game mode, story length and the kids
 * budget; and the reply is put back into today's fields the way the eval
 * assembled it, with an empty shared list where one player's reply has none.
 */

const PREMISE = "Two rival bakers share one oven in a floating market";
const FEEDBACK = "Make the rivalry sharper";
const TEMPLATE = { title: "The Oven", gameMode: "competitive", sharedOutcomes: [], creatorId: "u1", creatorUsername: "baker" };
const INPUTS: [PlayerCount, GameMode][] = [
  [1, GameModes.SinglePlayer],
  ...([2, 3] as PlayerCount[]).flatMap((players) =>
    [GameModes.Cooperative, GameModes.Competitive, GameModes.CooperativeCompetitive].map((mode): [PlayerCount, GameMode] => [players, mode])
  ),
];
const LENGTHS = [5, 8, 10, 12, 14, 15, 18, 20, 22, 25, 30];
const SECTIONS: TemplateIterationSections[] = ["guidelines", "storyElements", "sharedOutcomes", "stats", "players", "media", "difficultyLevels"];
/** Every non-empty set of sections, in the editor's order */
const SECTION_SETS: TemplateIterationSections[][] = Array.from({ length: 2 ** SECTIONS.length - 1 }, (_, i) =>
  SECTIONS.filter((_, bit) => (i + 1) & (1 << bit))
);

const json = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(toJsonSchema(schema));

/*
 * The one deliberate change to the measured text (adoptedDeltas.ts): with the
 * scoreboard ending rule, three sentences that were true only while no stat
 * decided an outcome say that a contested outcome's scoreboard does, in the
 * setups that have one. Everywhere else the text is as measured.
 */
const isContest = isContestSetup;
const adopted = adoptedSetupPrompt;

describe("custom-story and template setup: the measured form", () => {
  for (const kind of ["story", "template"] as const) {
    it.each(INPUTS)(`${kind}, %i players, %s: every story length, with and without a child reading along`, (players, mode) => {
      for (const maxTurns of LENGTHS) {
        for (const kids of [false, true]) {
          const production = setupStep.request(PREMISE, players, mode, maxTurns, kind, { kids });
          const measured = setupRound2Request(PREMISE, players, mode, maxTurns, kind, "generationOrder", ROUND3_PARTS, { kids });
          expect(production.prompt).toBe(adopted(measured.prompt, players, mode));
          expect(json(production.schema)).toBe(json(measured.schema));
        }
      }
    });
  }

  it("says a contest's scoreboard decides it at the ending in all three places, and only where a contest has one", () => {
    for (const [players, mode] of INPUTS) {
      const prompt = setupStep.request(PREMISE, players, mode, 25, "story").prompt;
      for (const [from, to] of SCOREBOARD_SENTENCES) {
        expect(prompt.split(isContest(players, mode) ? to : from)).toHaveLength(2);
        expect(prompt).not.toContain(isContest(players, mode) ? from : to);
      }
    }
  });

  it("prints the kids budget only when a child reads along", () => {
    expect(setupStep.request(PREMISE, 2, GameModes.Cooperative, 25, "story", { kids: true }).prompt).toContain("A child reads this story along with an adult");
    expect(setupStep.request(PREMISE, 2, GameModes.Cooperative, 25, "story").prompt).not.toContain("A child reads this story");
  });

  it("names the kids stat examples as the setup retests measured them (setupR3b), and keeps the identity clause as round 3 measured it", () => {
    const [before, after] = KIDS_EXAMPLES;
    const kids = setupStep.request(PREMISE, 2, GameModes.Cooperative, 25, "story", { kids: true }).prompt;
    expect(kids).toContain(after);
    expect(kids).not.toContain(before);
    expect(kids).not.toMatch(/Courage/);
    // The same passage as the retest's form sends it
    const retest = setupRound2Request(PREMISE, 2, GameModes.Cooperative, 25, "story", "generationOrder", ROUND3B_PARTS, { kids: true }).prompt;
    expect(retest).toContain(after);
    // The identity clause did not pass its retest: production keeps "in outcomes and stats"
    expect(setupStep.request(PREMISE, 2, GameModes.Competitive, 25, "story").prompt).toContain("use those names in outcomes and stats");
    // Nor did the Casablanca sentence (round 3c, 2026-09-29: nothing moved over its four pairs, and Susan's player stats
    // still carried her name in 2 of 2), so production does not send it
    for (const players of [1, 2, 3] as PlayerCount[]) {
      const mode = players === 1 ? GameModes.SinglePlayer : GameModes.Competitive;
      expect(setupStep.request(PREMISE, players, mode, 25, "story").prompt).not.toContain(PLAYER_STATS_NAMELESS);
    }
  });
});

describe("AI Iteration: the measured form on today's field order", () => {
  it.each(INPUTS)("%i players, %s: every set of sections", (players, mode) => {
    for (const sections of SECTION_SETS) {
      for (const maxTurns of [10, 20, 25]) {
        const production = iterationStep.request(FEEDBACK, players, mode, maxTurns, sections, TEMPLATE);
        const measured = iterationRound2Request(FEEDBACK, players, mode, maxTurns, sections, TEMPLATE, ROUND3_PARTS);
        expect(production.prompt).toBe(adopted(measured.prompt, players, mode));
        expect(json(production.schema)).toBe(json(measured.schema));
      }
    }
  });

  it("never sends the template's creator", () => {
    const prompt = iterationStep.request(FEEDBACK, 2, GameModes.Competitive, 20, ["stats"], TEMPLATE).prompt;
    expect(prompt).not.toContain("creatorId");
    expect(prompt).not.toContain("baker");
  });
});

describe("the reply, put back into today's fields before anything reads it", () => {
  const outcome = (id: string) => ({ id, question: `${id}?`, possibleResolutions: { favorable: "a", mixed: "b", unfavorable: "c" }, resonance: "r", intendedNumberOfMilestones: 2 });
  const stat = (id: string, group: string) => ({ id, name: id, group });
  const reply = (players: number) => ({
    guidelines: { world: "w", rules: ["r"], tone: ["t"], conflicts: ["c"], decisions: ["d"] },
    difficultyLevel: { modifier: 0, title: "Even" },
    ...(players > 1 ? { playerRoles: ["player1: the baker", "player2: the rival"], sharedOutcomes: [outcome("shared_oven")] } : {}),
    storyElements: [{ id: "oven", name: "The Oven" }],
    playerOutcomes: Object.fromEntries(Array.from({ length: players }, (_, i) => [`player${i + 1}`, [outcome(`player${i + 1}_pride`)]])),
    sharedStats: [stat("shared_heat", "Market")],
    playerStats: [stat("player_flour", "Pantry")],
    characterSelectionPlan: { playerStatConversionRates: ["x"], backgroundArchetypes: ["y"] },
    ...Object.fromEntries(Array.from({ length: players }, (_, i) => [`player${i + 1}`, { possibleCharacterIdentities: [], possibleCharacterBackgrounds: [] }])),
    threadDesign: { typesOfThreads: ["Bake-off (contest, 3): …"], switchAndThreadInstructions: ["When the heat falls below 20%, …"] },
    title: "The Oven",
    characterSelectionIntroduction: { title: "Who bakes?", text: "…" },
    imageInstructions: {},
  });

  it.each([2, 3] as PlayerCount[])("%i players: as the eval assembled it, the seat roles in the plan's coordination list", (players) => {
    const request = setupStep.request(PREMISE, players, GameModes.Competitive, 25, "story");
    const assembled = request.assemble(reply(players));
    expect(assembled).toEqual(assembleGenerationOrder(reply(players), players, "story"));
    expect((assembled.characterSelectionPlan as { multiplayerCoordination: string[] }).multiplayerCoordination).toEqual(["player1: the baker", "player2: the rival"]);
    expect(Object.keys(assembled)).toEqual([
      "guidelines", "difficultyLevel", "storyElements", "sharedOutcomes", "statGroups", "sharedStats", "playerStats",
      "characterSelectionPlan", ...Array.from({ length: players }, (_, i) => `player${i + 1}`), "title", "characterSelectionIntroduction", "imageInstructions",
    ]);
  });

  it("one player: an empty shared list where the reply writes none, and today's fields otherwise", () => {
    const assembled = setupStep.request(PREMISE, 1, GameModes.SinglePlayer, 25, "template").assemble(reply(1));
    const measured = assembleGenerationOrder(reply(1), 1, "template");
    expect(assembled).toEqual({ ...measured, sharedOutcomes: [] });
    expect(Object.keys(assembled).indexOf("sharedOutcomes")).toBe(Object.keys(assembled).indexOf("storyElements") + 1);
    expect(assembled.player1).toEqual({ outcomes: [{ ...outcome("player1_pride"), milestones: [] }], possibleCharacterIdentities: [], possibleCharacterBackgrounds: [] });
    expect(assembled.guidelines).toEqual({ ...reply(1).guidelines, ...reply(1).threadDesign });
    expect(assembled.statGroups).toEqual(["Market", "Pantry"]);
  });
});
