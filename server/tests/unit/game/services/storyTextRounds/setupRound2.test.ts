import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { createStorySetupSchema, GameModes, type GameMode, type PlayerCount } from "core/types/index.js";
import { setupStep } from "../../../../../src/game/services/storyTextSteps.js";
import { StorySetupPromptService } from "../../../../../src/game/services/prompts/StorySetupPromptService.js";
import {
  ENGINE_HEADING,
  NO_BLANK_ITEMS,
  PASSING_ROUND1_PARTS,
  THIS_SETUP_HEADING,
  WORKED_EXAMPLE_HEADING,
  iterationRequestFromRound1,
  setupRequestFromRound1,
} from "../../../../../src/game/services/storyTextRounds/setupRound1.js";
import {
  INSTRUCTIONS_FALLBACK,
  NARRATIVE_PROMPT_LINE,
  assembleGenerationOrder,
  iterationRound2Request,
  setupRound2Request,
  type Round2Order,
} from "../../../../../src/game/services/storyTextRounds/setupRound2.js";
import { slotsOf } from "../../../../helpers/promptStories.js";
import { countKeywords, descriptionsOf, find } from "../storyTextRewrite/rewriteChecks.js";

const PREMISE = "Two rival bakers share one oven in a floating market";
const MULTIPLAYER_MODES: GameMode[] = [GameModes.Cooperative, GameModes.Competitive, GameModes.CooperativeCompetitive];
const INPUTS: [PlayerCount, GameMode][] = [
  [1, GameModes.SinglePlayer],
  ...([2, 3] as PlayerCount[]).flatMap((players) => MULTIPLAYER_MODES.map((mode): [PlayerCount, GameMode] => [players, mode])),
];
const KINDS = ["story", "template"] as const;
const ORDERS: Round2Order[] = ["fieldOrder", "generationOrder"];
const KIND_INPUTS = KINDS.flatMap((kind) => INPUTS.map(([players, mode]) => [kind, players, mode] as const));
const ARM_INPUTS = ORDERS.flatMap((order) => KIND_INPUTS.map(([kind, players, mode]) => [order, kind, players, mode] as const));

const ALL_SECTIONS = ["guidelines", "storyElements", "sharedOutcomes", "stats", "players", "media", "difficultyLevels"];
const SECTION_SETS: string[][] = [ALL_SECTIONS, ["sharedOutcomes", "players"], ["players"], ["sharedOutcomes"], ["stats"], ["guidelines"], ["guidelines", "stats"]];
const TEMPLATE = { title: "The Oven", gameMode: "competitive", sharedOutcomes: [] };
const FEEDBACK = "Make the rivalry sharper";

const base = (players: PlayerCount, mode: GameMode, kind: "story" | "template" = "story") =>
  setupRequestFromRound1(PREMISE, players, mode, 25, kind, PASSING_ROUND1_PARTS);
const production = (players: PlayerCount, mode: GameMode, kind: "story" | "template" = "story") => setupStep.request(PREMISE, players, mode, 25, kind);
const round2 = (order: Round2Order, players: PlayerCount, mode: GameMode, kind: "story" | "template" = "story") =>
  setupRound2Request(PREMISE, players, mode, 25, kind, order);

const occurrences = (text: string, pattern: string) => text.split(pattern).length - 1;
const json = (schema: Parameters<typeof toJsonSchema>[0]) => toJsonSchema(schema);
const descriptions = (schema: Parameters<typeof toJsonSchema>[0]) => descriptionsOf(json(schema)).join("\n");
const isContestMode = (mode: GameMode) => mode === GameModes.Competitive || mode === GameModes.CooperativeCompetitive;
/** The instructions before the configuration block, where every round edit lands */
const instructions = (prompt: string) => prompt.slice(0, prompt.indexOf("#".repeat(50)));
/** Production's example stat setups, as a round prints them */
const exampleBlock = (prompt: string) => prompt.slice(prompt.indexOf("EXAMPLE STAT SETUPS"), prompt.indexOf("Character Selection Instructions"));

describe("round 2's base: round 1 without the proposals that failed the stop rule (1, 2 and 5)", () => {
  it.each(KIND_INPUTS)("%s, %i players, %s: builds one message with a schema that converts", (kind, players, mode) => {
    const request = base(players, mode, kind);
    expect(request.prompt).toContain(`<premise>\n${PREMISE}\n</premise>`);
    expect(() => json(request.schema)).not.toThrow();
  });

  it.each(INPUTS)("iteration, %i players, %s: every section set builds", (players, mode) => {
    for (const sections of SECTION_SETS) {
      const request = iterationRequestFromRound1(FEEDBACK, players, mode, 25, sections, TEMPLATE, PASSING_ROUND1_PARTS);
      expect(() => json(request.schema)).not.toThrow();
    }
  });

  it("refuses a scoreboard without the slate that prints its lines", () => {
    expect(() => setupRequestFromRound1(PREMISE, 2, GameModes.Competitive, 25, "story", { slate: false, scoreboard: true, example: false })).toThrow(
      /needs the slate/
    );
  });

  /** The passing proposals' key rules (3, 4 and 6, and the blank-items sentence) */
  const KEPT: [string, "prompt" | "schema", string][] = [
    // The heading line: A3.2's pointer in production's "For each stat" block names it too
    ["A3.1 engine facts", "prompt", `${ENGINE_HEADING}\n`],
    ["A3.1 no restating", "prompt", "These are facts about the engine. Don't restate them anywhere in the setup."],
    ["A3.2 effect scale", "schema", "+5 slight, +10 clear, +15 decisive"],
    ["A4.1 two ways", "prompt", "Every stat earns its place in play in at least two ways"],
    ["A4.1 person", "prompt", "Player stats are about the person"],
    ["A4.2 certain sacrifice", "schema", "The bonus is always the same, so never state it, and the loss is certain, never a risk."],
    ["A4.2 flag apart", "schema", "A stat that is not adjustable anytime still gets a sacrifice."],
    ["A6.1 one thing", "schema", "Ask about one thing, in the story's own names"],
    ["A6.3 three paths", "schema", "Exploration threads offer these paths as choices"],
    ["blank items", "prompt", NO_BLANK_ITEMS],
  ];
  /** The failed proposals' text, which the base leaves out */
  const LEFT_OUT: [string, "prompt" | "schema", string][] = [
    ["A1.1 inventory pointer", "prompt", 'see the Outcomes section below and the "This setup" block'],
    ["A1.2 fixed outcomes section", "prompt", "Outcomes are the questions the ending answers."],
    ["A1.2 seat roles", "prompt", "Each player seat has its own role in this story"],
    ["A1.3 this setup", "prompt", `\n${THIS_SETUP_HEADING}\n`],
    ["S8 identities", "prompt", "three identities that keep the name"],
    ["A1.4 roles in the plan", "schema", "give each player seat its own role in this story"],
    ["A1.4 role in backgrounds", "schema", "name the seat's role in the story"],
    ["A1.4 milestone counts", "schema", "1 for a side question that one thread decides"],
    ["A2.1 scoreboard", "prompt", "--- A scoreboard for each contested shared outcome"],
    ["A2.2 contested favor", "prompt", "that favor is a contest"],
    ["A2.2 scored by", "prompt", "Scored by"],
    ["A2.4 names", "schema", "Never a player's seat ('Player 1')"],
    ["A2.4 sides", "schema", "Side A (player1's character in a two-player game) wins."],
    ["A2.4 shared stats", "schema", "one of these is the scoreboard of each contested shared outcome"],
    ["A5 worked example", "prompt", WORKED_EXAMPLE_HEADING],
    ["A5 one-line catalogue", "prompt", "Stat types\n- string: a state that changes in steps"],
    ["A6 roles", "schema", "by role"],
  ];

  it.each(KIND_INPUTS)("%s, %i players, %s: the passing proposals' rules once, the failed ones' nowhere", (kind, players, mode) => {
    const request = base(players, mode, kind);
    const parts = { prompt: request.prompt, schema: descriptions(request.schema) };
    for (const [id, part, pattern] of KEPT) expect({ id, found: occurrences(parts[part], pattern) }).toEqual({ id, found: 1 });
    // Left out means in neither part, wherever round 1 printed it
    for (const [id, , pattern] of LEFT_OUT) expect({ id, found: occurrences(`${parts.prompt}\n${parts.schema}`, pattern) }).toEqual({ id, found: 0 });
    // The contested resonance line stays in the contest modes, without its pointer to the scoreboard's rule
    expect(occurrences(parts.schema, "- Contested outcome: what drives each side and what winning would cost them.")).toBe(players > 1 && isContestMode(mode) ? 1 : 0);
  });

  it.each(KIND_INPUTS)("%s, %i players, %s: production's text where the failed proposals were", (kind, players, mode) => {
    const [ours, theirs] = [base(players, mode, kind), production(players, mode, kind)];
    const slice = (prompt: string, from: string, to: string) => prompt.slice(prompt.indexOf(from), prompt.indexOf(to, prompt.indexOf(from)));
    // Proposal 1: production's outcome budget and blocks; the configuration block byte for byte
    expect(slice(ours.prompt, "- A total of 3 outcomes for each player", "\n- 3-4 visible shared stats")).toBe(
      slice(theirs.prompt, "- A total of 3 outcomes for each player", "\n- 3-4 visible shared stats")
    );
    expect(ours.prompt.slice(ours.prompt.indexOf("#".repeat(50)))).toBe(theirs.prompt.slice(theirs.prompt.indexOf("#".repeat(50))));
    // Proposal 2: production's score line in every multiplayer mode, and its "consider an opposite stat"
    expect(occurrences(ours.prompt, "--- Stats to track the score about things that players compete over")).toBe(players > 1 ? 1 : 0);
    expect(descriptions(ours.schema)).toContain("consider adding an opposite stat to track who is in the lead");
    // Proposal 5: production's catalogue, "For each stat" block and example stat setups
    for (const heading of ["Type of stats and what they are good for:", "For each stat, you must define:", "EXAMPLE STAT SETUPS"]) expect(occurrences(ours.prompt, heading)).toBe(1);
    // The schema keeps production's fields and key order, the shared-outcome list included for one player
    const keys = (schema: Parameters<typeof toJsonSchema>[0]) => Object.keys(find(json(schema), ["properties"]) as object);
    expect(keys(ours.schema)).toEqual(keys(theirs.schema));
  });

  it.each(KIND_INPUTS)("%s, %i players, %s: inclusivity, story elements, character selection and difficulty stay production's", (kind, players, mode) => {
    const ours = base(players, mode, kind).prompt.replace(`${NO_BLANK_ITEMS}\n\n`, "");
    const theirs = production(players, mode, kind).prompt;
    const slice = (prompt: string, from: string, to: string) => prompt.slice(prompt.indexOf(from), prompt.indexOf(to, prompt.indexOf(from)));
    for (const [from, to] of [
      ["Inclusivity and diversity", "Include the following elements:"],
      ["Story elements\n", "STATS\n"],
      ["Character Selection Instructions", "#".repeat(50)],
    ]) {
      expect(slice(ours, from, to)).toBe(slice(theirs, from, to));
    }
  });

  describe("proposals 3, 4 and 6 edit production's text they now sit beside", () => {
    const [ours, theirs] = [base(2, GameModes.Competitive), production(2, GameModes.Competitive)];

    it("replaces the old engine paragraph, the ±10/±20 effects and 'expressed in points' (A3.1, A3.2)", () => {
      expect(theirs.prompt).toContain("Context for additional stat parameters");
      expect(ours.prompt).not.toContain("Context for additional stat parameters");
      expect(ours.prompt).not.toContain("+/-10 for minor effects, +/-20 for major effects");
      expect(occurrences(ours.prompt, "Effects on beat resolution: see the scale in 'How the game plays your setup'.")).toBe(1);
      expect(ours.prompt).not.toContain("(expressed in points)");
    });

    it("drops the catalogue's counters and the block's decay and choice-driven adjustments (A4.1, A4.2)", () => {
      expect(ours.prompt).not.toContain("Counters (e.g., wins in a tournament");
      expect(ours.prompt).not.toContain("Define decay or regeneration patterns");
      expect(ours.prompt).not.toContain("based on player choices and thread resolutions");
    });

    it("reads a false flag as round 1's field does: sacrifices and rewards still apply", () => {
      expect(ours.prompt).not.toContain("If false, the stat can only be changed after threads are resolved.");
      expect(occurrences(ours.prompt, "If false, the stat changes when a thread gets resolved and through its own sacrifice and reward options.")).toBe(1);
    });

    it("gives the multiplayer block's three-path example A6.1's question form", () => {
      expect(ours.prompt).not.toContain("Does Alex choose loyalty");
      expect(occurrences(ours.prompt, "Which path will Alex choose, loyalty to the family or their own ambitions?")).toBe(1);
    });

    it.each(INPUTS)("%i players, %s: points production's side A / side B line at A6.1's three-path race where three players contest", (players, mode) => {
      const race = "; a three-player race takes three paths instead, one per player, as the outcome description says.";
      const prompt = base(players, mode).prompt;
      expect(occurrences(prompt, race)).toBe(players === 3 && isContestMode(mode) ? 1 : 0);
      // The line itself stays production's wherever it prints
      expect(occurrences(prompt, "--- Shared competitive outcomes should include one resolution for side A winning, one for side B winning, and one resolution that is mixed")).toBe(players > 1 ? 1 : 0);
    });

    it("keeps nothing in the example stat setups that breaks proposals 3 and 4", () => {
      const example = exampleBlock(ours.prompt);
      const fields = (name: string) => [...example.matchAll(new RegExp(`^  ${name}: \\[\\n((?:    .*\\n)*?)  \\]`, "gm"))].map((m) => m[1].split("\n").filter(Boolean));
      const effects = fields("effectOnPoints");
      const adjustments = fields("adjustmentsAfterThreads");
      const spendLines = [...example.matchAll(/^ {2}options(?:ToSacrifice|ToGainAsReward): "(.*)"$/gm)].map((m) => m[1]);
      expect(effects.length).toBe(12);
      expect(adjustments.length).toBe(12);
      expect(spendLines.length).toBe(24);
      // The harness's own rules (setupDesignChecks): signed numbers within ±15, no formula, no bonus or risk in what is spent or gained
      const signed = (line: string) => [...line.matchAll(/(?:^|[^\w])([+\-−–±])\s?(\d+(?:\.\d+)?)(?![\d.]*\s?%)/g)].map((m) => Number(m[2]));
      expect(effects.flat().flatMap(signed).filter((n) => n > 15)).toEqual([]);
      expect(effects.flat().filter((line) => /\b(per|for (every|each)|times|multiplied|divided)\b|[×÷*]|\beach \d+|\(\s*[\p{L} ]+\s[-+]\s\d+\s*\)/iu.test(line))).toEqual([]);
      expect(spendLines.filter((line) => /\b(bonus(es)?|risk(s|ed|ing)?|might|potentially|possibly|chances?)\b|[+±]\s?\d+/i.test(line))).toEqual([]);
      // Two or three effects; one or two changes after threads
      expect(effects.every((list) => list.length >= 2 && list.length <= 3)).toBe(true);
      expect(adjustments.every((list) => list.length >= 1 && list.length <= 2)).toBe(true);
      // What is spent or gained is named in the stat's own units (A4.2)
      expect(spendLines.filter((line) => line !== "None" && !/\d|\bone\b|\ba special follower\b/.test(line))).toEqual([]);
      // No effect grows past its stated values over time (A3.2: values in absolute terms)
      expect(example).not.toContain("increasing their penalties");
      // The progress ladder A4.1 names as weak, and a special power that is spent
      expect(example).not.toContain("Personal Dream");
      expect(example).toMatch(/- Seasonal Powers \(string\[\]\)[\s\S]*?optionsToSacrifice: "None"/);
      // Production's two premises and every other stat are still there
      for (const name of ["Nature spirits guard the forest", "The last rock band on Mars", "Stage Presence", "Group Chemistry"]) expect(example).toContain(name);
    });

    it("changes nothing else in production's instructions", () => {
      // Production's instructions with round 2's base edits undone, where each is a single passage
      expect(instructions(ours.prompt).length).toBeLessThan(instructions(theirs.prompt).length);
      expect(instructions(ours.prompt).startsWith(instructions(theirs.prompt).slice(0, instructions(theirs.prompt).indexOf("\n\n") + 2) + ENGINE_HEADING)).toBe(true);
    });
  });

  it("puts the example-copy check on production's example block", () => {
    expect(exampleBlock(base(1, GameModes.SinglePlayer).prompt).startsWith("EXAMPLE STAT SETUPS")).toBe(true);
  });
});

describe("setupRound2Request builds both arms", () => {
  it.each(ARM_INPUTS)("%s, %s, %i players, %s: one message with a schema that converts, and caps only", (order, kind, players, mode) => {
    const request = round2(order, players, mode, kind);
    expect(request.prompt).toContain(`<premise>\n${PREMISE}\n</premise>`);
    const schema = json(request.schema);
    expect(countKeywords(schema).filter((keyword) => keyword.startsWith("minItems"))).toEqual([]);
    const caps = countKeywords(schema).map((keyword) => keyword.replace(/^maxItems at \./, "").replace(/^properties\./, ""));
    const thread = order === "fieldOrder" ? "guidelines" : "threadDesign";
    expect(caps.sort()).toEqual(
      [
        `${thread}.properties.typesOfThreads`,
        `${thread}.properties.switchAndThreadInstructions`,
        "sharedStats.items.properties.effectOnPoints",
        "sharedStats.items.properties.adjustmentsAfterThreads",
        "sharedStats.items.properties.narrativeImplications",
      ].sort()
    );
  });

  it.each(KIND_INPUTS)("%s, %i players, %s: the two arms send the same prompt text; only the field order and the fallback line differ", (kind, players, mode) => {
    expect(round2("generationOrder", players, mode, kind).prompt).toBe(round2("fieldOrder", players, mode, kind).prompt);
    // The base with A7.3's line for production's narrative block, and its example implications that name no threshold cut
    const expected = base(players, mode, kind)
      .prompt.replace(/Narrative Thresholds and Implications\.\n[\s\S]*?\(e\.g\., "1000\+ gold represents upper class status"\)\n/, `${NARRATIVE_PROMPT_LINE}\n`)
      .replace('",\n    "Special followers may develop their own storylines and conflicts requiring resolution"\n', '"\n')
      .replace('    "Gear quality affects all performance descriptions and audience reactions",\n', "")
      .replace('",\n    "Chemistry level affects all inter-band dialogue and decision options"\n', '"\n');
    expect(round2("fieldOrder", players, mode, kind).prompt).toBe(expected);
  });
});

describe("proposal 7's key rules, once where they apply", () => {
  const A71 = "Two to four rules that the story's planners apply between threads";
  const A72 = "Write each as 'Name (kind, beats): what the players do and what is at stake'.";
  const A73 = "One to three thresholds, each with what the story must do when the stat reaches it.";

  it.each(ARM_INPUTS)("%s, %s, %i players, %s", (order, kind, players, mode) => {
    const request = round2(order, players, mode, kind);
    const [prompt, schema] = [request.prompt, descriptions(request.schema)];
    expect([occurrences(schema, A71), occurrences(schema, A72), occurrences(schema, A73)]).toEqual([1, 1, 1]);
    expect(occurrences(prompt, NARRATIVE_PROMPT_LINE)).toBe(1);
    expect(prompt).not.toContain("Narrative Thresholds and Implications.");
    // Production's field texts are replaced whole
    expect(schema).not.toContain("6-8 types of threads that fit the story");
    expect(schema).not.toContain("Generate 0-3 instructions.");
    expect(schema).not.toContain("Specific thresholds and their story implications. Be creative.");
    // Printed only where the call has them
    expect(occurrences(schema, "- in multiplayer games: when the players share a thread")).toBe(players > 1 ? 1 : 0);
    expect(occurrences(schema, "and when they face each other in a contest")).toBe(players > 1 && isContestMode(mode) ? 1 : 0);
    expect(occurrences(schema, "or contest (players against each other)")).toBe(players > 1 && isContestMode(mode) ? 1 : 0);
    // Until the generation order lands, the rules come before the stats they name (A7.1's fallback line)
    expect(occurrences(schema, INSTRUCTIONS_FALLBACK)).toBe(order === "fieldOrder" ? 1 : 0);
    // The base's rules stay
    expect(occurrences(prompt, `${ENGINE_HEADING}\n`)).toBe(1);
    expect(occurrences(prompt, NO_BLANK_ITEMS)).toBe(1);
  });

  describe("A7.3 on production's example stat setups, which round 2's base keeps", () => {
    /** Implications that name no value or state the stat reaches (A7.3: "One to three thresholds") */
    const UNCONDITIONED = [
      "Special followers may develop their own storylines and conflicts requiring resolution",
      "Gear quality affects all performance descriptions and audience reactions",
      "Chemistry level affects all inter-band dialogue and decision options",
    ];

    it.each(ORDERS)("%s: cuts the implications that name no threshold, and every stat keeps at least one", (order) => {
      const example = exampleBlock(round2(order, 2, GameModes.Competitive).prompt);
      for (const line of UNCONDITIONED) expect({ line, found: example.includes(line) }).toEqual({ line, found: false });
      const lists = [...example.matchAll(/^ {2}narrativeImplications: \[\n((?: {4}.*\n)*?) {2}\]/gm)].map((m) => m[1].split("\n").filter(Boolean));
      expect(lists.length).toBe(12);
      expect(lists.every((list) => list.length >= 1 && list.length <= 3)).toBe(true);
      // Each list still reads as JSON-like lines: every item but the last ends with a comma
      expect(lists.every((list) => list.slice(0, -1).every((line) => line.endsWith('",')) && list[list.length - 1].endsWith('"'))).toBe(true);
    });

    it("leaves them to proposal 7: the base alone still shows them", () => {
      const example = exampleBlock(base(2, GameModes.Competitive).prompt);
      for (const line of UNCONDITIONED) expect(example).toContain(line);
    });
  });

  it("ends its list of kinds as a sentence, in every mode", () => {
    for (const [players, mode] of INPUTS) {
      const field = find(json(round2("fieldOrder", players, mode).schema), ["properties", "guidelines", "properties", "switchAndThreadInstructions"]) as { description: string };
      const bullets = field.description.split("\n").filter((line) => line.startsWith("- "));
      expect(bullets.slice(0, -1).every((line) => line.endsWith(";"))).toBe(true);
      expect(bullets[bullets.length - 1].endsWith(".")).toBe(true);
    }
  });
});

describe("proposal 9: the generation order (arm B)", () => {
  const properties = (schema: Parameters<typeof toJsonSchema>[0], path: string[] = []) => Object.keys(find(json(schema), [...path, "properties"]) as object);

  it.each(KIND_INPUTS)("%s, %i players, %s: decisions before what depends on them, without the dead outputs", (kind, players, mode) => {
    const schema = round2("generationOrder", players, mode, kind).schema;
    const slots = slotsOf(players);
    expect(properties(schema)).toEqual([
      "guidelines",
      ...(kind === "story" ? ["difficultyLevel"] : ["difficultyLevels", "teaser"]),
      "storyElements",
      "sharedOutcomes",
      "playerOutcomes",
      "sharedStats",
      "playerStats",
      "characterSelectionPlan",
      ...slots,
      "threadDesign",
      "title",
      "characterSelectionIntroduction",
      "imageInstructions",
    ]);
    expect(properties(schema, ["properties", "guidelines"])).toEqual(["world", "rules", "tone", "conflicts", "decisions"]);
    expect(properties(schema, ["properties", "threadDesign"])).toEqual(["typesOfThreads", "switchAndThreadInstructions"]);
    expect(properties(schema, ["properties", "playerOutcomes"])).toEqual(slots);
    expect(properties(schema, ["properties", "player1"])).toEqual(["possibleCharacterIdentities", "possibleCharacterBackgrounds"]);
    // Without proposal 1's seat roles, the plan keeps production's coordination field
    expect(properties(schema, ["properties", "characterSelectionPlan"])).toEqual(["multiplayerCoordination", "playerStatConversionRates", "backgroundArchetypes"]);
    // The empty milestone lists are added back in assembly, the stat groups recomputed there
    expect(properties(schema, ["properties", "sharedOutcomes", "items"])).not.toContain("milestones");
    expect(properties(schema)).not.toContain("statGroups");
  });

  it.each(KIND_INPUTS)("%s, %i players, %s: one instance each for stats, outcomes, outcome lists and seats", (kind, players, mode) => {
    const schema = json(round2("generationOrder", players, mode, kind).schema);
    expect(find(schema, ["properties", "playerStats", "items"])).toEqual({ $ref: "#/properties/sharedStats/items" });
    expect(find(schema, ["properties", "playerOutcomes", "properties", "player1", "items"])).toEqual({ $ref: "#/properties/sharedOutcomes/items" });
    for (const slot of slotsOf(players).slice(1)) {
      expect(find(schema, ["properties", "playerOutcomes", "properties", slot])).toEqual({ $ref: "#/properties/playerOutcomes/properties/player1" });
      expect(find(schema, ["properties", slot])).toEqual({ $ref: "#/properties/player1" });
    }
  });

  it.each(KIND_INPUTS)("%s, %i players, %s: every field carries arm A's text (the same prompt text in both orders)", (kind, players, mode) => {
    const [a, b] = [json(round2("fieldOrder", players, mode, kind).schema), json(round2("generationOrder", players, mode, kind).schema)];
    const text = (schema: unknown, path: string[]) => (find(schema, path) as { description?: string }).description;
    expect(text(b, ["properties", "threadDesign", "properties", "typesOfThreads"])).toBe(text(a, ["properties", "guidelines", "properties", "typesOfThreads"]));
    expect(text(b, ["properties", "threadDesign", "properties", "switchAndThreadInstructions"])).toBe(
      text(a, ["properties", "guidelines", "properties", "switchAndThreadInstructions"])?.replace(`\n${INSTRUCTIONS_FALLBACK}`, "")
    );
    expect(find(b, ["properties", "sharedStats", "items"])).toEqual(find(a, ["properties", "sharedStats", "items"]));
    const outcome = find(a, ["properties", "sharedOutcomes", "items"]) as { properties: Record<string, unknown>; required: string[] };
    const withoutMilestones = { ...outcome, properties: Object.fromEntries(Object.entries(outcome.properties).filter(([key]) => key !== "milestones")), required: outcome.required.filter((key) => key !== "milestones") };
    expect(find(b, ["properties", "sharedOutcomes", "items"])).toEqual(withoutMilestones);
    expect(text(b, ["properties", "playerOutcomes", "properties", "player1"])).toBe(text(a, ["properties", "player1", "properties", "outcomes"]));
    for (const key of ["storyElements", "characterSelectionPlan", "title", "characterSelectionIntroduction", "imageInstructions"]) {
      expect({ key, b: find(b, ["properties", key]) }).toEqual({ key, b: find(a, ["properties", key]) });
    }
  });

  describe("assembly into the fields saved today", () => {
    const outcome = (id: string) => ({
      id,
      question: `Will ${id} happen?`,
      possibleResolutions: { favorable: "yes", unfavorable: "no", mixed: "partly" },
      resonance: "It matters.",
      intendedNumberOfMilestones: 2,
    });
    const stat = (id: string, group: string) => ({
      type: "percentage",
      name: id,
      id,
      possibleValues: "",
      effectOnPoints: ["Above 70%: +10 in social challenges", "Below 30%: -10 in social challenges"],
      optionsToSacrifice: "Spend 10%",
      optionsToGainAsReward: "Regain 10%",
      canBeChangedInBeatResolutions: true,
      narrativeImplications: ["At 20% or below: the next switch forces a thread about rest."],
      adjustmentsAfterThreads: ["+10% after a favorable challenge thread"],
      isVisible: true,
      partOfPlayerBackgrounds: true,
      initialValue: 50,
      tooltip: "How rested you are.",
      group,
    });
    const seat = (slot: string) => ({
      possibleCharacterIdentities: [1, 2, 3].map((i) => ({ name: `${slot} ${i}`, pronouns: { personal: "they", object: "them", possessive: "their", reflexive: "themselves" }, appearance: "tall" })),
      possibleCharacterBackgrounds: [1, 2, 3].map((i) => ({ title: `B${i}`, fluffTemplate: "{name} bakes.", initialPlayerStatValues: [{ statId: "player_energy", value: 50 }] })),
    });
    const reply = (players: PlayerCount, kind: "story" | "template") => ({
      guidelines: { world: "A market.", rules: ["One oven."], tone: ["Warm."], conflicts: ["Share or win."], decisions: ["Who bakes first."] },
      ...(kind === "story" ? { difficultyLevel: { modifier: 0, title: "Even" } } : { difficultyLevels: [{ modifier: 0, title: "Even" }], teaser: "Bread." }),
      storyElements: [{ id: "oven", name: "The Oven", role: "Prize", instructions: "Hot.", appearance: "Iron.", facts: ["Old.", "Big.", "Cracked."] }],
      sharedOutcomes: players > 1 ? [outcome("shared_oven")] : [],
      playerOutcomes: Object.fromEntries(slotsOf(players).map((slot) => [slot, [outcome(`${slot}_loaf`), outcome(`${slot}_friend`)]])),
      sharedStats: [stat("shared_heat", "Market"), stat("shared_crowd", "")],
      playerStats: [stat("player_energy", "Baker"), stat("player_flour", "Market")],
      characterSelectionPlan: { multiplayerCoordination: [], playerStatConversionRates: ["10 energy is 1 flour"], backgroundArchetypes: ["a", "b", "c"] },
      ...Object.fromEntries(slotsOf(players).map((slot) => [slot, seat(slot)])),
      threadDesign: { typesOfThreads: ["Bake-off (challenge, 3): win the crowd"], switchAndThreadInstructions: ["The first thread is about the oven."] },
      title: "The Oven",
      characterSelectionIntroduction: { title: "Who bakes?", text: "You are..." },
      imageInstructions: { visualStyle: "warm", atmosphere: "busy", colorPalette: "golden", settingDetails: "stalls", characterStyle: "round", artInfluences: "soft", coverPrompt: "A market oven" },
    });

    it.each(KIND_INPUTS)("%s, %i players, %s: parses with production's own setup schema, in production's key order", (kind, players) => {
      const assembled = assembleGenerationOrder(reply(players, kind), players, kind);
      const productionSchema = createStorySetupSchema(players, kind);
      expect(productionSchema.safeParse(assembled).success).toBe(true);
      expect(Object.keys(assembled)).toEqual(Object.keys(productionSchema.shape));
    });

    it("puts the thread design back into the guidelines, each seat's outcomes back on its seat, and empty milestone lists on every outcome", () => {
      const assembled = assembleGenerationOrder(reply(2, "story"), 2, "story") as Record<string, Record<string, unknown>>;
      expect(Object.keys(assembled.guidelines)).toEqual(["world", "rules", "tone", "conflicts", "decisions", "typesOfThreads", "switchAndThreadInstructions"]);
      expect(assembled.guidelines.typesOfThreads).toEqual(["Bake-off (challenge, 3): win the crowd"]);
      expect(Object.keys(assembled.player2)).toEqual(["outcomes", "possibleCharacterIdentities", "possibleCharacterBackgrounds"]);
      expect((assembled.player2.outcomes as { id: string }[]).map((o) => o.id)).toEqual(["player2_loaf", "player2_friend"]);
      const outcomes = [...(assembled.sharedOutcomes as unknown as object[]), ...(assembled.player1.outcomes as object[]), ...(assembled.player2.outcomes as object[])];
      expect(outcomes.every((o) => Array.isArray((o as { milestones?: unknown }).milestones) && (o as { milestones: unknown[] }).milestones.length === 0)).toBe(true);
      expect(assembled).not.toHaveProperty("playerOutcomes");
      expect(assembled).not.toHaveProperty("threadDesign");
    });

    it("recomputes the stat groups from each stat's group, as template generation does", () => {
      const assembled = assembleGenerationOrder(reply(1, "template"), 1, "template") as { statGroups: string[] };
      expect(assembled.statGroups).toEqual(["Market", "Baker"]);
      const ungrouped = reply(1, "story");
      for (const s of [...ungrouped.sharedStats, ...ungrouped.playerStats]) s.group = "";
      expect((assembleGenerationOrder(ungrouped, 1, "story") as { statGroups: string[] }).statGroups).toEqual(["General"]);
    });

    it("comes with arm B's request and not with arm A's", () => {
      expect(round2("generationOrder", 2, GameModes.Competitive).assemble).toBeDefined();
      expect(round2("fieldOrder", 2, GameModes.Competitive).assemble).toBeUndefined();
      const request = round2("generationOrder", 3, GameModes.Cooperative, "template");
      expect(request.assemble?.(reply(3, "template"))).toEqual(assembleGenerationOrder(reply(3, "template"), 3, "template"));
    });
  });
});

describe("AI Iteration on round 2 (arm A's text: A9 keeps iteration on today's field list and order)", () => {
  it.each(INPUTS)("%i players, %s: every section set builds, cut as production cuts it", (players, mode) => {
    for (const sections of SECTION_SETS) {
      const request = iterationRound2Request(FEEDBACK, players, mode, 25, sections, TEMPLATE);
      const base1 = iterationRequestFromRound1(FEEDBACK, players, mode, 25, sections, TEMPLATE, PASSING_ROUND1_PARTS);
      expect(Object.keys(find(json(request.schema), ["properties"]) as object)).toEqual(Object.keys(find(json(base1.schema), ["properties"]) as object));
      expect(request.prompt).toBe(base1.prompt.replace(/Narrative Thresholds and Implications\.\n[\s\S]*?\(e\.g\., "1000\+ gold represents upper class status"\)\n/, `${NARRATIVE_PROMPT_LINE}\n`));
      // The fallback line only where the stats are written in the same reply, after the rules
      const text = descriptions(request.schema);
      expect(occurrences(text, INSTRUCTIONS_FALLBACK)).toBe(sections.includes("guidelines") && sections.includes("stats") ? 1 : 0);
      expect(occurrences(text, "Two to four rules that the story's planners apply between threads")).toBe(sections.includes("guidelines") ? 1 : 0);
      expect(occurrences(text, "One to three thresholds, each with what the story must do")).toBe(sections.includes("stats") ? 1 : 0);
    }
  });

  it("leaves production's iteration without examples, as the base does", () => {
    const prompt = iterationRound2Request(FEEDBACK, 2, GameModes.Competitive, 25, ALL_SECTIONS, TEMPLATE).prompt;
    expect(prompt).not.toContain("EXAMPLE STAT SETUPS");
    expect(StorySetupPromptService.createIterationPrompt(FEEDBACK, 2, GameModes.Competitive, 25, ALL_SECTIONS, TEMPLATE)).not.toContain("EXAMPLE STAT SETUPS");
  });
});
