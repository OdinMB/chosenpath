import { z } from "zod";
import { createStorySetupSchema, GameModes, PLAYER_SLOTS, type GameMode, type PlayerCount } from "core/types/index.js";
import { templateIterationSections } from "core/utils/templateIterationSections.js";

/*
 * The setup's field descriptions and field order, adopted on 2026-09-28 from
 * the eval's setup round 3 (variant setupR3; setup doc Appendix A): each
 * field says what the game does with it (the ±15 scale, certain sacrifices,
 * milestones 1 to 3, steering thresholds, hook facts), and a new setup is
 * written in the generation order (A9: decisions before what depends on
 * them; the thread design last), which assembleSetupReply puts back into the
 * fields saved today before anything reads the reply. AI Iteration keeps
 * today's field list and order (it reads the model's stat groups and stores
 * outcomes as written), with the same descriptions.
 * Every field extends core's zod instance (core/types keeps the stored
 * shapes, and the eval's frozen round0 form reads core's own descriptions),
 * so the stat, outcome and player instances stay shared across lists and
 * seats. adoptedSetup.test.ts holds the schemas equal to the measured ones.
 */

export type SetupSchemaOptions = { kids?: boolean };

type Kind = "story" | "template" | "iteration";

type Call = { players: PlayerCount; mode: GameMode; kind: Kind; sections: string[]; kids: boolean };

const ALL_SECTIONS = Object.keys(templateIterationSections);

const isContestMode = (mode: GameMode) => mode === GameModes.Competitive || mode === GameModes.CooperativeCompetitive;
const contested = (call: Call) => call.players > 1 && isContestMode(call.mode);
const camps = (call: Call) => call.players === 3 && contested(call);

function asObject(schema: unknown, label: string): z.AnyZodObject {
  if (!(schema instanceof z.ZodObject)) throw new Error(`Setup schema: ${label} is not an object schema`);
  return schema;
}

function asArray(schema: unknown, label: string): z.ZodArray<z.ZodTypeAny> {
  if (!(schema instanceof z.ZodArray)) throw new Error(`Setup schema: ${label} is not an array schema`);
  return schema;
}

function asUnion(schema: unknown, label: string): z.ZodUnion<[z.ZodTypeAny, ...z.ZodTypeAny[]]> {
  if (!(schema instanceof z.ZodUnion)) throw new Error(`Setup schema: ${label} is not a union schema`);
  return schema;
}

const appended = <T extends z.ZodTypeAny>(schema: T, addition: string): T => schema.describe(`${schema.description ?? ""} ${addition}`.trim());

// ---------------------------------------------------------------- outcomes (A1.4, A6)

const QUESTION_FORMS =
  "- The question's form matches its resolutions: 'Will / Does / Can …?' takes favorable, mixed and unfavorable; 'Who / Which side …?' about one prize two sides compete for (two players, or with three players two camps) takes the contest resolutions; 'What / How / Which path …?' about a character's choice takes three paths.";

const OUTCOME_DESCRIPTION = [
  "A question the story's ending answers, from the milestones the players earn along the way.",
  '- Ask about one thing, in the story\'s own names (a person, faction, place or object from the story elements). Don\'t restate the premise, and don\'t join two questions with "and" or "without".',
  QUESTION_FORMS,
  "- Each resolution is a concrete end state someone could picture. The favorable one may carry a price; the mixed and unfavorable ones are endings worth playing toward.",
  '- A player\'s outcomes fit every identity and background that player can choose, so refer to the character by role or as "player2\'s character", never by a name, unless the premise itself names the player characters.',
  "Examples (a story about goblin activists): 'Will the Hero Guilds reform their anti-goblin policies?' Favorable: the Guilds adopt codes that protect goblins and punish violence against them. Mixed: some reforms pass, but enforcement is weak and many heroes resist. Unfavorable: the Guilds double down, forcing goblins further underground. Contested: 'Who will become the King's Black Hand?' Three paths: 'What will the activist's friendship with Mia look like in the end?'",
  "Weak: 'Do the players successfully complete their mission?' It restates the premise and names nothing.",
].join("\n");

/** A6.2: each kind of outcome's stakes, where the call has that kind. */
function resonance(call: Call): string {
  return [
    "Why the answer matters, in one or two sentences.",
    "- Personal outcome: which need, fear, hope, relationship or secret of this character it tests, in a way that fits all of the player's backgrounds.",
    ...(call.players > 1 ? ["- Shared outcome: what each player, by role, stands to gain or lose, and why they can't settle it alone."] : []),
    ...(contested(call) ? ["- Contested outcome: what drives each side and what winning would cost them (and, see the Outcomes section, which stat keeps its score)."] : []),
  ].join("\n");
}

const THREE_PATHS =
  "Use this for outcomes about a character's choice between paths. Example: 'What will the activist's friendship with Mia look like in the end?' Three paths the character can end up on, each an end state. Exploration threads offer these paths as choices, so none is simply better.";

/** The milestone field defers to the slate: a short story gives the main question fewer than 3 (A10). */
const MILESTONE_COUNT =
  'The count the "This setup" block gives this outcome; in general 1 for a side question that one thread decides, 2 as a default, 3 for the question the ending hinges on.';

/** One outcome instance for the shared list and every seat. */
function outcomeSchema(core: z.ZodTypeAny, call: Call): z.AnyZodObject {
  const outcome = asObject(core, "outcome");
  const union = asUnion(outcome.shape.possibleResolutions, "possibleResolutions");
  const [challenge, contest, paths] = union.options.map((option, i) => asObject(option, `resolution kind ${i + 1}`));
  const eachPath = () => z.string().describe("A distinct path; none of them is a failure.");
  const resolutions = z
    .union([
      challenge.extend({
        favorable: challenge.shape.favorable.describe(
          "The best ending for this question, or the most interesting one, as a concrete state of the world or the character. It may carry a price."
        ),
        unfavorable: challenge.shape.unfavorable.describe("A concrete ending the story can land on, not just 'they fail'."),
        mixed: challenge.shape.mixed.describe("A real compromise: part of it is won, and something is lost or left open."),
      }),
      contest.extend({
        sideAWins: contest.shape.sideAWins.describe(camps(call) ? "Side A (player1's camp) wins." : "Side A (player1's character in a two-player game) wins."),
        sideBWins: contest.shape.sideBWins.describe(camps(call) ? "Side B (the other camp) wins." : "Side B (player2's character in a two-player game) wins."),
        mixed: contest.shape.mixed.describe("A draw or a compromise between them."),
      }),
      paths.extend({ resolution1: eachPath(), resolution2: eachPath(), resolution3: eachPath() }).describe(THREE_PATHS),
    ])
    .describe(union.description ?? "");
  // A new setup chooses 1, 2 or 3 (the difficulty precedent); the stored type stays a number, which the editor writes
  const milestones =
    call.kind === "iteration"
      ? outcome.shape.intendedNumberOfMilestones.describe(MILESTONE_COUNT)
      : z.union([z.literal(1), z.literal(2), z.literal(3)]).describe(MILESTONE_COUNT);
  return outcome
    .extend({
      question: outcome.shape.question.describe("The question, in one sentence, about one thing."),
      possibleResolutions: resolutions,
      resonance: outcome.shape.resonance.describe(resonance(call)),
      intendedNumberOfMilestones: milestones,
    })
    .describe(OUTCOME_DESCRIPTION);
}

// ---------------------------------------------------------------- stats (A2.4, A3.2, A4.2, A7.3)

const statDescription = (call: Call) =>
  `A variable the game tracks. In a challenge or contest scene it adds between -15 and +15 points to a choice (for scale: difficulty adds -20 to +20 to every roll, the previous beat's result ±30). A player can spend it for the game's fixed sacrifice bonus, or gain it by accepting the fixed reward malus. Its narrative implications are what the story's planners read to decide what happens next. No stat tracks progress toward an outcome, because milestones do that${contested(call) ? ", except the scoreboard of a contested outcome" : ""}.`;

const effects = (call: Call) =>
  `How this stat shifts the chance of success in challenge and contest scenes. Two or three effects${
    contested(call) ? " (one or two for a contest's scoreboard, its catch-up among them)" : ""
  }, each a situation or threshold and a value in absolute terms: +5 slight, +10 clear, +15 decisive (and the same below zero), never beyond 15 either way and never a formula. At most two stats count for any one choice, so write effects for the situations in which this stat is the one that matters, in scenes this story's thread types create. Examples: 'Above 70%: +10 in social challenges'; '-15 when the ship is Damaged and a risky maneuver is needed'.`;

const sacrifice = (call: Call) =>
  `What the player gives up from this stat, in its own units, to get the game's fixed sacrifice bonus in one scene: 'Spend 10% fuel', 'Burn one contact to call in a favor'. The bonus is always the same, so never state it, and the loss is certain, never a risk. A stat that is not adjustable anytime still gets a sacrifice. Write 'None' only for a special power, a standing earned over the whole story, trust that must be earned in a thread${
    contested(call) ? ", or a contested outcome's scoreboard" : ""
  }.`;

const REWARD =
  "What the player gains of this stat, in its own units, for accepting the game's fixed reward malus in one scene: 'Regain 10% health by resting instead of pressing on'. The gain is certain. A stat that is not adjustable anytime still gets a reward. Write 'None' only for the stats whose sacrifice is 'None'.";

/** The flag in the two labels the beats' stat view prints. */
const ADJUSTABLE_ANYTIME =
  "Whether this stat can be adjusted anytime. True: small changes within a thread's scenes as well, for stats that are tracked often and in small steps (health, fuel); the beats see 'Can be adjusted anytime'. False: it changes when a thread gets resolved and through its own sacrifice and reward, for stats where a change is noticeable or lasting (important world stats, special powers, relationships); the beats see 'Can only be changed when a thread gets resolved or through sacrifice/reward options'. This flag does not decide whether the stat has a sacrifice or a reward; those fields do.";

const ADJUSTMENTS =
  "One or two changes after threads, each keyed on the kind of thread and its result: favorable, mixed or unfavorable; for a contest, which side won. Example: '+10% after a favorable challenge thread about the crowd'. Size changes so the stat can move across its range over about six threads (a percentage by 5 to 15). Changes after unfavorable results can be real setbacks.";

const TOOLTIP = "One sentence for the player: what the stat is and the value or use that matters. No disclaimers about what it does not mean.";

const NAME_ADDITION =
  "Never a player's seat ('Player 1') or a player character's name: every player sees this name, and players choose their characters' names later. NPC names are fine. When the premise names the player characters, their names are fine too.";

const STAT_TYPE =
  "Data type of the variable.\n" +
  "- string: For qualitative aspects that don't change often or granularly (e.g., character conditions, relationship states, ranks).\n" +
  "- string[]: For lists of traits, collectibles, or categories (e.g., abilities, inventory items, contacts).\n" +
  "- percentage: For aspects that change often and granularly (0-100%, e.g., health, fuel, relationship strength).\n" +
  "- opposites: Two percentage stats in one where second stat = (100 - first stat) (e.g., order|chaos, logic|empathy).\n" +
  "- number: Only for countable quantities (e.g., money, ammunition, followers).\n" +
  "As a general tendency, favor string and string[] over percentage/opposites/number unless for countable things whose management is central to the story (number), and percentages/opposites for aspects that must be managed by the player often and granularly.";

const STAT_ID =
  "Unique identifier for the stat. Use a short phrase with underscores and indicate whether this is a player or shared stat, like 'player_health' or 'shared_spaceship_status'.";

/** A7.3: thresholds that steer which threads happen. */
const IMPLICATIONS =
  "One to three thresholds, each with what the story must do when the stat reaches it. The switch and thread planners see only a stat's name, value and these lines, so this is how a stat steers which threads happen. Name the value and the consequence: which thread the next switch forces or offers, or which scenes and options open or close. Examples: 'At 20% or below: the next switch forces a thread about finding food.' 'At Hunted: every topic switch offers an escape.' 'While Gruk trusts the player: the enclave offers sanctuary.'";

/** One stat instance for the shared and the player list. */
function statSchema(core: z.ZodTypeAny, call: Call): z.AnyZodObject {
  const stat = asObject(core, "stat");
  return stat
    .extend({
      type: stat.shape.type.describe(STAT_TYPE),
      id: stat.shape.id.describe(STAT_ID),
      name: appended(stat.shape.name, NAME_ADDITION),
      effectOnPoints: asArray(stat.shape.effectOnPoints, "effectOnPoints").max(3).describe(effects(call)),
      optionsToSacrifice: stat.shape.optionsToSacrifice.describe(sacrifice(call)),
      optionsToGainAsReward: stat.shape.optionsToGainAsReward.describe(REWARD),
      canBeChangedInBeatResolutions: stat.shape.canBeChangedInBeatResolutions.describe(ADJUSTABLE_ANYTIME),
      adjustmentsAfterThreads: asArray(stat.shape.adjustmentsAfterThreads, "adjustmentsAfterThreads").max(2).describe(ADJUSTMENTS),
      tooltip: stat.shape.tooltip.describe(TOOLTIP),
    })
    .describe(statDescription(call))
    .extend({ narrativeImplications: asArray(stat.shape.narrativeImplications, "narrativeImplications").max(3).describe(IMPLICATIONS) });
}

const SHARED_STATS_START =
  "Stats that are not tied specifically to individual players, including multiplayer elements (a shared spaceship, aspects of a shared group, etc.), aspects of the environment or world in general, etc.";
const sharedStatsDescription = (call: Call) =>
  call.kids
    ? `${SHARED_STATS_START} Generate two visible shared stats and no hidden ones: a child reads this story.${contested(call) ? " In competitive and cooperative-competitive games, one of these is the scoreboard of each contested shared outcome, as the stat rules describe." : ""}`
    : `${SHARED_STATS_START} Generate 3-4 visible shared stats, plus any invisible ones the story needs.${
        contested(call) ? " In competitive and cooperative-competitive games, one of these is the scoreboard of each contested shared outcome, as the stat rules describe." : ""
      }`;
const playerStatsDescription = (call: Call) =>
  `Stats that are tied specifically to individual players, including traits, skills, dispositions, health, personal relationships, personal resources, personal reputation, personal inventory, etc. In multiplayer games, each player has different values for these stats. ${
    call.kids ? "Generate two visible player stats and no hidden ones: a child reads this story." : "Generate 3-4 visible player stats, plus any invisible ones the story needs."
  }`;

// ---------------------------------------------------------------- guidelines and story elements (A7, A11)

const GUIDELINE_FIELDS = {
  world:
    "Three sentences about the world the story takes place in, ending on the tension that sets the story going. Example: '… goblins have begun to organize and demand recognition, equality, and safety, but face fierce resistance from both the populace and the hero guilds.'",
  rules:
    "Fundamental laws and social structures of the story world (not your rules for creating the story). Good rules create the constraints and opportunities that drive conflict. Example: 'Heroes are legally permitted to kill goblins for fame and fortune.'",
  tone: "The emotional atmosphere and narrative voice: how dialogue, descriptions and humor should feel in this story. Example: 'Moments of dark humor and satire, especially regarding the hypocrisy of heroic culture.'",
  conflicts:
    "The core dilemmas characters face again and again: types of moral and strategic choices, not plot events. Each is answered by at least one outcome. Example: 'Deciding when to compromise and when to stand firm.'",
  decisionsAddition: "Name what is at stake in game terms: a resource spent, a relationship risked, or one outcome favored over another.",
};

/** A7.1: two to four rules the planners apply between threads, each kind where the call has it. */
function instructionsText(call: Call, fallback: boolean): string {
  const multiplayer = contested(call)
    ? "in multiplayer games: when the players share a thread, and when they face each other in a contest"
    : "in multiplayer games: when the players share a thread";
  const kinds = [
    "the opening: what the first thread is about",
    "a stat trigger: when a named stat reaches a value, the next switch forces a thread about it, or topic switches must offer one",
    "a recipe for one thread type: its length in beats and what its steps are",
    "timing: what happens around the middle of the story, and what the final thread is about",
    ...(call.players > 1 ? [multiplayer] : []),
  ];
  return [
    "Two to four rules that the story's planners apply between threads: they design the next choice and the next thread, while the beats that narrate a thread never see these rules. Each rule names a trigger and what follows. Kinds that pay off:",
    ...kinds.map((kind, i) => `- ${kind}${i === kinds.length - 1 ? "." : ";"}`),
    "At most one rhythm rule, and only if it is specific to this story; the planners are already told to avoid each player's recent thread types. Stat changes after threads belong in each stat's adjustments after threads, how scenes read belongs in tone, and the game's own mechanics need no restating. Example: 'When Public Support falls below 30%, the next thread is about winning back the crowd.'",
    ...(fallback ? ["You define the stats below; name a stat by what it measures."] : []),
  ].join("\n");
}

/** A7.2: thread types as "Name (kind, beats): …", the contest kind where contest threads exist. */
function threadTypesText(call: Call): string {
  const kinds = contested(call)
    ? "Kind is challenge (success or failure, rolled), exploration (a choice between paths, no roll) or contest (players against each other);"
    : "Kind is challenge (success or failure, rolled) or exploration (a choice between paths, no roll);";
  return `Six to eight kinds of scene that this story's threads are built from. Write each as 'Name (kind, beats): what the players do and what is at stake'. ${kinds} beats is the usual length, 2, 3 or 4. Together they cover the main conflict, in more than one way (for example negotiation and sabotage), and the characters' private lives (friends, family, romance, reflection). Every outcome has at least one type that can push it, and every stat matters in at least one. Example: 'Public protest (challenge, 3): rally goblins in a square the Hero Guild patrols without handing it an excuse to crack down'.`;
}

function guidelinesSchema(core: z.ZodTypeAny, call: Call, fallback: boolean): z.AnyZodObject {
  const guidelines = asObject(core, "guidelines");
  return guidelines
    .extend({
      world: guidelines.shape.world.describe(GUIDELINE_FIELDS.world),
      rules: guidelines.shape.rules.describe(GUIDELINE_FIELDS.rules),
      tone: guidelines.shape.tone.describe(GUIDELINE_FIELDS.tone),
      conflicts: guidelines.shape.conflicts.describe(GUIDELINE_FIELDS.conflicts),
      decisions: appended(guidelines.shape.decisions, GUIDELINE_FIELDS.decisionsAddition),
    })
    .extend({
      typesOfThreads: asArray(guidelines.shape.typesOfThreads, "typesOfThreads").max(8).describe(threadTypesText(call)),
      switchAndThreadInstructions: asArray(guidelines.shape.switchAndThreadInstructions, "switchAndThreadInstructions").max(4).describe(instructionsText(call, fallback)),
    });
}

const ELEMENT_FIELDS = {
  role: "What the element is to the players (a lead, a helper, an obstacle, a prize or a threat), which conflict or goal it serves, and the tension it carries. For NPCs, put their pronouns right after the name. Example: 'Gruk (he/him), leader of the largest goblin enclave in the city, is a pragmatic organizer who sometimes clashes with more radical activists.'",
  instructions:
    "How the storyteller uses the element: how it behaves, what players can get from it and at what price or condition, and which stat it touches, by name. Stat effects happen at the end of a thread or as a sacrifice or reward, not in the middle of one, unless the stat can be adjusted anytime. Example: 'Gruk can mobilize goblins for protests or provide sanctuary, but expects loyalty and dislikes reckless risks.'",
  facts:
    "Three facts a thread can use, at least one of them a hook: a secret, a debt, a rivalry or a complication. For NPCs, one fact gives the motivation. Example: 'Has a secret truce with a local hero, which he keeps hidden from most goblins.'",
};

function storyElementsSchema(core: z.ZodTypeAny): z.ZodArray<z.ZodTypeAny> {
  const list = asArray(core, "storyElements");
  const element = asObject(list.element, "story element");
  const written = element.extend({
    role: element.shape.role.describe(ELEMENT_FIELDS.role),
    instructions: element.shape.instructions.describe(ELEMENT_FIELDS.instructions),
    facts: element.shape.facts.describe(ELEMENT_FIELDS.facts),
  });
  return z.array(written).describe(list.description ?? "");
}

// ---------------------------------------------------------------- players and the plan (A1.4)

const PLAYER_OUTCOMES =
  "This player's own outcomes. Only elements of the ending, no intermediate goals. In multiplayer games, questions that concern all players go into sharedOutcomes instead.";
const SHARED_OUTCOMES =
  "Outcomes that concern all players: goals they pursue together and prizes they compete over. Each counts toward every player's outcomes and milestones. Only elements of the ending, no intermediate goals.";
/**
 * A single-player template's shared list in AI Iteration: a template made
 * before the adoption can hold outcomes there; regenerated with player1's
 * they fold into player1's three, regenerated alone they stay.
 */
const singlePlayerSharedOutcomes = (sections: string[]) =>
  sections.includes("players")
    ? "Single-player template: leave this list empty; every outcome belongs to player1, so fold any of the template's shared outcomes you keep into player1's three."
    : "Single-player template: you are not regenerating player1's outcomes here, so keep the template's shared outcomes (revised as the feedback asks) and add none; together with player1's, the player has three outcomes.";
const COORDINATION =
  "For multiplayer games: give each player seat its own role in this story, meaning what that character does for the group or wants that the others don't. All three of that seat's identities and backgrounds stay within the role, and so do its personal outcomes. If the shared outcomes or stats above already name the roles, use those names. Example: 'player1 is the enclave's organizer (backgrounds: veteran, newcomer, defector); player2 is the movement's printer (…)'. List up to three such mechanisms. For single-player games, leave this empty.";
const ROLE_IN_BACKGROUND = "In multiplayer games, name the seat's role in the story.";

function playerSchema(core: z.ZodTypeAny, outcome: z.AnyZodObject, call: Call): z.AnyZodObject {
  const player = asObject(core, "player");
  const fields: z.ZodRawShape = { outcomes: z.array(outcome).max(3).describe(PLAYER_OUTCOMES) };
  if (call.players > 1) {
    const backgrounds = asArray(player.shape.possibleCharacterBackgrounds, "possibleCharacterBackgrounds");
    const background = asObject(backgrounds.element, "character background");
    const withRole = background.extend({ fluffTemplate: appended(background.shape.fluffTemplate, ROLE_IN_BACKGROUND) });
    fields.possibleCharacterBackgrounds = z.array(withRole).describe(backgrounds.description ?? "");
  }
  return player.extend(fields);
}

/** The whole setup in today's field order, with the adopted descriptions; one player's new setup has no shared list. */
function fieldOrderSchema(call: Call, fallback: boolean): z.AnyZodObject {
  const core = asObject(createStorySetupSchema(call.players, call.kind === "iteration" ? "template" : call.kind), "setup");
  const shape = core.shape;
  const outcome = outcomeSchema(asArray(shape.sharedOutcomes, "sharedOutcomes").element, call);
  const stat = statSchema(asArray(shape.sharedStats, "sharedStats").element, call);
  const player = playerSchema(shape.player1, outcome, call);
  const plan = asObject(shape.characterSelectionPlan, "characterSelectionPlan");
  const slots = Object.keys(shape).filter((key) => PLAYER_SLOTS.includes(key));
  const fields: z.ZodRawShape = {
    sharedStats: z.array(stat).describe(sharedStatsDescription(call)),
    playerStats: z.array(stat).describe(playerStatsDescription(call)),
    ...Object.fromEntries(slots.map((slot) => [slot, player])),
    guidelines: guidelinesSchema(shape.guidelines, call, fallback),
    storyElements: storyElementsSchema(shape.storyElements),
  };
  if (call.players > 1) {
    fields.sharedOutcomes = z.array(outcome).max(2).describe(SHARED_OUTCOMES);
    const coordination = asArray(plan.shape.multiplayerCoordination, "multiplayerCoordination").describe(COORDINATION);
    fields.characterSelectionPlan = plan.extend({ multiplayerCoordination: coordination });
  } else if (call.kind === "iteration") {
    fields.sharedOutcomes = z.array(outcome).describe(singlePlayerSharedOutcomes(call.sections));
  }
  // A new story or template with one player has no shared list (assembleSetupReply sets an empty one)
  const base = call.players > 1 || call.kind === "iteration" ? core : core.omit({ sharedOutcomes: true });
  return base.extend(fields);
}

// ---------------------------------------------------------------- the generation order (A9)

const THREAD_DESIGN = "This story's thread types and switch/thread instructions, written after the outcomes and stats they build on.";
const SEAT_OUTCOMES = "Each player's own outcomes, one list per player.";
const PLAYER_ROLES =
  "One line per player seat, in seat order, such as 'player1: the enclave's organizer': that seat's own role in this story, meaning what the character does for the group or wants that the others don't. All three of the seat's identities and backgrounds stay within the role, and so do its personal outcomes; the outcomes, stats and backgrounds below use these role names. The multiplayerCoordination instructions apply here.";
const PLAYER_ROLES_CAMP = " With three players and a contest, each line also names the seat's camp: 'player3: the landlord's nephew (side B)'.";

/** A list of another element under the same cap and description. */
function sameList(list: z.ZodArray<z.ZodTypeAny>, element: z.ZodTypeAny): z.ZodArray<z.ZodTypeAny> {
  const cap = list._def.maxLength?.value;
  const copy = z.array(element);
  return (cap === undefined ? copy : copy.max(cap)).describe(list.description ?? "");
}

/**
 * Decisions before what depends on them: guidelines (world to decisions),
 * difficulty, the seat roles (multiplayer), story elements, shared outcomes,
 * each seat's outcomes, stats, the balance plan, identities and backgrounds,
 * then the thread design, title, introduction and images. No stat groups and
 * no milestone lists (assembly adds them back).
 */
function generationOrderSchema(schema: z.AnyZodObject, call: Call): z.AnyZodObject {
  const shape = schema.shape;
  const guidelines = asObject(shape.guidelines, "guidelines");
  const seat = asObject(shape.player1, "player1");
  const seatOutcomes = asArray(seat.shape.outcomes, "outcomes");
  const outcome = asObject(seatOutcomes.element, "outcome");
  const written = outcome.omit({ milestones: true }).describe(outcome.description ?? "");
  const ownList = sameList(seatOutcomes, written);
  const seatWritten = seat.omit({ outcomes: true });
  const slots = Object.keys(shape).filter((key) => PLAYER_SLOTS.includes(key));
  const plan = asObject(shape.characterSelectionPlan, "characterSelectionPlan");
  const rolesText = camps(call) ? `${PLAYER_ROLES}${PLAYER_ROLES_CAMP}` : PLAYER_ROLES;
  const playerRoles: z.ZodRawShape = call.players > 1 ? { playerRoles: z.array(z.string()).max(call.players).describe(rolesText) } : {};
  const sharedOutcomes: z.ZodRawShape = shape.sharedOutcomes ? { sharedOutcomes: sameList(asArray(shape.sharedOutcomes, "sharedOutcomes"), written) } : {};
  const fields: z.ZodRawShape = {
    guidelines: guidelines.omit({ typesOfThreads: true, switchAndThreadInstructions: true }),
    ...(call.kind === "story" ? { difficultyLevel: shape.difficultyLevel } : { difficultyLevels: shape.difficultyLevels, teaser: shape.teaser }),
    ...playerRoles,
    storyElements: shape.storyElements,
    ...sharedOutcomes,
    playerOutcomes: z.object(Object.fromEntries(slots.map((slot) => [slot, ownList]))).describe(SEAT_OUTCOMES),
    sharedStats: shape.sharedStats,
    playerStats: shape.playerStats,
    characterSelectionPlan: plan.omit({ multiplayerCoordination: true }),
    ...Object.fromEntries(slots.map((slot) => [slot, seatWritten])),
    threadDesign: z
      .object({ typesOfThreads: guidelines.shape.typesOfThreads, switchAndThreadInstructions: guidelines.shape.switchAndThreadInstructions })
      .describe(THREAD_DESIGN),
    title: shape.title,
    characterSelectionIntroduction: shape.characterSelectionIntroduction,
    imageInstructions: shape.imageInstructions,
  };
  return z.object(fields).describe(schema.description ?? "");
}

// ---------------------------------------------------------------- the schemas

/** A new custom story or template: the adopted fields in the generation order. */
export function setupGenerationSchema(
  playerCount: PlayerCount,
  gameMode: GameMode,
  kind: "story" | "template",
  options: SetupSchemaOptions = {}
): z.AnyZodObject {
  const call: Call = { players: playerCount, mode: gameMode, kind, sections: ALL_SECTIONS, kids: options.kids ?? false };
  return generationOrderSchema(fieldOrderSchema(call, false), call);
}

/** AI Iteration: the template schema with the adopted descriptions, in today's order, cut to the requested sections and this player count. */
export function iterationSchema(sections: string[], playerCount: PlayerCount, gameMode: GameMode): z.ZodObject<z.ZodRawShape> {
  const call: Call = { players: playerCount, mode: gameMode, kind: "iteration", sections, kids: false };
  // The fallback line only where the stats are written in the same reply, after the rules
  const full = fieldOrderSchema(call, sections.includes("guidelines") && sections.includes("stats"));
  const keep = new Set<string>();
  for (const section of sections) {
    if (section in templateIterationSections) templateIterationSections[section as keyof typeof templateIterationSections].forEach((field) => keep.add(field));
  }
  if (sections.includes("players")) {
    for (let i = 1; i <= playerCount; i++) keep.add(`player${i}`);
  }
  return z.object(Object.fromEntries(Object.entries(full.shape).filter(([key]) => keep.has(key))) as z.ZodRawShape);
}

// ---------------------------------------------------------------- assembly

type Loose = Record<string, unknown>;
const asRecord = (value: unknown): Loose => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : {});
const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** The stat groups as template generation computes them: each stat's group once, in order, else "General". */
function statGroupsOf(...lists: unknown[]): string[] {
  const groups = new Set<string>();
  for (const stat of lists.flatMap(asList)) {
    const group = asRecord(stat).group;
    if (typeof group === "string" && group.trim() !== "") groups.add(group);
  }
  return groups.size ? [...groups] : ["General"];
}

/** Every outcome with its empty milestone list, which every later prompt reads. */
const withMilestones = (list: unknown) => asList(list).map((outcome) => ({ ...asRecord(outcome), milestones: [] }));

/**
 * A reply in the generation order, as the fields saved today and in today's
 * key order: the thread design back into the guidelines, each seat's
 * outcomes back on its seat, empty milestone lists, the stat groups
 * computed, the seat roles where the game keeps the character-selection plan
 * (its multiplayerCoordination), and an empty shared list for one player.
 */
export function assembleSetupReply(reply: unknown, playerCount: PlayerCount, kind: "story" | "template"): Loose {
  const written = asRecord(reply);
  const own = asRecord(written.playerOutcomes);
  const slots = PLAYER_SLOTS.slice(0, playerCount);
  const difficulty = kind === "story" ? { difficultyLevel: written.difficultyLevel } : { difficultyLevels: written.difficultyLevels, teaser: written.teaser };
  const plan = asRecord(written.characterSelectionPlan);
  return {
    guidelines: { ...asRecord(written.guidelines), ...asRecord(written.threadDesign) },
    ...difficulty,
    storyElements: written.storyElements,
    sharedOutcomes: withMilestones(written.sharedOutcomes),
    statGroups: statGroupsOf(written.sharedStats, written.playerStats),
    sharedStats: written.sharedStats,
    playerStats: written.playerStats,
    characterSelectionPlan: { multiplayerCoordination: asList(written.playerRoles), ...plan },
    ...Object.fromEntries(slots.map((slot) => [slot, { outcomes: withMilestones(own[slot]), ...asRecord(written[slot]) }])),
    title: written.title,
    characterSelectionIntroduction: written.characterSelectionIntroduction,
    imageInstructions: written.imageInstructions,
  };
}
