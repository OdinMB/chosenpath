import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { GameModes, type GameMode, type PlayerCount } from "core/types/index.js";
import { setupStep } from "../../../../../src/game/services/storyTextSteps.js";
import {
  EXAMPLES_HEADING,
  productionExamples,
  rewriteSetupRequest,
} from "../../../../../src/game/services/storyTextRewrite/setup.js";
import { slotsOf } from "../../../../helpers/promptStories.js";
import { allCapsWords, countOf, descriptionsOf, find, repeatedSentences, withoutCounts } from "./rewriteChecks.js";

const PREMISES = ["A lighthouse keeper's last winter", "Two rival bakers share one oven in a floating market"];
const MULTIPLAYER_MODES: GameMode[] = [GameModes.Cooperative, GameModes.Competitive, GameModes.CooperativeCompetitive];
const INPUTS: [PlayerCount, GameMode][] = [
  [1, GameModes.SinglePlayer],
  ...([2, 3] as PlayerCount[]).flatMap((players) => MULTIPLAYER_MODES.map((mode): [PlayerCount, GameMode] => [players, mode])),
];
const CASES = [true, false].flatMap((withExamples) => INPUTS.map(([players, mode]) => [withExamples, players, mode] as const));

const rewrite = (players: PlayerCount, mode: GameMode, withExamples: boolean, premise = PREMISES[0]) =>
  rewriteSetupRequest(premise, players, mode, 25, withExamples);
const production = (players: PlayerCount, mode: GameMode, premise = PREMISES[0]) => setupStep.request(premise, players, mode, 25, "story");

const examplesSectionOf = (players: PlayerCount, mode: GameMode) => `\n\n${EXAMPLES_HEADING}\n\n${productionExamples(production(players, mode).prompt)}`;

describe("rewriteSetupRequest", () => {
  it.each([true, false])("with examples %s: fixed is identical across premises and game modes within each player-count class", (withExamples) => {
    const classOf = (players: PlayerCount) => (players > 1 ? "multiplayer" : "single-player");
    const byClass = new Map<string, Set<string>>();
    for (const [players, mode] of INPUTS) {
      for (const premise of PREMISES) {
        const set = byClass.get(classOf(players)) ?? new Set<string>();
        set.add(rewrite(players, mode, withExamples, premise).fixed);
        byClass.set(classOf(players), set);
      }
    }
    expect([...byClass.values()].map((set) => set.size)).toEqual([1, 1]);
    expect(byClass.get("single-player")).not.toEqual(byClass.get("multiplayer"));
  });

  it.each(INPUTS)("%i players, %s: without examples, fixed is the with-examples text minus its examples section", (players, mode) => {
    const section = examplesSectionOf(players, mode);
    const withExamples = rewrite(players, mode, true).fixed;
    expect(withExamples.split(section)).toHaveLength(2);
    expect(withExamples.replace(section, "")).toBe(rewrite(players, mode, false).fixed);
  });

  it("carries production's example stat setups byte for byte", () => {
    const examples = productionExamples(production(1, GameModes.SinglePlayer).prompt);
    expect(examples.startsWith("Premise:")).toBe(true);
    expect(production(1, GameModes.SinglePlayer).prompt).toContain(examples);
    expect(rewrite(1, GameModes.SinglePlayer, true).fixed).toContain(examples);
  });

  it.each(CASES)("with examples %s, %i players, %s: the per-call message is production's configuration block, premise included", (withExamples, players, mode) => {
    const prompt = production(players, mode, PREMISES[1]).prompt;
    const { perCall } = rewrite(players, mode, withExamples, PREMISES[1]);
    expect(perCall).toBe(prompt.slice(prompt.indexOf("Number of players:")));
    expect(perCall).toContain(`<premise>\n${PREMISES[1]}\n</premise>`);
  });
});

describe("the rewrite's schema", () => {
  it.each(INPUTS)("%i players, %s: production's field set, types, key order and shared references", (players, mode) => {
    const json = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(withoutCounts(toJsonSchema(schema)));
    expect(json(rewrite(players, mode, true).schema)).toBe(json(production(players, mode).schema));
  });

  it.each(INPUTS)("%i players, %s: counts at every path of table SS", (players, mode) => {
    const json = toJsonSchema(rewrite(players, mode, true).schema);
    const at = (...path: string[]) => countOf(find(json, ["properties", ...path]));
    const exactlyThree = { minItems: 3, maxItems: 3 };
    expect(at("storyElements")).toEqual({ minItems: 6, maxItems: 8 });
    expect(at("storyElements", "items", "properties", "facts")).toEqual(exactlyThree);
    expect(at("guidelines", "properties", "typesOfThreads")).toEqual({ minItems: 6, maxItems: 8 });
    expect(at("guidelines", "properties", "switchAndThreadInstructions")).toEqual({ maxItems: 3 });
    expect(at("statGroups")).toEqual({ maxItems: 3 });
    // One stat instance for both lists: the player list refers to the shared one
    expect(at("sharedStats", "items", "properties", "effectOnPoints")).toEqual({ minItems: 3 });
    expect(find(json, ["properties", "playerStats", "items"])).toEqual({ $ref: "#/properties/sharedStats/items" });
    expect(at("characterSelectionPlan", "properties", "playerStatConversionRates")).toEqual(exactlyThree);
    expect(at("characterSelectionPlan", "properties", "backgroundArchetypes")).toEqual(exactlyThree);
    expect(at("characterSelectionPlan", "properties", "multiplayerCoordination")).toEqual(players > 1 ? exactlyThree : {});
    expect(at("player1", "properties", "outcomes")).toEqual({ maxItems: 3 });
    expect(at("player1", "properties", "possibleCharacterIdentities")).toEqual(exactlyThree);
    expect(at("player1", "properties", "possibleCharacterBackgrounds")).toEqual(exactlyThree);
    for (const slot of slotsOf(players).slice(1)) {
      expect(find(json, ["properties", slot])).toEqual({ $ref: "#/properties/player1" });
    }
  });

  it.each(INPUTS)("%i players, %s: keeps every field that story creation reads", (players, mode) => {
    const schema = rewrite(players, mode, false).schema;
    const shape = "shape" in schema && typeof schema.shape === "object" && schema.shape !== null ? schema.shape : {};
    const read = [
      "title", "imageInstructions", "guidelines", "storyElements", "sharedOutcomes", "sharedStats", "playerStats",
      "difficultyLevel", "characterSelectionIntroduction", ...slotsOf(players),
    ];
    for (const field of read) expect(shape).toHaveProperty(field);
    const player = find(toJsonSchema(schema), ["properties", "player1", "properties"]);
    expect(Object.keys(player as object)).toEqual(["outcomes", "possibleCharacterIdentities", "possibleCharacterBackgrounds"]);
  });
});

type Part = "fixed" | "perCall" | "schema";
type Applies = { multiplayer: boolean; withExamples: boolean };
type Rule = { id: string; part: Part; applies: (on: Applies) => boolean; pattern: string };

const always = () => true;
const multiplayerOnly = (on: Applies) => on.multiplayer;

/** One entry per row of plan table S (a row with a multiplayer addition has two entries). */
const SETUP_RULES: Rule[] = [
  { id: "S1 task", part: "fixed", applies: always, pattern: "Build it from the number of players, the game mode and the premise in the user message" },
  { id: "S2 inclusivity", part: "fixed", applies: always, pattern: "defies biases and stereotypes" },
  { id: "S3 element mix", part: "fixed", applies: always, pattern: "Mix 2 to 4 NPCs, 2 to 4 locations" },
  { id: "S4 instructions attribute", part: "fixed", applies: always, pattern: "instructions attribute for story hints" },
  { id: "S5 franchises", part: "fixed", applies: always, pattern: "Borrow nothing from established franchises" },
  { id: "S6 outcomes", part: "fixed", applies: always, pattern: "Every player has 3 outcomes, counting shared ones" },
  { id: "S7 shared outcomes", part: "fixed", applies: multiplayerOnly, pattern: "there are 0 to 3 shared outcomes" },
  { id: "S8 stat counts", part: "fixed", applies: always, pattern: "3 to 4 visible shared stats" },
  { id: "S8 contested scores", part: "fixed", applies: multiplayerOnly, pattern: "keep the score of what the players compete over" },
  { id: "S9 stat groups", part: "fixed", applies: always, pattern: "Group the stats in a flavourful way" },
  { id: "S10 stat design", part: "fixed", applies: always, pattern: "Favour string and string[] stats" },
  { id: "S10 contested outcomes", part: "fixed", applies: multiplayerOnly, pattern: "except for contested outcomes in multiplayer games" },
  { id: "S10 consistent backgrounds", part: "fixed", applies: multiplayerOnly, pattern: "only one player is the pilot" },
  { id: "S11 stat types", part: "fixed", applies: always, pattern: "Stat types and what they suit" },
  { id: "S12 stats in play", part: "fixed", applies: always, pattern: "How stats act in play" },
  { id: "S13 balanced backgrounds", part: "fixed", applies: always, pattern: "Make the backgrounds differ and balance" },
  { id: "S13 players differ", part: "fixed", applies: multiplayerOnly, pattern: "identities and backgrounds differ from the other players'" },
  { id: "S14 difficulty", part: "fixed", applies: always, pattern: "Choose exactly one difficulty level" },
  { id: "S15 examples", part: "fixed", applies: (on) => on.withExamples, pattern: EXAMPLES_HEADING },
  { id: "S16 thin premise", part: "fixed", applies: always, pattern: "If the premise is thin, odd or contradictory" },
  { id: "S17 descriptions are instructions", part: "fixed", applies: always, pattern: "The field descriptions in the reply format are part of these instructions." },
  { id: "S18 configuration", part: "perCall", applies: always, pattern: "Number of players:" },
];

const occurrences = (text: string, pattern: string) => text.split(pattern).length - 1;

describe("every rule of table S, once, where the table puts it", () => {
  it.each(CASES)("with examples %s, %i players, %s", (withExamples, players, mode) => {
    const request = rewrite(players, mode, withExamples);
    const parts: Record<Part, string> = {
      fixed: request.fixed,
      perCall: request.perCall,
      schema: descriptionsOf(toJsonSchema(request.schema)).join("\n"),
    };
    const on = { multiplayer: players > 1, withExamples };
    for (const rule of SETUP_RULES) {
      const found = Object.fromEntries((Object.keys(parts) as Part[]).map((part) => [part, occurrences(parts[part], rule.pattern)]));
      const expected = { fixed: 0, perCall: 0, schema: 0, ...(rule.applies(on) ? { [rule.part]: 1 } : {}) };
      expect({ rule: rule.id, found }).toEqual({ rule: rule.id, found: expected });
    }
  });
});

describe("stated once, without shouting (the examples and the configuration block are production's, and exempt)", () => {
  it.each(INPUTS)("%i players, %s", (players, mode) => {
    const request = rewrite(players, mode, true);
    const fixed = request.fixed.replace(examplesSectionOf(players, mode), "");
    const texts = [fixed, ...descriptionsOf(toJsonSchema(request.schema))];
    expect(repeatedSentences(texts)).toEqual([]);
    expect(texts.flatMap(allCapsWords)).toEqual([]);
  });
});
