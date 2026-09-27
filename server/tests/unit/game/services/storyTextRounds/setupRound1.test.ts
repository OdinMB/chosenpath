import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { z } from "zod";
import { GameModes, type GameMode, type PlayerCount } from "core/types/index.js";
import { partialTemplateSchema, setupStep } from "../../../../../src/game/services/storyTextSteps.js";
import { StorySetupPromptService } from "../../../../../src/game/services/prompts/StorySetupPromptService.js";
import { NO_EMPTY_ITEMS } from "../../../../../src/game/services/storyTextRewrite/common.js";
import {
  ENGINE_HEADING,
  NO_BLANK_ITEMS,
  THIS_SETUP_HEADING,
  WORKED_EXAMPLE_HEADING,
  cutToSections,
  iterationRound1Request,
  round1SetupSchema,
  setupRound1Request,
} from "../../../../../src/game/services/storyTextRounds/setupRound1.js";
import { slotsOf } from "../../../../helpers/promptStories.js";
import { countKeywords, descriptionsOf, find } from "../storyTextRewrite/rewriteChecks.js";

const PREMISE = "Two rival bakers share one oven in a floating market";
const MULTIPLAYER_MODES: GameMode[] = [GameModes.Cooperative, GameModes.Competitive, GameModes.CooperativeCompetitive];
const INPUTS: [PlayerCount, GameMode][] = [
  [1, GameModes.SinglePlayer],
  ...([2, 3] as PlayerCount[]).flatMap((players) => MULTIPLAYER_MODES.map((mode): [PlayerCount, GameMode] => [players, mode])),
];
const KINDS = ["story", "template"] as const;
const KIND_INPUTS = KINDS.flatMap((kind) => INPUTS.map(([players, mode]) => [kind, players, mode] as const));

const ALL_SECTIONS = ["guidelines", "storyElements", "sharedOutcomes", "stats", "players", "media", "difficultyLevels"];
const SECTION_SETS: string[][] = [ALL_SECTIONS, ["sharedOutcomes", "players"], ["players"], ["sharedOutcomes"], ["stats"], ["guidelines"]];
const TEMPLATE = { title: "The Oven", gameMode: "competitive", creatorId: "u1", creatorUsername: "someone", sharedOutcomes: [] };
const FEEDBACK = "Make the rivalry sharper";

const round1 = (players: PlayerCount, mode: GameMode, kind: "story" | "template" = "story") => setupRound1Request(PREMISE, players, mode, 25, kind);
const production = (players: PlayerCount, mode: GameMode, kind: "story" | "template" = "story") => setupStep.request(PREMISE, players, mode, 25, kind);
const iteration = (players: PlayerCount, mode: GameMode, sections: string[]) =>
  iterationRound1Request(FEEDBACK, players, mode, 25, sections, TEMPLATE);

const occurrences = (text: string, pattern: string) => text.split(pattern).length - 1;
const descriptions = (schema: Parameters<typeof toJsonSchema>[0]) => descriptionsOf(toJsonSchema(schema)).join("\n");
const isContestMode = (mode: GameMode) => mode === GameModes.Competitive || mode === GameModes.CooperativeCompetitive;

describe("setupRound1Request builds", () => {
  it.each(KIND_INPUTS)("%s, %i players, %s: one message with a schema that converts", (kind, players, mode) => {
    const request = round1(players, mode, kind);
    expect(request.prompt).toContain(`<premise>\n${PREMISE}\n</premise>`);
    expect(() => toJsonSchema(request.schema)).not.toThrow();
  });

  it.each(INPUTS)("iteration, %i players, %s: every section set builds", (players, mode) => {
    for (const sections of SECTION_SETS) {
      const request = iteration(players, mode, sections);
      expect(request.prompt).toContain(`<feedback>\n${FEEDBACK}\n</feedback>`);
      expect(request.prompt).not.toContain("creatorUsername");
      expect(() => toJsonSchema(request.schema)).not.toThrow();
    }
  });
});

type Part = "prompt" | "schema";
type On = { players: number; mode: GameMode; kind: "story" | "template" | "iteration"; sections: string[] };
type Rule = { id: string; part: Part; applies: (on: On) => boolean; pattern: string };

const has = (on: On, ...sections: string[]) => sections.some((s) => on.sections.includes(s));
const outcomesAsked = (on: On) => has(on, "sharedOutcomes", "players");
/** Both outcome lists are written anew: a new setup, or an iteration that regenerates both */
const bothOutcomeLists = (on: On) => on.kind !== "iteration" || (has(on, "sharedOutcomes") && has(on, "players"));
/** The per-call slate prints for a new setup, and for an iteration that regenerates outcomes or stats */
const slateAsked = (on: On) => on.kind !== "iteration" || has(on, "sharedOutcomes", "players", "stats");
/** The stat instructions print for the stats and the players sections (backgrounds carry stat values) */
const statsAsked = (on: On) => has(on, "stats", "players");
/** The stat fields exist only where the stat lists do */
const statsListed = (on: On) => has(on, "stats");
const always = () => true;
const multiplayer = (on: On) => on.players > 1;
const contest = (on: On) => on.players > 1 && isContestMode(on.mode);

/** One entry per proposal's key rule (setup doc section 3 and Appendix A), with where it belongs. */
const RULES: Rule[] = [
  // Proposal 3: the engine block, right after the opening line
  { id: "A3.1 engine facts", part: "prompt", applies: always, pattern: ENGINE_HEADING },
  { id: "A3.1 real roll", part: "prompt", applies: always, pattern: "at most two stats, each between -15 and +15" },
  { id: "A3.1 no restating", part: "prompt", applies: always, pattern: "These are facts about the engine. Don't restate them anywhere in the setup." },
  { id: "A3.2 effect scale", part: "schema", applies: statsListed, pattern: "+5 slight, +10 clear, +15 decisive" },
  // Proposal 1: outcome slates
  { id: "A1.1 inventory pointer", part: "prompt", applies: outcomesAsked, pattern: 'see the Outcomes section below and the "This setup" block at the end' },
  { id: "A1.2 fixed outcomes section", part: "prompt", applies: outcomesAsked, pattern: "Outcomes are the questions the ending answers." },
  { id: "A1.2 shared budget", part: "prompt", applies: (on) => multiplayer(on) && outcomesAsked(on), pattern: "one or two shared outcomes, never more" },
  { id: "A1.2 seat roles", part: "prompt", applies: (on) => multiplayer(on) && outcomesAsked(on), pattern: "Each player seat has its own role in this story" },
  { id: "A1.2 no two players alike", part: "prompt", applies: (on) => multiplayer(on) && outcomesAsked(on), pattern: "no two players get the same personal outcome" },
  // S8 for every player count: a premise-named protagonist keeps the name across the seat's identities
  { id: "S8 premise names", part: "prompt", applies: outcomesAsked, pattern: "three identities that keep the name and vary in appearance and details" },
  { id: "A1.3 this setup", part: "prompt", applies: slateAsked, pattern: `\n${THIS_SETUP_HEADING}\n` },
  { id: "A1.3 single player", part: "prompt", applies: (on) => on.players === 1 && slateAsked(on) && bothOutcomeLists(on), pattern: "No shared outcomes. The player has three outcomes of their own" },
  // An iteration that keeps one outcome list: an older single-player template may hold outcomes in its shared list
  { id: "A1.6 single player, one list kept", part: "prompt", applies: (on) => on.players === 1 && slateAsked(on) && !bothOutcomeLists(on), pattern: "The player has three outcomes in all, whether this template keeps them in player1's list or in its shared list" },
  { id: "A1.4 roles in the plan", part: "schema", applies: (on) => multiplayer(on) && has(on, "players"), pattern: "give each player seat its own role in this story" },
  { id: "A1.4 role in backgrounds", part: "schema", applies: (on) => multiplayer(on) && has(on, "players"), pattern: "In multiplayer games, name the seat's role in the story." },
  { id: "A1.4 own outcomes", part: "schema", applies: (on) => has(on, "players"), pattern: "This player's own outcomes." },
  { id: "A1.4 shared outcomes", part: "schema", applies: (on) => multiplayer(on) && has(on, "sharedOutcomes"), pattern: "Outcomes that concern all players" },
  { id: "A1.4 single-player template", part: "schema", applies: (on) => on.players === 1 && on.kind === "iteration" && has(on, "sharedOutcomes") && has(on, "players"), pattern: "Single-player template: leave this list empty" },
  { id: "A1.6 single-player shared list kept", part: "schema", applies: (on) => on.players === 1 && on.kind === "iteration" && has(on, "sharedOutcomes") && !has(on, "players"), pattern: "keep the template's shared outcomes" },
  // Proposal 2: scoreboards, in the contest modes only
  { id: "A2.1 two-player scoreboard", part: "prompt", applies: (on) => contest(on) && on.players === 2 && has(on, "stats"), pattern: "exactly one shared opposites stat that shows who is ahead" },
  // The three-player slate (A1.3) points back to this rule instead of restating it
  { id: "A2.1 three-player scoreboard", part: "prompt", applies: (on) => contest(on) && on.players === 3 && has(on, "stats"), pattern: "--- A scoreboard for each contested shared outcome: one shared string stat whose values name who currently leads" },
  { id: "A2.1 lead string's values", part: "prompt", applies: (on) => contest(on) && on.players === 3 && has(on, "stats"), pattern: 'plus "Nobody yet"' },
  { id: "S8 on the scoreboard", part: "prompt", applies: (on) => contest(on) && has(on, "stats"), pattern: "the names the premise gives the player characters" },
  { id: "A2.1 scoreboard only after threads", part: "prompt", applies: (on) => contest(on) && has(on, "stats"), pattern: "so it is not adjustable anytime and has no sacrifice or reward" },
  { id: "A2.2 contested favor", part: "prompt", applies: (on) => contest(on) && statsAsked(on), pattern: "If the players compete for one NPC's favor, that favor is a contest" },
  { id: "A2.2 scored by", part: "prompt", applies: (on) => contest(on) && outcomesAsked(on), pattern: 'resonance ends with "Scored by' },
  { id: "A2.3 opposites scoreboard", part: "prompt", applies: (on) => contest(on) && on.players === 2 && statsAsked(on), pattern: "or the scoreboard of a two-player contest" },
  { id: "A2.4 shared stats", part: "schema", applies: (on) => contest(on) && has(on, "stats"), pattern: "one of these is the scoreboard of each contested shared outcome" },
  { id: "A2.4 names", part: "schema", applies: statsListed, pattern: "Never a player's seat ('Player 1') or a player character's name" },
  { id: "A3.2 scoreboard exception", part: "schema", applies: (on) => contest(on) && statsListed(on), pattern: "because milestones do that, except the scoreboard of a contested outcome" },
  // Proposal 4: stats that act in play
  { id: "A4.1 two ways", part: "prompt", applies: statsAsked, pattern: "Every stat earns its place in play in at least two ways" },
  { id: "A4.1 no progress meters", part: "prompt", applies: statsAsked, pattern: "- No progress meters" },
  { id: "A4.1 scoreboard exception", part: "prompt", applies: (on) => contest(on) && statsAsked(on), pattern: "No progress meters (the one exception is the scoreboard of a contested outcome)." },
  { id: "A4.1 player stats are the person", part: "prompt", applies: statsAsked, pattern: "Player stats are about the person" },
  { id: "A4.1 one shared relationship", part: "prompt", applies: (on) => multiplayer(on) && statsAsked(on), pattern: "A relationship between the player characters themselves is one shared stat" },
  { id: "A4.1 group example", part: "prompt", applies: statsAsked, pattern: "Detective/City/Contacts (for a mystery story)" },
  { id: "A4.2 certain sacrifice", part: "schema", applies: statsListed, pattern: "The bonus is always the same, so never state it, and the loss is certain, never a risk." },
  // The flag in the stat view's own labels (StoryStatePromptService's detailed view), and apart from sacrifices and rewards
  { id: "A4.2 flag label, true", part: "schema", applies: statsListed, pattern: "'Can be adjusted anytime'" },
  { id: "A4.2 flag label, false", part: "schema", applies: statsListed, pattern: "'Can only be changed when a thread gets resolved or through sacrifice/reward options'" },
  { id: "A4.2 flag apart from sacrifices", part: "schema", applies: statsListed, pattern: "A stat that is not adjustable anytime still gets a sacrifice." },
  { id: "A4.2 scoreboard None", part: "schema", applies: (on) => contest(on) && statsListed(on), pattern: "or a contested outcome's scoreboard" },
  { id: "A4.2 tooltip", part: "schema", applies: statsListed, pattern: "No disclaimers about what it does not mean." },
  // Proposal 5: one worked example, one line per stat type
  { id: "A5 worked example", part: "prompt", applies: always, pattern: WORKED_EXAMPLE_HEADING },
  { id: "A5 stat types", part: "prompt", applies: statsAsked, pattern: "Stat types\n- string: a state that changes in steps" },
  // Proposal 6: questions that name what is at stake
  { id: "A6.1 one thing", part: "schema", applies: outcomesAsked, pattern: "Ask about one thing, in the story's own names" },
  { id: "A6.2 resonance", part: "schema", applies: outcomesAsked, pattern: "Personal outcome: which need, fear, hope, relationship or secret" },
  { id: "A6.2 shared resonance", part: "schema", applies: (on) => multiplayer(on) && outcomesAsked(on), pattern: "what each player, by role, stands to gain or lose, and why they can't settle it alone" },
  { id: "A6.2 contested resonance", part: "schema", applies: (on) => contest(on) && outcomesAsked(on), pattern: "Contested outcome: what drives each side" },
  { id: "A6.3 three paths", part: "schema", applies: outcomesAsked, pattern: "Exploration threads offer these paths as choices" },
  // Round 1's one sentence about blank items
  { id: "no blank items", part: "prompt", applies: always, pattern: NO_BLANK_ITEMS },
];

/** The game-mode sentence of A1.5, per mode (a rule of its own for each mode). */
const MODE_SENTENCES: Record<string, string> = {
  [GameModes.Cooperative]: "At least one shared outcome is a goal they can only reach together.",
  [GameModes.Competitive]: "At least one shared outcome is contested between them",
  [GameModes.CooperativeCompetitive]: "compete over one contested shared outcome, and each has a private arc",
};

function expectRules(prompt: string, schemaText: string, on: On) {
  const parts: Record<Part, string> = { prompt, schema: schemaText };
  const rules = [
    ...RULES,
    ...Object.entries(MODE_SENTENCES).map(([mode, pattern]): Rule => ({ id: `A1.5 ${mode}`, part: "prompt", applies: (o) => o.mode === mode, pattern })),
  ];
  for (const rule of rules) {
    const found = { prompt: occurrences(parts.prompt, rule.pattern), schema: occurrences(parts.schema, rule.pattern) };
    const expected = { prompt: 0, schema: 0, ...(rule.applies(on) ? { [rule.part]: 1 } : {}) };
    expect({ rule: rule.id, found }).toEqual({ rule: rule.id, found: expected });
  }
}

describe("each proposal's key rule, once where it applies and nowhere else", () => {
  it.each(KIND_INPUTS)("%s, %i players, %s", (kind, players, mode) => {
    const request = round1(players, mode, kind);
    expectRules(request.prompt, descriptions(request.schema), { players, mode, kind, sections: ALL_SECTIONS });
  });

  it.each(INPUTS)("iteration, %i players, %s, every section set", (players, mode) => {
    for (const sections of SECTION_SETS) {
      const request = iteration(players, mode, sections);
      expectRules(request.prompt, descriptions(request.schema), { players, mode, kind: "iteration", sections });
    }
  });
});

/** Production passages round 1 replaces, with the proposal that replaces each. */
const REPLACED_IN_PROMPT: [string, string, (players: number) => boolean][] = [
  ["A1.1 the outcome budget", "A total of 3 outcomes for each player", () => true],
  ["A1.1 three shared, none individual", "there should be 0 individual outcomes", () => true],
  ["A1.2 the multiplayer outcome block", "Every player should have 3 outcomes as the sum of individual and shared outcomes", (p) => p > 1],
  ["A1.2 the single-player outcome block", "The player should have 3 outcomes, with a total of 6 milestones", (p) => p === 1],
  ["A2.1 the score line", "Stats to track the score about things that players compete over", (p) => p > 1],
  ["A2.3 playerA|playerB", "playerA|playerB territory control", () => true],
  ["A3.1 the old engine paragraph", "Context for additional stat parameters", () => true],
  ["A3.2 +/-10 and +/-20", "+/-10 for minor effects, +/-20 for major effects", () => true],
  ["A4.1 the don't-use-stats lines", "Don't use stats for things that are covered by other mechanics.", () => true],
  ["A4.1 counters", "Counters (e.g., wins in a tournament, number of people saved)", () => true],
  ["A4.1 the progress-inviting group example", "Detective/Investigation/Contacts", () => true],
  ["A5 the two example stat setups", "EXAMPLE STAT SETUPS", () => true],
  ["A5 the for-each-stat block", "For each stat, you must define:", () => true],
  ["A5 the long type catalogue", "Type of stats and what they are good for:", () => true],
  ["A6 the Alex example", "Does Alex choose loyalty to the family or their own ambitions?", (p) => p > 1],
];

const REPLACED_IN_SCHEMA: [string, string, (players: number) => boolean][] = [
  ["A1.4 the shared-outcome description", "Shared outcomes that (together with individual outcomes) will make up the endings", () => true],
  ["A2.4 the consider-a-score hint", "consider adding an opposite stat to track who is in the lead", () => true],
  ["A3.2 the stat's +/-10 and +/-20", "typically +/-10 for minor influences", () => true],
  ["A3.2 at least 3 effects", "Remember: at least 3 items in this list!", () => true],
  ["A3.2 the progress clause", "Don't use stats to directly track progress toward outcomes", () => true],
  ["A4.2 the long-term None rule", "if the stat represents a large, long-term aspect of the story", () => true],
  ["A4.2 the Cecay typo", "Cecay patterns", () => true],
  ["A4.2 the flag's after-threads-only reading", "If false, the stat can only be changed after threads are resolved.", () => true],
  ["A6.1 the copied example", "Do the players successfully prevent the ritual?", () => true],
  ["A6.1 the three-path Alex example", "Example: Does Alex choose loyalty to the family or their own ambitions?", () => true],
];

describe("production passages round 1 replaces are gone (and were there)", () => {
  it.each(KIND_INPUTS)("%s, %i players, %s", (kind, players, mode) => {
    const [ours, theirs] = [round1(players, mode, kind), production(players, mode, kind)];
    for (const [id, passage, applies] of REPLACED_IN_PROMPT) {
      expect({ id, inProduction: theirs.prompt.includes(passage) || !applies(players), inRound1: ours.prompt.includes(passage) }).toEqual({ id, inProduction: true, inRound1: false });
    }
    for (const [id, passage] of REPLACED_IN_SCHEMA) {
      expect({ id, inProduction: descriptions(theirs.schema).includes(passage), inRound1: descriptions(ours.schema).includes(passage) }).toEqual({ id, inProduction: true, inRound1: false });
    }
  });
});

/** Production's game-mode sentences (StorySetupPromptService GAME_MODE_DESCRIPTIONS), which A1.5 replaces */
const PRODUCTION_MODE_SENTENCES: Record<string, string[]> = {
  [GameModes.Competitive]: ["The players in this game are competing against each other.", "at least one competing goal or interest and no shared goals."],
  [GameModes.Cooperative]: ["The players in this game are cooperating with each other.", "but these should not conflict with the shared objective."],
  [GameModes.CooperativeCompetitive]: [
    "The players in this game have a mix of cooperative and competitive elements.",
    "Include both shared goals/assets/interests that require collaboration AND individual goals",
  ],
};

describe("production's game-mode sentences are gone (and were there)", () => {
  it.each(INPUTS.filter(([players]) => players > 1))("%i players, %s: custom story, template and AI Iteration", (players, mode) => {
    const pairs: [string, string, string][] = [
      ...KINDS.map((kind): [string, string, string] => [kind, round1(players, mode, kind).prompt, production(players, mode, kind).prompt]),
      ["iteration", iteration(players, mode, ALL_SECTIONS).prompt, StorySetupPromptService.createIterationPrompt(FEEDBACK, players, mode, 25, ALL_SECTIONS, TEMPLATE)],
    ];
    for (const [kind, ours, theirs] of pairs) {
      for (const sentence of PRODUCTION_MODE_SENTENCES[mode]) {
        expect({ kind, sentence, inProduction: theirs.includes(sentence), inRound1: ours.includes(sentence) }).toEqual({ kind, sentence, inProduction: true, inRound1: false });
      }
    }
  });
});

describe("the can-change-in-beats flag, as the stat view reads it", () => {
  /** Readings of the flag that let "not adjustable anytime" stand for "no sacrifice or reward" */
  const OLD_READINGS = ["must not change within one scene", "changeable in beats", "cannot be changed in beat resolutions"];

  it.each(KIND_INPUTS)("%s, %i players, %s: no text reads the flag as 'no sacrifice or reward'", (kind, players, mode) => {
    const request = round1(players, mode, kind);
    for (const text of OLD_READINGS) {
      expect({ text, prompt: request.prompt.includes(text), schema: descriptions(request.schema).includes(text) }).toEqual({ text, prompt: false, schema: false });
    }
  });

  it("names the two labels the beats' stat view prints", () => {
    // StoryStatePromptService's detailed stat view, for canBeChangedInBeatResolutions true and false
    const flag = find(toJsonSchema(round1(1, GameModes.SinglePlayer).schema), ["properties", "sharedStats", "items", "properties", "canBeChangedInBeatResolutions"]) as { description: string };
    expect(flag.description).toContain("'Can be adjusted anytime'");
    expect(flag.description).toContain("'Can only be changed when a thread gets resolved or through sacrifice/reward options'");
  });
});

describe("what round 1 keeps from production, byte for byte", () => {
  /** The prompt from one production heading to the next, both included in production's own order. */
  const slice = (prompt: string, from: string, to: string) => {
    const start = prompt.indexOf(from);
    const end = prompt.indexOf(to, start);
    if (start < 0 || end < 0) throw new Error(`${from} .. ${to} not found`);
    return prompt.slice(start, end);
  };

  it.each(KIND_INPUTS)("%s, %i players, %s: inclusivity, story elements, character selection and difficulty", (kind, players, mode) => {
    // Round 1's one added sentence sits right before the separator
    const ours = round1(players, mode, kind).prompt.replace(`${NO_BLANK_ITEMS}\n\n`, "");
    const theirs = production(players, mode, kind).prompt;
    for (const [from, to] of [
      ["Inclusivity and diversity", "Include the following elements:"],
      ["Story elements\n", "STATS\n"],
      ["Character Selection Instructions", "#".repeat(50)],
      ["<premise>", "</premise>"],
    ]) {
      expect(slice(ours, from, to)).toBe(slice(theirs, from, to));
    }
  });

  it.each(KIND_INPUTS)("%s, %i players, %s: the engine block follows production's opening line, and the configuration keeps its lines", (kind, players, mode) => {
    const [ours, theirs] = [round1(players, mode, kind).prompt, production(players, mode, kind).prompt];
    const opening = theirs.slice(0, theirs.indexOf("\n\n") + 2);
    expect(ours.startsWith(`${opening}${ENGINE_HEADING}\n`)).toBe(true);
    expect(ours).toContain(`Number of players: ${players}\nGame mode: `);
    // The per-call block sits right after the Game mode line, before the premise
    const gameModeLine = ours.indexOf("\nGame mode: ");
    const thisSetup = ours.indexOf(`\n\n${THIS_SETUP_HEADING}\n`);
    expect(thisSetup).toBeGreaterThan(gameModeLine);
    expect(ours.indexOf("\n", gameModeLine + 1)).toBe(thisSetup);
    expect(thisSetup).toBeLessThan(ours.indexOf("<premise>"));
  });

  it("uses the same sentence about blank items that the count fix measured", () => {
    expect(NO_BLANK_ITEMS).toBe(NO_EMPTY_ITEMS);
  });
});

describe("the per-call slate", () => {
  /** The "This setup" block of a request, without its heading. */
  const block = (prompt: string) => {
    const start = prompt.indexOf(`${THIS_SETUP_HEADING}\n`) + THIS_SETUP_HEADING.length + 1;
    return prompt.slice(start, prompt.indexOf("\n\n", start));
  };

  it.each(INPUTS)("%i players, %s: only this mode's and player count's lines", (players, mode) => {
    const text = block(round1(players, mode).prompt);
    const contested = isContestMode(mode);
    expect(text.includes("No shared outcomes.")).toBe(players === 1);
    expect(text.includes("no stat keeps a score")).toBe(mode === GameModes.Cooperative);
    expect(text.includes("No stat keeps a score.")).toBe(players === 1);
    expect(text.includes("Side A is player1's character, side B is player2's.")).toBe(contested && players === 2);
    expect(text.includes("resolution1, player1's character wins")).toBe(contested && players === 3);
    expect(text.includes("exactly one shared opposites stat")).toBe(contested && players === 2);
    expect(text.includes("one shared string stat that names who leads")).toBe(contested && players === 3);
    // Both point back to the scoreboard rule instead of restating it
    expect(text.includes("(see the scoreboard rule in the list of elements to include)")).toBe(contested && players > 1);
    expect(text).not.toContain('"Nobody yet"');
    expect(text.includes("One shared outcome the players can only achieve together")).toBe(mode === GameModes.CooperativeCompetitive);
    expect(text.includes("second shared outcome (2 milestones)")).toBe(mode === GameModes.Competitive && players === 2);
  });

  it.each(INPUTS)("%i players, %s: counts in words and milestone numbers, never the story length (proposal 10 is round 3)", (players, mode) => {
    const text = block(round1(players, mode).prompt);
    expect(text).toMatch(/earns about 6 milestones in total/);
    expect(text).not.toMatch(/Story length|turns/);
  });

  it.each([2, 3] as PlayerCount[])("%i players: an AI Iteration without stats points to no scoreboard rule it doesn't print", (players) => {
    const pointer = "(see the scoreboard rule in the list of elements to include)";
    expect(block(iteration(players, GameModes.Competitive, ["stats"]).prompt)).toContain(pointer);
    expect(block(iteration(players, GameModes.Competitive, ["sharedOutcomes", "players"]).prompt)).not.toContain(pointer);
    expect(block(iteration(players, GameModes.Competitive, ["sharedOutcomes", "players"]).prompt)).toContain("Keep the contested outcome's score in");
  });
});

describe("the schema", () => {
  const properties = (schema: Parameters<typeof toJsonSchema>[0]) => Object.keys(find(toJsonSchema(schema), ["properties"]) as object);

  it.each(KIND_INPUTS)("%s, %i players, %s: production's fields and key order, with no shared-outcome list for one player", (kind, players, mode) => {
    const theirs = properties(production(players, mode, kind).schema);
    const ours = properties(round1(players, mode, kind).schema);
    expect(ours).toEqual(players === 1 ? theirs.filter((key) => key !== "sharedOutcomes") : theirs);
    const player = (schema: Parameters<typeof toJsonSchema>[0]) => Object.keys(find(toJsonSchema(schema), ["properties", "player1", "properties"]) as object);
    expect(player(round1(players, mode, kind).schema)).toEqual(player(production(players, mode, kind).schema));
  });

  it.each(KIND_INPUTS)("%s, %i players, %s: caps only, no minItems anywhere, and the stat, outcome and player instances still shared", (kind, players, mode) => {
    const json = toJsonSchema(round1(players, mode, kind).schema);
    expect(countKeywords(json).filter((keyword) => keyword.startsWith("minItems"))).toEqual([]);
    expect(countKeywords(json).sort()).toEqual(
      [
        ...(players > 1 ? ["maxItems at .properties.sharedOutcomes"] : []),
        "maxItems at .properties.sharedStats.items.properties.effectOnPoints",
        "maxItems at .properties.sharedStats.items.properties.adjustmentsAfterThreads",
        "maxItems at .properties.player1.properties.outcomes",
      ].sort()
    );
    expect(find(json, ["properties", "playerStats", "items"])).toEqual({ $ref: "#/properties/sharedStats/items" });
    if (players > 1) expect(find(json, ["properties", "player1", "properties", "outcomes", "items"])).toEqual({ $ref: "#/properties/sharedOutcomes/items" });
    for (const slot of slotsOf(players).slice(1)) expect(find(json, ["properties", slot])).toEqual({ $ref: "#/properties/player1" });
  });

  /** An outcome reply with this milestone count, checked against a request's seat outcome instance. */
  const acceptsMilestones = (schema: z.ZodTypeAny, n: number) => {
    const player = (schema as z.AnyZodObject).shape.player1 as z.AnyZodObject;
    const outcome = (player.shape.outcomes as z.ZodArray<z.ZodTypeAny>).element;
    const reply = { id: "x", question: "Will it?", possibleResolutions: { favorable: "a", unfavorable: "b", mixed: "c" }, resonance: "r", milestones: [] };
    return outcome.safeParse({ ...reply, intendedNumberOfMilestones: n }).success;
  };

  it.each(KIND_INPUTS)("%s, %i players, %s: a milestone count is 1, 2 or 3 in generation", (kind, players, mode) => {
    const schema = round1(players, mode, kind).schema;
    expect([0, 1, 2, 3, 4].map((n) => acceptsMilestones(schema, n))).toEqual([false, true, true, true, false]);
    expect(acceptsMilestones(production(players, mode, kind).schema, 4)).toBe(true);
  });

  it("keeps a milestone count a number in AI Iteration, whose stored type the editor writes", () => {
    expect(acceptsMilestones(iteration(2, GameModes.Competitive, ["players"]).schema, 4)).toBe(true);
    const json = toJsonSchema(iteration(2, GameModes.Competitive, ["sharedOutcomes"]).schema);
    expect(find(json, ["properties", "sharedOutcomes", "items", "properties", "intendedNumberOfMilestones"])).toMatchObject({ type: "number" });
  });
});

describe("AI Iteration", () => {
  it.each(INPUTS)("%i players, %s: the template schema is cut to the sections as production cuts its own", (players, mode) => {
    for (const sections of SECTION_SETS) {
      const ours = Object.keys(find(toJsonSchema(iteration(players, mode, sections).schema), ["properties"]) as object);
      const theirs = Object.keys(find(toJsonSchema(partialTemplateSchema(sections, players)), ["properties"]) as object);
      expect({ sections, ours }).toEqual({ sections, ours: theirs });
    }
  });

  it("cuts a schema exactly as production's partialTemplateSchema does", () => {
    for (const sections of SECTION_SETS) {
      const cut = cutToSections(round1SetupSchema(2, GameModes.Competitive, "iteration"), sections, 2);
      expect(Object.keys(cut.shape)).toEqual(Object.keys(partialTemplateSchema(sections, 2).shape));
    }
  });

  it.each(INPUTS)("%i players, %s: says the number of players, and keeps ids", (players, mode) => {
    const prompt = iteration(players, mode, ["stats"]).prompt;
    expect(prompt).toContain(`\n\nNumber of players: ${players}\nGame mode: `);
    expect(occurrences(prompt, "Keep existing stats and outcomes under their current ids unless you remove them.")).toBe(1);
    expect(iteration(players, mode, ["guidelines"]).prompt).not.toContain("under their current ids");
  });

  it.each(INPUTS)("%i players, %s: fits one regenerated outcome list to the other, whatever the player count", (players, mode) => {
    // A single-player template made before round 1 can hold outcomes in its shared list (setup doc B13: gpt-4.1 16 of 16)
    const line = "You are regenerating only one of the shared outcomes and the player outcomes.";
    expect(occurrences(iteration(players, mode, ["sharedOutcomes"]).prompt, line)).toBe(1);
    expect(occurrences(iteration(players, mode, ["players"]).prompt, line)).toBe(1);
    expect(iteration(players, mode, ["sharedOutcomes", "players"]).prompt).not.toContain(line);
    expect(iteration(players, mode, ["stats"]).prompt).not.toContain(line);
  });

  it("folds a single-player template's shared outcomes into player1's when both lists are regenerated", () => {
    const shared = (sections: string[]) =>
      (find(toJsonSchema(iteration(1, GameModes.SinglePlayer, sections).schema), ["properties", "sharedOutcomes"]) as { description: string }).description;
    expect(shared(["sharedOutcomes", "players"])).toContain("fold any of the template's shared outcomes you keep into player1's three");
    // Regenerated alone, the shared list is kept, so a template whose outcomes are all shared keeps some
    expect(shared(["sharedOutcomes"])).not.toContain("leave this list empty");
  });

  it("puts the worked example where production puts its examples, before the character selection", () => {
    const prompt = iteration(2, GameModes.Competitive, ALL_SECTIONS).prompt;
    expect(prompt.indexOf(WORKED_EXAMPLE_HEADING)).toBeLessThan(prompt.indexOf("Character Selection Instructions"));
    expect(prompt.indexOf(WORKED_EXAMPLE_HEADING)).toBeGreaterThan(prompt.indexOf("Stat types\n"));
    // Production leaves its examples out of iteration; round 1 keeps its short one (setup doc A5)
    expect(StorySetupPromptService.createIterationPrompt(FEEDBACK, 2, GameModes.Competitive, 25, ALL_SECTIONS, TEMPLATE)).not.toContain("EXAMPLE STAT SETUPS");
  });
});

describe("the worked example", () => {
  it.each(KIND_INPUTS)("%s, %i players, %s: sits where production's examples sat, and every other part keeps its place", (kind, players, mode) => {
    const prompt = round1(players, mode, kind).prompt;
    const order = [
      ENGINE_HEADING, "Inclusivity and diversity", "Include the following elements:", "Outcomes\n- Outcomes are", "Story elements\n", "STATS\n", "Stat types\n",
      WORKED_EXAMPLE_HEADING, "Character Selection Instructions", "Difficulty Levels", NO_BLANK_ITEMS, "#".repeat(50), `\n${THIS_SETUP_HEADING}\n`, "<premise>",
    ];
    const at = order.map((marker) => prompt.indexOf(marker));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  describe("follows the rules it sits beside", () => {
    const request = round1(1, GameModes.SinglePlayer);
    const example = request.prompt.slice(request.prompt.indexOf(WORKED_EXAMPLE_HEADING), request.prompt.indexOf("Character Selection Instructions"));
    const between = (text: string, from: string, to: string) => {
      const start = text.indexOf(from) + from.length;
      return text.slice(start, text.indexOf(to, start));
    };
    const quoted = (text: string) => text.match(/"[^"]+"/g) ?? [];
    const statLines = example.split("\n").filter((line) => line.includes(" Effects: "));
    const threadTypes = quoted(between(example, "- Thread types", "- Switch and thread instructions:")).map((type) => type.slice(1).split(" (")[0].toLowerCase());
    const instructions = quoted(between(example, "- Switch and thread instructions:", "\n\nStory element"));

    it("reads its stats and thread types", () => {
      expect(statLines.length).toBe(3);
      expect(threadTypes).toEqual(["public protest", "secret negotiation", "sabotage", "rescue", "old friends", "a walk with mia"]);
    });

    it("gives every stat it shows two or three effects", () => {
      const effects = statLines.map((line) => quoted(between(line, " Effects: ", " Sacrifice: ")).length);
      expect(effects.every((n) => n >= 2 && n <= 3)).toBe(true);
    });

    it("keys every change after threads on a result, not on a thread type's name", () => {
      for (const line of statLines) {
        const after = line.slice(line.indexOf(" After threads: "));
        expect({ after, result: /\b(favorable|mixed|unfavorable)\b/.test(after), typeName: threadTypes.filter((name) => after.toLowerCase().includes(name)) }).toEqual({ after, result: true, typeName: [] });
      }
    });

    it("shows no more switch/thread instructions than the field asks for", () => {
      const field = find(toJsonSchema(request.schema), ["properties", "guidelines", "properties", "switchAndThreadInstructions"]) as { description: string };
      const most = Number(/Generate 0-(\d) instructions/.exec(field.description)?.[1]);
      expect(instructions.length).toBeGreaterThan(0);
      expect(instructions.length).toBeLessThanOrEqual(most);
    });

    it("states each steering rule once: no instruction repeats in a stat's narrative implications", () => {
      const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
      const rest = words(example.replace(between(example, "- Switch and thread instructions:", "\n\nStory element"), "")).join(" ");
      for (const instruction of instructions) {
        const own = words(instruction);
        const runs = own.slice(0, -5).map((_, i) => own.slice(i, i + 6).join(" "));
        expect({ instruction, repeated: runs.filter((run) => rest.includes(run)) }).toEqual({ instruction, repeated: [] });
      }
    });
  });

  it("is about 1,100 tokens, and the prompt loses about 3,700 against production's", () => {
    // Setup doc A5 and proposal 5: at the prompt's measured 4.65 characters per token
    const [ours, theirs] = [round1(1, GameModes.SinglePlayer).prompt, production(1, GameModes.SinglePlayer).prompt];
    const example = ours.slice(ours.indexOf(WORKED_EXAMPLE_HEADING), ours.indexOf("Character Selection Instructions"));
    expect(example.length / 4.65).toBeGreaterThan(900);
    expect(example.length / 4.65).toBeLessThan(1_300);
    expect((theirs.length - ours.length) / 4.65).toBeGreaterThan(2_500);
  });
});
