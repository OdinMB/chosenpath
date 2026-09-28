import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { GameModes, type GameMode, type PlayerCount } from "core/types/index.js";
import {
  ROUND1C_PARTS,
  ROUND3_PARTS,
  THIS_SETUP_HEADING,
  WORKED_EXAMPLE_HEADING,
  iterationRequestFromRound1,
} from "../../../../../src/game/services/storyTextRounds/setupRound1.js";
import { ROUND2B_BASE_PARTS, iterationRound2Request, setupRound2Request } from "../../../../../src/game/services/storyTextRounds/setupRound2.js";
import {
  CAMPS,
  KIDS_STATS,
  ROUND3_TEXT,
  slateMilestones,
  storyLengthLine,
  type SlateMode,
} from "../../../../../src/game/services/storyTextRounds/setupRound3Text.js";
import { slotsOf } from "../../../../helpers/promptStories.js";
import { countKeywords, descriptionsOf, find } from "../storyTextRewrite/rewriteChecks.js";

/*
 * Setup round 3 (DOCS/2026-09-27_setup-generation-improvements.md, round 3,
 * with the owner's notes of 2026-09-28): round 2b's arm B (the carried-forward
 * form) plus two-sided contests in every player count (no three-player race),
 * a smaller stat budget with plain names for stories read with a child, the
 * identity-name clause, no "energy" in the field examples, the story length
 * (proposal 10), and conflict rules and hook facts with NPC pronouns in the
 * role (proposal 11, S2).
 */

const PREMISE = "Two rival bakers share one oven in a floating market";
const MULTIPLAYER_MODES: GameMode[] = [GameModes.Cooperative, GameModes.Competitive, GameModes.CooperativeCompetitive];
const INPUTS: [PlayerCount, GameMode][] = [
  [1, GameModes.SinglePlayer],
  ...([2, 3] as PlayerCount[]).flatMap((players) => MULTIPLAYER_MODES.map((mode): [PlayerCount, GameMode] => [players, mode])),
];
const KINDS = ["story", "template"] as const;
const KIND_INPUTS = KINDS.flatMap((kind) => INPUTS.map(([players, mode]) => [kind, players, mode] as const));
const ALL_SECTIONS = ["guidelines", "storyElements", "sharedOutcomes", "stats", "players", "media", "difficultyLevels"];
const SECTION_SETS: string[][] = [ALL_SECTIONS, ["sharedOutcomes", "players"], ["players"], ["sharedOutcomes"], ["stats"], ["guidelines"], ["storyElements"]];
const TEMPLATE = { title: "The Oven", gameMode: "competitive", sharedOutcomes: [] };
const FEEDBACK = "Make the rivalry sharper";

const round3 = (players: PlayerCount, mode: GameMode, kind: "story" | "template" = "story", maxTurns = 25, kids = false) =>
  setupRound2Request(PREMISE, players, mode, maxTurns, kind, "generationOrder", ROUND3_PARTS, { kids });
const round2b = (players: PlayerCount, mode: GameMode, kind: "story" | "template" = "story", maxTurns = 25) =>
  setupRound2Request(PREMISE, players, mode, maxTurns, kind, "generationOrder", ROUND2B_BASE_PARTS);

const occurrences = (text: string, pattern: string) => text.split(pattern).length - 1;
const json = (schema: Parameters<typeof toJsonSchema>[0]) => toJsonSchema(schema);
const descriptions = (schema: Parameters<typeof toJsonSchema>[0]) => descriptionsOf(json(schema)).join("\n");
const isContestMode = (mode: GameMode) => mode === GameModes.Competitive || mode === GameModes.CooperativeCompetitive;
const everything = (request: { prompt: string; schema: Parameters<typeof toJsonSchema>[0] }) => `${request.prompt}\n${descriptions(request.schema)}`;
/** The "This setup" block of a request, without its heading. */
const block = (prompt: string) => {
  const start = prompt.indexOf(`${THIS_SETUP_HEADING}\n`) + THIS_SETUP_HEADING.length + 1;
  return prompt.slice(start, prompt.indexOf("\n\n", start));
};

describe("round 3 builds on round 2b's arm B", () => {
  it("is round 1c's parts with round 3's changes on", () => {
    expect(ROUND3_PARTS).toEqual({ ...ROUND1C_PARTS, round3: true });
  });

  it.each(KIND_INPUTS)("%s, %i players, %s: one message, a schema that converts, caps only, and the generation order's assembly", (kind, players, mode) => {
    const request = round3(players, mode, kind);
    expect(request.prompt).toContain(`<premise>\n${PREMISE}\n</premise>`);
    const schema = json(request.schema);
    expect(countKeywords(schema).filter((keyword) => keyword.startsWith("minItems"))).toEqual([]);
    expect(request.assemble).toBeDefined();
    // The same fields in the same order as the carried-forward form
    const keys = (s: Parameters<typeof toJsonSchema>[0]) => Object.keys(find(json(s), ["properties"]) as object);
    expect(keys(request.schema)).toEqual(keys(round2b(players, mode, kind).schema));
  });

  it.each(INPUTS)("iteration, %i players, %s: every section set builds", (players, mode) => {
    for (const sections of SECTION_SETS) {
      const request = iterationRound2Request(FEEDBACK, players, mode, 25, sections, TEMPLATE, ROUND3_PARTS);
      expect(() => json(request.schema)).not.toThrow();
      expect(request.prompt).toContain(`<feedback>\n${FEEDBACK}\n</feedback>`);
    }
  });

  it("leaves round 2b's requests as they ran", () => {
    for (const [players, mode] of INPUTS) {
      const ran = round2b(players, mode);
      expect(ran.prompt).not.toContain(ROUND3_TEXT.identityClauseOne);
      expect(ran.prompt).not.toContain("Story length:");
      expect(descriptions(ran.schema)).toContain("'Spend 10% energy'");
    }
  });
});

describe("two-sided contests only (owner, 2026-09-28: no three-or-more-party contests)", () => {
  it.each(INPUTS)("%i players, %s: no three-player race and no 'who leads' string anywhere", (players, mode) => {
    const text = everything(round3(players, mode));
    for (const gone of ["three-player race", "who leads", "Nobody yet", "resolution1, player1's character wins", "string to track which player currently has the most momentum"]) {
      expect({ gone, found: occurrences(text, gone) }).toEqual({ gone, found: 0 });
    }
  });

  it.each(INPUTS)("%i players, %s: three players with a contest form two camps with one opposites scoreboard", (players, mode) => {
    const request = round3(players, mode);
    const camps = players === 3 && isContestMode(mode);
    expect(occurrences(block(request.prompt), CAMPS)).toBe(camps ? 1 : 0);
    expect(block(request.prompt).includes("exactly one shared opposites stat")).toBe(players > 1 && isContestMode(mode));
    expect(occurrences(request.prompt, ROUND3_TEXT.campScoreboardStart)).toBe(camps ? 1 : 0);
    // The two-player scoreboard rule stays as it carried forward
    expect(occurrences(request.prompt, "exactly one shared opposites stat that shows who is ahead")).toBe(players === 2 && isContestMode(mode) ? 1 : 0);
    const text = descriptions(request.schema);
    // The resolutions name the camps where three players contest; two players keep round 1's sides
    expect(occurrences(text, ROUND3_TEXT.sideAWins)).toBe(camps ? 1 : 0);
    expect(occurrences(text, "Side A (player1's character in a two-player game) wins.")).toBe(camps ? 0 : 1);
    // The seat roles (the Outcomes section) and the engine facts say it once, where three players contest
    expect(occurrences(request.prompt, ROUND3_TEXT.rolesCamp)).toBe(camps ? 1 : 0);
    expect(occurrences(request.prompt, ROUND3_TEXT.engineCamps)).toBe(camps ? 1 : 0);
  });

  it("asks one question form of every contest: two sides, whether two players or two camps", () => {
    const text = descriptions(round3(3, GameModes.Competitive).schema);
    expect(occurrences(text, ROUND3_TEXT.questionForms)).toBe(1);
    expect(text).not.toContain("'Who / Which player …?'");
  });
});

describe("the story length (proposal 10)", () => {
  const MODES: [SlateMode, PlayerCount][] = [
    ["single", 1],
    ["cooperative", 2],
    ["cooperative", 3],
    ["competitive", 2],
    ["competitive", 3],
    ["bond", 2],
    ["cooperativeCompetitive", 2],
    ["cooperativeCompetitive", 3],
  ];

  it.each(MODES)("%s, %i players: each budget adds up to the milestones a player earns, at every story length", (mode, players) => {
    for (const M of [3, 4, 5, 6]) {
      const slate = slateMilestones(mode, M);
      const total = [slate.main, slate.bond ?? 0, slate.contest ?? 0, ...slate.personal].reduce((a, b) => a + b, 0);
      expect({ mode, players, M, total }).toEqual({ mode, players, M, total: M });
      // Every outcome carries 1 to 3 milestones, and the personal floor holds (2 down to M = 4, 1 at M = 3)
      // (a main of 0 is a mode without a main question or shared goal)
      const outcomes = [slate.main || undefined, slate.bond, slate.contest, ...slate.personal].filter((n): n is number => n !== undefined);
      expect(outcomes.every((n) => n >= 1 && n <= 3)).toBe(true);
      if (players > 1) expect(slate.personal.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(M <= 3 ? 1 : 2);
    }
  });

  it("follows the document's table at 25, 15 and 10 turns", () => {
    expect(slateMilestones("single", 6)).toEqual({ main: 3, personal: [2, 1] });
    expect(slateMilestones("single", 4)).toEqual({ main: 2, personal: [1, 1] });
    expect(slateMilestones("single", 3)).toEqual({ main: 1, personal: [1, 1] });
    expect(slateMilestones("cooperative", 3)).toEqual({ main: 1, personal: [2] });
    expect(slateMilestones("competitive", 4)).toEqual({ main: 0, contest: 2, personal: [1, 1] });
    expect(slateMilestones("bond", 6)).toEqual({ main: 0, contest: 2, bond: 2, personal: [2] });
    expect(slateMilestones("cooperativeCompetitive", 3)).toEqual({ main: 1, contest: 1, personal: [1] });
  });

  it.each(INPUTS)("%i players, %s: the slate opens with the story's length and says its budget", (players, mode) => {
    for (const [maxTurns, M] of [
      [25, 6],
      [10, 3],
      [15, 4],
    ] as const) {
      const text = block(round3(players, mode, "story", maxTurns).prompt);
      expect(text.startsWith(storyLengthLine(maxTurns, players > 1))).toBe(true);
      expect(text).toContain(`earns about ${M} milestones in total`);
      expect(occurrences(text, "earns about")).toBe(1);
    }
  });

  it("says a short story's single-player outcomes one milestone each", () => {
    expect(block(round3(1, GameModes.SinglePlayer, "story", 10).prompt)).toContain(
      "the story's main conflict as it lands on this character (1 milestone), the character's private life (1 milestone), and a smaller side question"
    );
  });

  it.each(INPUTS)("%i players, %s: the milestone field defers to the slate's counts, which a short story lowers", (players, mode) => {
    const text = descriptions(round3(players, mode, "story", 10).schema);
    expect(occurrences(text, ROUND3_TEXT.milestoneCount)).toBe(1);
    // Round 1's field text, which opened with the general counts, is gone as a description of its own
    expect(text).not.toMatch(/(^|\n)1 for a side question that one thread decides/);
  });

  it("points the fixed personal floor at the slate in short stories", () => {
    expect(occurrences(round3(2, GameModes.Cooperative).prompt, ROUND3_TEXT.shortFloor)).toBe(1);
    expect(round3(1, GameModes.SinglePlayer).prompt).not.toContain(ROUND3_TEXT.shortFloor);
  });
});

describe("stories read with a child (owner: 'too many stats for a story for 7-10 year olds')", () => {
  it.each(INPUTS)("%i players, %s: two visible stats of each kind, plain names, no hidden ones, only when a child reads along", (players, mode) => {
    const kids = round3(players, mode, "story", 25, true);
    const adults = round3(players, mode);
    expect(occurrences(block(kids.prompt), KIDS_STATS)).toBe(1);
    expect(adults.prompt).not.toContain(KIDS_STATS);
    // The inventory and the stat lists say the same budget, and nothing asks for 3-4 or for hidden stats
    for (const text of [kids.prompt, descriptions(kids.schema)]) {
      expect(text).not.toContain("3-4 visible");
      expect(text).not.toMatch(/invisible (shared )?stats that/);
      expect(text).not.toContain("plus any invisible ones");
    }
    expect(occurrences(kids.prompt, "- Two visible shared stats")).toBe(1);
    expect(occurrences(kids.prompt, "- Two visible stats that are directly linked to the player")).toBe(1);
    expect(occurrences(descriptions(kids.schema), ROUND3_TEXT.kidsSharedList)).toBe(1);
    expect(occurrences(descriptions(kids.schema), ROUND3_TEXT.kidsPlayerList)).toBe(1);
    expect(adults.prompt).toContain("3-4 visible shared stats");
  });
});

describe("the identity-name clause", () => {
  it.each(INPUTS)("%i players, %s: a seat keeps one name only when the premise gives it one", (players, mode) => {
    const prompt = round3(players, mode).prompt;
    expect(occurrences(prompt, players === 1 ? ROUND3_TEXT.identityClauseOne : ROUND3_TEXT.identityClauseMore)).toBe(1);
    expect(prompt).not.toContain("When the premise names the player character");
  });
});

describe("no 'energy' in the field examples", () => {
  it.each(KIND_INPUTS)("%s, %i players, %s: the word appears nowhere in the request", (kind, players, mode) => {
    expect(everything(round3(players, mode, kind))).not.toMatch(/energy/i);
  });

  it.each(INPUTS)("iteration, %i players, %s: nowhere in AI Iteration either", (players, mode) => {
    for (const sections of SECTION_SETS) expect(everything(iterationRound2Request(FEEDBACK, players, mode, 25, sections, TEMPLATE, ROUND3_PARTS))).not.toMatch(/energy/i);
  });
});

describe("conflict rules and hook facts (proposal 11), NPC pronouns in the role (S2)", () => {
  const request = round3(2, GameModes.Competitive);
  const schema = json(request.schema);
  const field = (path: string[]) => (find(schema, path) as { description: string }).description;

  it("rewrites the guideline fields", () => {
    expect(field(["properties", "guidelines", "properties", "world"])).toContain("ending on the tension that sets the story going");
    expect(field(["properties", "guidelines", "properties", "rules"])).toContain("Good rules create the constraints and opportunities that drive conflict.");
    expect(field(["properties", "guidelines", "properties", "tone"])).toContain("narrative voice");
    expect(field(["properties", "guidelines", "properties", "conflicts"])).toContain("not plot events. Each is answered by at least one outcome.");
    expect(field(["properties", "guidelines", "properties", "decisions"])).toContain("Name what is at stake in game terms");
  });

  it("rewrites the story element fields, pronouns in the role and at least one hook among the facts", () => {
    const element = ["properties", "storyElements", "items", "properties"];
    expect(field([...element, "role"])).toContain("(a lead, a helper, an obstacle, a prize or a threat)");
    expect(field([...element, "role"])).toContain("Gruk (he/him)");
    expect(field([...element, "role"])).not.toContain("How does it relate to the outcomes?");
    expect(field([...element, "instructions"])).toContain("at what price or condition");
    expect(field([...element, "instructions"])).toContain("unless the stat can be adjusted anytime");
    expect(field([...element, "facts"])).toContain("at least one of them a hook: a secret, a debt, a rivalry or a complication");
    expect(field([...element, "facts"])).not.toContain("include their preferred pronouns");
  });

  it("says the same in the prompt, and the worked example follows it", () => {
    expect(request.prompt).not.toContain("For NPCs, include their preferred pronouns and motivations.");
    expect(occurrences(request.prompt, ROUND3_TEXT.npcPronouns)).toBe(1);
    expect(request.prompt).not.toContain("they restore 10 health");
    expect(occurrences(request.prompt, ROUND3_TEXT.restHealth)).toBe(1);
    const example = request.prompt.slice(request.prompt.indexOf(WORKED_EXAMPLE_HEADING));
    expect(example).toContain('Role: "Gruk (he/him), leader of the largest goblin enclave');
  });

  it.each(INPUTS)("%i players, %s: every round-3 line prints once where the call has it", (players, mode) => {
    const text = everything(round3(players, mode));
    for (const line of [ROUND3_TEXT.npcPronouns, ROUND3_TEXT.restHealth]) expect({ line, found: occurrences(text, line) }).toEqual({ line, found: 1 });
    expect(occurrences(text, "Name what is at stake in game terms")).toBe(1);
  });

  it.each(INPUTS)("iteration, %i players, %s: AI Iteration regenerating story elements gets the same fields", (players, mode) => {
    const iteration = iterationRequestFromRound1(FEEDBACK, players, mode, 25, ["storyElements"], TEMPLATE, ROUND3_PARTS);
    expect(descriptions(iteration.schema)).toContain("at least one of them a hook");
    expect(iteration.prompt).toContain(ROUND3_TEXT.npcPronouns);
  });
});

describe("the seat roles in the generation order", () => {
  it.each(INPUTS.filter(([players]) => players > 1))("%i players, %s: a line per seat, naming the camp only where three players contest", (players, mode) => {
    const roles = find(json(round3(players, mode).schema), ["properties", "playerRoles"]) as { description: string; maxItems: number };
    expect(roles.maxItems).toBe(players);
    expect(roles.description.includes(ROUND3_TEXT.playerRolesCamp)).toBe(players === 3 && isContestMode(mode));
    expect(slotsOf(players).length).toBe(players);
  });
});
