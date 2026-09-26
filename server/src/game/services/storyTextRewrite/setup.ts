import { z } from "zod";
import { PLAYER_SLOTS, type GameMode, type PlayerCount } from "core/types/index.js";
import { setupStep } from "../storyTextSteps.js";
import { asArray, asObject, reworded, textBetween, textFrom, type SplitTextRequest } from "./common.js";

/*
 * Stage 4 of the text-model eval: the custom-story setup request rewritten
 * in GPT-6 style. The fixed rules state each rule once and are identical
 * within the single-player class and within the multiplayer class (so they
 * cache); the with-examples arm adds production's example stat setups
 * verbatim. The per-call message is production's configuration block with
 * the premise, verbatim. The schema is production's story-kind setup schema
 * with array counts enforced and the counts dropped from the descriptions.
 * Eval only: the harness's variants.ts is the one caller.
 */

const CONFIGURATION_ANCHOR = "Number of players:";
const EXAMPLES_FROM = "EXAMPLE STAT SETUPS";
const EXAMPLES_TO = "Character Selection Instructions";

const INTRODUCTION = [
  "You design the setup of an interactive story game: its world, story elements, outcomes, stats, and the characters the players choose from. Build it from the number of players, the game mode and the premise in the user message.",
  "",
  "1. Inclusivity and diversity",
  'Aim for two things at once: a convincing story, and one that defies biases and stereotypes. Diverse representation matters more here than an "accurate" picture of reality or what readers of the genre expect.',
  "- Make the cast diverse in culture, race, gender, age, sexual orientation, disability and more.",
  "- Let characters defy the stereotypes that come with their identities: women can be dominant, angry, aggressive, strong and visionary; men can be sensitive, caring, empathetic and joyful; black people tend to be in leadership positions, and nations with predominantly black populations can be world powers.",
  "- When romance is part of the story, a character's gender never rules out whom they can fall in love with.",
  "- Characters' pronouns are always respected, even in a Wild West story set in the 1800s.",
  "- Deviate from this only when the premise requires it: a story about the struggles of an LGBTQ+ identity includes the stereotypes that come with that identity.",
  "- Weave these points into the guidelines, the player identities and backgrounds, and the NPCs, in the story's own flavour rather than by copying the points above.",
  "- Don't overdo it: not every character is trans, black or disabled, and the story stays about its characters and plot, with diversity simply a fact of life in the setting.",
  "",
  "2. Story elements",
  "- Mix 2 to 4 NPCs, 2 to 4 locations and 2 to 4 other elements (items, factions, organizations, dangers, mysteries, conflicts, or whatever the story needs). The player characters are not story elements.",
  '- Use an element\'s instructions attribute for story hints and game mechanics: "Mr. X only helps players in exchange for gold.", "If players enter this location, the scene should involve significant danger.", "If players enter this location, they restore 10 health."',
  '- Borrow nothing from established franchises: a story about a teenage wizard has no NPCs named "Luna" or "Dumbledore", and a space opera has no elements from the universes of Star Trek or Firefly.',
];

const OUTCOMES = "- Every player has 3 outcomes, counting shared ones, with 6 milestones in total.";

const MULTIPLAYER_OUTCOMES =
  '- In multiplayer games, there are 0 to 3 shared outcomes, with 0 to 6 milestones between them. Each player then has 3 minus the number of shared outcomes as individual outcomes, with 6 minus the shared milestones between them: with 2 shared outcomes of 4 milestones in total, each player has 1 individual outcome with 2 milestones; with 3 shared outcomes of 6 milestones, none. A shared outcome is never repeated as an individual one: when the shared question is "Who will reign over the forest?", no player has an individual outcome like "Will [player] become the new spirit leader?".';

function statLines(multiplayer: boolean): string[] {
  return [
    "",
    "4. Stats",
    "- Give the story 3 to 4 visible shared stats for what is not tied to one player: what the players share (a group they belong to, a spaceship they use together, a flat they live in) and the state of the world (tension between factions, environmental conditions). Add any invisible shared stats the story needs.",
    ...(multiplayer
      ? ["- In multiplayer games, add shared stats that keep the score of what the players compete over (territory control, which side the council or an NPC leans towards)."]
      : []),
    "- Give each player 3 to 4 visible player stats (traits, skills, dispositions, health, personal relationships, resources, reputation or inventory), plus any invisible ones the story needs.",
    "- Group the stats in a flavourful way that suits the story, with short group names: Character/Empire/Politics for building a mafia empire, Detective/Investigation/Contacts for a mystery, Character/Ship/Crew for a space opera.",
    "- Favour string and string[] stats over numbers and percentages. The exceptions are countable things whose management is central to the story (gold), and percentages or opposites for what the player manages often and granularly (health, fuel).",
    "- The mix of stats sets the story's focus: in a space opera, three percentage stats for relationships with crew members make the story about those relationships, while a string[] stat for crew morale puts the focus elsewhere.",
    "- Vary the stat types. For a teenage wizard story: a string[] for friends, a string for the love interest, a string[] for mastered spells, a string for reputation at school, a percentage for academic performance and a number for pocket money.",
    "- Use a shared stat for what is the same for all players: when the players share a ship, its fuel level is shared. When the players keep a relationship with an NPC as a group, that relationship is a shared stat; when only one player has it, it is a player stat.",
    "- Hide the stats the player should not see with isVisible.",
    '- Set partOfPlayerBackgrounds to false for a player stat that starts the same whichever background the player picks: health starts as "unscathed", or status as "Neonate".',
    '- A stat\'s name tells the player at once what it is for; when a name cannot convey the stat\'s meaning and function, leave the stat out. Names are specific and have no placeholders (not "Relationship with NPC": which NPC?).',
    `- Leave to the game's other mechanics what they already track: progress towards outcomes (milestones track it${multiplayer ? ", except for contested outcomes in multiplayer games" : ""}), the remaining turns, and ordinary player decisions.`,
    ...(multiplayer
      ? ["- In multiplayer games, the backgrounds of different players stay consistent with each other whichever ones the players pick: in a space western only one player is the pilot, and in a band only one is the lead guitarist."]
      : []),
  ];
}

const STAT_TYPES = [
  "",
  "5. Stat types and what they suit",
  "- string: a role that one NPC can fill (assistant, mentor), character conditions (healthy/injured/critical), relationship states with a specific NPC (stranger/acquaintance/friend/confidant), rank (private/corporal/captain/general), equipment status (pristine/worn/damaged/broken), faction standings (hostile/neutral/friendly/allied), emotional states (calm/agitated/enraged), levels of influence (can ask for favors/can make decisions/full control).",
  '- string[]: traits and abilities whose individual level of development does not matter (["Ambitious", "Empathic", "Spontaneous"] in a romance, ["Telepathy", "Invisibility"] for superheroes), equipment and inventory (["Laser sword", "Med kit"]), a role that several NPCs can fill (friends, love interests), issues (["Poisoned", "Bleeding"] when avoiding and treating ailments is central; otherwise a percentage for health), contacts (["Dealers", "Local Newspaper"] when building them is central; otherwise a string for the breadth of contacts). Not for progress towards outcomes, which no stat tracks.',
  '- percentage: resources with a capacity limit (mana, chi, stamina, fuel, energy, oxygen supply), integrity (health, spaceship integrity, mental stability), a skill only when it is clearly defined and developing it is central ("magic" or "mystic power" are better as a string[] of abilities), the strength of one relationship only when managing that relationship is central (otherwise a string, or a string[] of friends or contacts), environmental conditions only when they are managed often and granularly (radiation levels; otherwise a string).',
  '- opposites: moral alignments (good|evil, order|chaos, tradition|progress), competing influences (science|magic, empire|rebellion), character dispositions (cynicism|idealism, logic|empathy), and the score of tug-of-war outcomes in multiplayer games (playerA|playerB territory control). Not when one side is clearly better: "Stability|Chaos" when the goal is to keep stability, or "Courage|Fear" when fear has no benefit.',
  "- number: resources without a maximum (money, ammunition, army size, cult followers), counters (wins in a tournament, people saved), countdowns that pace the story (days until a deadline, seals left on a powerful artifact). Not for skills (a percentage, a string or an item of a string[] instead), not for power levels (a string or a string[] of abilities), not for what cannot be counted (influence, experience, interest), and not for what should not be a bare number in a story (goals and friends deserve more nuance).",
  "",
  "6. How stats act in play",
  "The story is a series of threads of 2 to 4 beats, and each beat is 5 to 6 paragraphs followed by a player decision. Every beat has chances of a favorable, mixed or unfavorable result, which stats can shift. A player can shift them in their favour by sacrificing something, or against themselves by choosing a reward that helps later. Favorable results early in a thread improve the chances later in it, and the thread's last beat decides which milestone its outcome gets.",
];

function characterLines(multiplayer: boolean): string[] {
  return [
    "",
    "7. Characters",
    "- Make the backgrounds differ and balance, so that no background is clearly better than another.",
    ...(multiplayer
      ? ["- In multiplayer games, each player's identities and backgrounds differ from the other players' and stay consistent with them."]
      : []),
  ];
}

const DIFFICULTY_AND_PREMISE = [
  "",
  "8. Difficulty",
  'Choose exactly one difficulty level. A modifier of +10 means things tend to go well for the player; 0 means ups and downs, with things turning out fine in the end; -10 means frequent failures, and not every goal is reached; -20 means playing against the odds, with only a few successes in the whole story. Match the level to the kind of story: kids, cozy and wholesome stories take +20 to 0; balanced, adventure and mystery stories +10 to -10; horror, grim, dark and survival stories 0 to -20. Examples of the levels in each range: for a bedtime story about friendly dragons, +20 "Magical Dreams", +10 "Happy Adventure", 0 "Little Challenge"; for a detective mystery, +10 "Amateur Sleuth", 0 "Professional Detective", -10 "Master Case"; for a horror survival game, 0 "Guardian Angel", -10 "Nightmare", -20 "Doom".',
  "",
  "If the premise is thin, odd or contradictory, use its most plausible reading and build a complete setup without commenting on the premise.",
  "",
  "The field descriptions in the reply format are part of these instructions.",
];

export const EXAMPLES_HEADING = "Example stat setups (for depth and shape; your setup fits its own premise):";

/** Production's example stat setups, without the blank lines around them. */
export function productionExamples(productionPrompt: string): string {
  const configuration = textFrom(productionPrompt, CONFIGURATION_ANCHOR, "configuration");
  const settings = productionPrompt.slice(0, productionPrompt.length - configuration.length);
  for (const anchor of [EXAMPLES_FROM, EXAMPLES_TO]) {
    const count = settings.split(anchor).length - 1;
    if (count !== 1) throw new Error(`Stage 4 rewrite: examples anchor "${anchor}" found ${count} times before the configuration`);
  }
  return textBetween(settings, EXAMPLES_FROM, EXAMPLES_TO, "example stat setups").trim();
}

/** The section that carries production's example stat setups verbatim (with-examples arm only). */
function examplesSection(productionPrompt: string): string[] {
  return ["", EXAMPLES_HEADING, "", productionExamples(productionPrompt)];
}

function setupFixed(multiplayer: boolean, examples: string[]): string {
  return [
    ...INTRODUCTION,
    "",
    "3. Outcomes",
    OUTCOMES,
    ...(multiplayer ? [MULTIPLAYER_OUTCOMES] : []),
    ...statLines(multiplayer),
    ...STAT_TYPES,
    ...examples,
    ...characterLines(multiplayer),
    ...DIFFICULTY_AND_PREMISE,
  ].join("\n");
}

// ---------------------------------------------------------------- schema

const described = <T extends z.ZodTypeAny>(schema: T, source: z.ZodTypeAny): T =>
  source.description === undefined ? schema : schema.describe(source.description);

/** One rewritten instance per production instance, so shared schemas stay shared (and the JSON schema keeps its references). */
function once<T extends z.ZodTypeAny>(rewrite: (production: z.ZodTypeAny) => T): (production: z.ZodTypeAny) => T {
  const done = new Map<z.ZodTypeAny, T>();
  return (production) => {
    const result = done.get(production) ?? rewrite(production);
    done.set(production, result);
    return result;
  };
}

function rewrittenStat(stat: z.ZodTypeAny): z.AnyZodObject {
  const object = asObject(stat, "stat");
  const effects = reworded(
    reworded(
      asArray(object.shape.effectOnPoints, "effectOnPoints"),
      "List 3 ways in which this stat can be relevant for the player's chance of success.",
      "Each item is one way in which this stat can be relevant for the player's chance of success."
    ),
    "\nRemember: at least 3 items in this list!",
    ""
  );
  return object.extend({ effectOnPoints: effects.min(3) });
}

function rewrittenPlayer(player: z.ZodTypeAny): z.AnyZodObject {
  const object = asObject(player, "player");
  return object.extend({
    // sharedOutcomes carries the same sentence; the player's copy says it without repeating it
    outcomes: reworded(
      asArray(object.shape.outcomes, "outcomes"),
      " No intermediate outcomes, only elements of the ending.",
      " Like the shared outcomes, they are elements of the ending only."
    ).max(3),
    possibleCharacterIdentities: asArray(object.shape.possibleCharacterIdentities, "possibleCharacterIdentities")
      .length(3)
      .describe("Identities the player can choose from."),
    possibleCharacterBackgrounds: reworded(
      asArray(object.shape.possibleCharacterBackgrounds, "possibleCharacterBackgrounds"),
      "Generate exactly 3 possible backgrounds",
      "Possible backgrounds"
    ).length(3),
  });
}

function rewrittenCharacterPlan(plan: z.AnyZodObject, multiplayer: boolean): z.AnyZodObject {
  const coordination = asArray(plan.shape.multiplayerCoordination, "multiplayerCoordination");
  return plan.extend({
    ...(multiplayer
      ? { multiplayerCoordination: reworded(coordination, " List three mechanisms", " Mechanisms").length(3) }
      : {}),
    playerStatConversionRates: reworded(
      asArray(plan.shape.playerStatConversionRates, "playerStatConversionRates"),
      "List three rough conversion rates",
      "Rough conversion rates"
    ).length(3),
    backgroundArchetypes: reworded(asArray(plan.shape.backgroundArchetypes, "backgroundArchetypes"), "Outline exactly 3 generic", "Outline generic").length(3),
  });
}

function rewrittenSchema(production: z.AnyZodObject, playerCount: PlayerCount): z.AnyZodObject {
  const shape = production.shape;
  const guidelines = asObject(shape.guidelines, "guidelines");
  const elements = asArray(shape.storyElements, "storyElements");
  const element = asObject(elements.element, "story element");
  const difficulty = asObject(shape.difficultyLevel, "difficultyLevel");
  const stat = once(rewrittenStat);
  const player = once(rewrittenPlayer);
  const statList = (key: string) => {
    const list = asArray(shape[key], key);
    return described(z.array(stat(list.element)), list);
  };
  const slots = Object.keys(shape).filter((key) => PLAYER_SLOTS.includes(key));
  return production.extend({
    guidelines: guidelines.extend({
      typesOfThreads: reworded(asArray(guidelines.shape.typesOfThreads, "typesOfThreads"), "6-8 types of threads", "Types of threads")
        .min(6)
        .max(8),
      switchAndThreadInstructions: reworded(
        asArray(guidelines.shape.switchAndThreadInstructions, "switchAndThreadInstructions"),
        " Generate 0-3 instructions.",
        ""
      ).max(3),
    }),
    difficultyLevel: difficulty
      .extend({
        modifier: difficulty.shape.modifier.describe("The modifier applied to every chance of success in the story, in steps of 10."),
      })
      .describe("The story's one difficulty level."),
    storyElements: described(
      z
        .array(
          element.extend({
            facts: reworded(asArray(element.shape.facts, "facts"), "Three additional facts", "Additional facts").length(3),
          })
        )
        .min(6)
        .max(8),
      elements
    ),
    statGroups: reworded(asArray(shape.statGroups, "statGroups"), " Maximum of 3 groups.", "").max(3),
    sharedStats: statList("sharedStats"),
    playerStats: statList("playerStats"),
    characterSelectionPlan: rewrittenCharacterPlan(asObject(shape.characterSelectionPlan, "characterSelectionPlan"), playerCount > 1),
    ...Object.fromEntries(slots.map((slot) => [slot, player(shape[slot])])),
  });
}

/**
 * The Stage 4 request for a custom story's setup (production's "story"
 * kind), with or without production's example stat setups.
 */
export function rewriteSetupRequest(
  premise: string,
  playerCount: PlayerCount,
  gameMode: GameMode,
  maxTurns: number,
  withExamples: boolean
): SplitTextRequest {
  const production = setupStep.request(premise, playerCount, gameMode, maxTurns, "story");
  return {
    fixed: setupFixed(playerCount > 1, withExamples ? examplesSection(production.prompt) : []),
    perCall: textFrom(production.prompt, CONFIGURATION_ANCHOR, "configuration"),
    schema: rewrittenSchema(asObject(production.schema, "setup"), playerCount),
  };
}
