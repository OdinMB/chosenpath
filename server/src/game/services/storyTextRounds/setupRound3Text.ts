/*
 * Setup round 3's text (DOCS/2026-09-27_setup-generation-improvements.md,
 * section 4 "Round 3", Appendix A10 and A11), eval only until the owner
 * adopts it, with the owner's decisions of 2026-09-28:
 * - contests have two sides in every player count: three players with a
 *   contest form two camps, each contest with one opposites scoreboard (no
 *   three-player race, no "who leads" string; an accepted engine limit,
 *   .context/story.md);
 * - a story read with a child gets a smaller stat budget with plain names;
 * - a seat's three identities have three different names unless the premise
 *   names the character (the identity-name clause);
 * - no "energy" in the field examples;
 * - the story length (proposal 10) and conflict rules and hook facts with NPC
 *   pronouns in the role (proposal 11, S2).
 * setupRound1.ts prints these where a form's parts say round3 (ROUND3_PARTS),
 * setupRound2.ts the seat roles' camp line; the adjustments to the document's
 * text are in .plans/2026-09-26_build-followup.md ("Setup rounds: round 3").
 * No imports from the round builders, so they can import this.
 */

// ---------------------------------------------------------------- story length (A10)

/** The milestones each player earns over a story of this length: 6 at 25 turns, 4 at 15, 3 at 10 or fewer (A10). */
export function milestoneBudgetFor(maxTurns: number): number {
  return Math.max(3, Math.min(6, Math.round(maxTurns / 4)));
}

/** A10's first line of "This setup"; in multiplayer the shared outcomes count toward every player's total. */
export function storyLengthLine(maxTurns: number, multiplayer: boolean): string {
  const threads = Math.round(maxTurns / 4);
  const counting = multiplayer ? ", counting the shared outcomes" : "";
  return `- Story length: about ${maxTurns} turns, so each player plays about ${threads} thread${threads === 1 ? "" : "s"} and earns about ${milestoneBudgetFor(maxTurns)} milestones in total${counting}.`;
}

/** The slate's shapes: single player, the three multiplayer modes, and the competitive variant with a shared bond. */
export type SlateMode = "single" | "cooperative" | "competitive" | "bond" | "cooperativeCompetitive";

/**
 * Milestones per outcome of a slate at budget M: `main` is the single
 * player's main conflict or the shared goal (0 where the mode has none),
 * `contest` the contested outcome, `bond` the competitive variant's shared
 * bond, `personal` each player's own outcomes (a single player's private and
 * side questions). A10's table for M = 6, 4 and 3; M = 5, which the table
 * leaves out, puts the milestone beyond M = 4 where the mode's weight is (the
 * main question, the goal, the contest), and every player keeps at least 2
 * personal milestones down to M = 4 and 1 at M = 3.
 */
export type SlateMilestones = { main: number; contest?: number; bond?: number; personal: number[] };

const SLATES: Record<SlateMode, Record<3 | 4 | 5 | 6, SlateMilestones>> = {
  single: {
    6: { main: 3, personal: [2, 1] },
    5: { main: 2, personal: [2, 1] },
    4: { main: 2, personal: [1, 1] },
    3: { main: 1, personal: [1, 1] },
  },
  cooperative: {
    6: { main: 3, personal: [2, 1] },
    5: { main: 3, personal: [1, 1] },
    4: { main: 2, personal: [1, 1] },
    3: { main: 1, personal: [2] },
  },
  competitive: {
    6: { main: 0, contest: 3, personal: [2, 1] },
    5: { main: 0, contest: 3, personal: [1, 1] },
    4: { main: 0, contest: 2, personal: [1, 1] },
    3: { main: 0, contest: 1, personal: [2] },
  },
  bond: {
    6: { main: 0, contest: 2, bond: 2, personal: [2] },
    5: { main: 0, contest: 2, bond: 1, personal: [2] },
    4: { main: 0, contest: 1, bond: 1, personal: [2] },
    3: { main: 0, contest: 1, bond: 1, personal: [1] },
  },
  cooperativeCompetitive: {
    6: { main: 2, contest: 2, personal: [2] },
    5: { main: 1, contest: 2, personal: [2] },
    4: { main: 1, contest: 1, personal: [2] },
    3: { main: 1, contest: 1, personal: [1] },
  },
};

export function slateMilestones(mode: SlateMode, budget: number): SlateMilestones {
  const M = Math.max(3, Math.min(6, Math.round(budget))) as 3 | 4 | 5 | 6;
  return SLATES[mode][M];
}

/** "1 milestone", "2 milestones" */
export const milestones = (n: number) => `${n} milestone${n === 1 ? "" : "s"}`;

/** A player's personal outcomes as the slate names them: "two personal outcomes, with 2 milestones and 1 milestone". */
export function personalOutcomes(personal: number[]): string {
  if (personal.length === 1) return `one personal outcome, with ${milestones(personal[0])}`;
  const [first, second] = personal;
  return first === second ? `two personal outcomes, with ${milestones(first)} each` : `two personal outcomes, with ${milestones(first)} and ${milestones(second)}`;
}

/** A10 on A1.2's fixed floor: short stories give fewer personal milestones. */
export const SHORT_FLOOR = ' (in short stories, as many as the "This setup" block says)';

/**
 * A1.4's milestone field, deferring to the slate: at a short story length the
 * slate gives the main question fewer than the field's general 3 (the review
 * read before paying).
 */
export const MILESTONE_COUNT =
  'The count the "This setup" block gives this outcome; in general 1 for a side question that one thread decides, 2 as a default, 3 for the question the ending hinges on.';

// ---------------------------------------------------------------- two camps (owner, 2026-09-28)

/** The slate's contest line where three players contest: two sides, so two camps, player1's on side A. */
export const CAMPS =
  "Contests have two sides, so the three players form two camps: side A is player1's camp and side B the other, and one camp holds two players. The seat roles say which seat is in which camp.";

/** The seat roles bullet of the Outcomes section, where three players contest. */
export const ROLES_CAMP = " With three players and a contest, each role also names the seat's camp, side A or side B.";

/** The generation order's playerRoles field, where three players contest. */
export const PLAYER_ROLES_CAMP = " With three players and a contest, each line also names the seat's camp: 'player3: the landlord's nephew (side B)'.";

/** The engine block's contest line, where three players contest. */
export const ENGINE_CAMPS = " With three players, each side is a camp.";

/**
 * A2.1's two-player scoreboard rule for two camps (with round 1b's seat-free
 * tooltip): one opposites stat per contest, named after the camps.
 */
export const CAMP_SCOREBOARD_LINE =
  '--- A scoreboard for each contested shared outcome, between the two camps: exactly one shared opposites stat that shows which camp is ahead. Name its two sides after the two camps in this story (for example "Enclave\'s Voice|Printers\' Voice"), never a player\'s seat ("Player 1") or a player character\'s name, because every player sees this name and players choose their characters\' names later; NPC names are fine, and so are the names the premise gives the player characters. The first side is player1\'s camp. It starts at 50 and moves only after a thread about that contest: 10 to 20 points toward the camp that won the thread, none after a mixed result, so it is not adjustable anytime and has no sacrifice or reward. Its tooltip says it is the score of that contest and which camp holds which side, without naming a seat ("player1"): each seat\'s backgrounds already carry its role and camp. Give the camp that is behind one way to catch up (for example a bonus when it takes a risk), so the contest stays open. Never keep one counter per player.';

/** A6.1's question forms with every contest two-sided (the three-player race gone). */
export const QUESTION_FORMS =
  "- The question's form matches its resolutions: 'Will / Does / Can …?' takes favorable, mixed and unfavorable; 'Who / Which side …?' about one prize two sides compete for (two players, or with three players two camps) takes the contest resolutions; 'What / How / Which path …?' about a character's choice takes three paths.";

export const CAMP_SIDE_A = "Side A (player1's camp) wins.";
export const CAMP_SIDE_B = "Side B (the other camp) wins.";

/** The one-line catalogue's opposites use, where three players contest. */
export const CAMP_SCOREBOARD_USE = "the scoreboard of a contest between the two camps (which moves after threads)";

// ---------------------------------------------------------------- a child reads along (owner, 2026-09-28)

export const KIDS_STATS =
  "- A child reads this story along with an adult, so keep the stats few and plain: two visible shared stats and two visible player stats, and no hidden ones. Name each in one or two everyday words a young reader knows (for example Courage, Snacks, Forest Friends), and give it a tooltip of one short, simple sentence.";

/** Production's inventory lines and stat-list descriptions, with the kids budget. */
export const KIDS_INVENTORY: [string, string][] = [
  ["\n- 3-4 visible shared stats for things that are not directly linked to one player", "\n- Two visible shared stats for things that are not directly linked to one player"],
  ["\n--- Any invisible shared stats that you think are important", ""],
  ["\n- 3-4 visible stats that are directly linked to the player", "\n- Two visible stats that are directly linked to the player"],
  ["\n--- Any invisible stats that are linked to that player that you think are important", ""],
];
export const KIDS_SHARED_LIST = "Generate two visible shared stats and no hidden ones: a child reads this story.";
export const KIDS_PLAYER_LIST = "Generate two visible player stats and no hidden ones: a child reads this story.";
export const SHARED_LIST_COUNT = "Generate 3-4 visible shared stats, plus any invisible ones the story needs.";
export const PLAYER_LIST_COUNT = "Generate 3-4 visible player stats, plus any invisible ones the story needs.";

// ---------------------------------------------------------------- identities (the identity-name clause)

/** S8 with the one clause the fix run found missing: only a premise's name, not a role, is kept across a seat's identities. */
export const IDENTITY_CLAUSE: Record<"one" | "more", string> = {
  one: "- When the premise gives the player character a name (not only a role, such as 'a detective' or 'the customer'), use that name in outcomes and stats, and give the player three identities that keep the name and vary in appearance and details. Otherwise the three identities have three different names.",
  more: "- When the premise gives the player characters names (not only roles), use those names in outcomes and stats, and give each named seat three identities that keep its name and vary in appearance and details. Otherwise a seat's three identities have three different names.",
};

// ---------------------------------------------------------------- the retests (round 3b, 2026-09-28)

/**
 * The owner's feedback workflow's setup retests (round 3b): the identity
 * clause names premise-named players in outcomes only (round 3's "in outcomes
 * and stats" gave the Casablanca premise one set of player stats per named
 * player in both samples, against round 1c's "every player gets every player
 * stat"), and the kids stat examples no longer lead with Courage, which named a
 * stat in all four kids setups.
 */
export const IDENTITY_CLAUSE_OUTCOMES: Record<"one" | "more", string> = {
  one: IDENTITY_CLAUSE.one.replace("use that name in outcomes and stats,", "use that name in outcomes,"),
  more: IDENTITY_CLAUSE.more.replace("use those names in outcomes and stats,", "use those names in outcomes,"),
};

/**
 * The Casablanca sentence (round 3c, 2026-09-29, the final status note's
 * recommendation): round 3b's clause still gave Casablanca one set of player
 * stats per named player in 1 of 2 setups, and Susan's player stats carried her
 * name in 2 of 2 on both forms. The clause keeps round 3b's "in outcomes" (so
 * it no longer asks for the names in stats) and says it outright once, right
 * after: player stats never carry a player character's name, the premise's own
 * included. The scoreboard, a shared stat, may still name the premise's
 * characters (its own line says so). Retested 2026-09-29 (setupR3c, Luna low,
 * Casablanca and Susan twice each): Casablanca's per-player stats 2 of 2 on
 * round 3 to 0 of 2, Susan's named stats 2 of 2 to 2 of 2; nothing moved under
 * the stop rule over the four pairs, so production keeps round 3's clause.
 */
export const PLAYER_STATS_NAMELESS = "Player stats never carry a player character's name, even one the premise gives.";

export const IDENTITY_CLAUSE_NO_STAT_NAMES: Record<"one" | "more", string> = {
  one: `${IDENTITY_CLAUSE_OUTCOMES.one} ${PLAYER_STATS_NAMELESS}`,
  more: `${IDENTITY_CLAUSE_OUTCOMES.more} ${PLAYER_STATS_NAMELESS}`,
};

/**
 * The Casablanca sentence's second retest (round 3d, 2026-09-29, the
 * coordinator's brief after round 3c): the sentence in the multiplayer clause
 * only, where the per-player stat sets happen, with that clause's names "in
 * outcomes" (round 3's "in outcomes and stats" says the opposite). Round 3c
 * did nothing for a single named player (Susan), and one player's stat named
 * after the one character does no harm, so the one-player clause stays round
 * 3's, byte for byte as production sends it: no one-player prompt carries the
 * sentence, so nothing there contradicts it. Retested 2026-09-29 (setupR3d,
 * Luna low, Casablanca six times beside production's form at six):
 * per-player stat sets 0 of 6 against 2 of 6 (both of production's from round
 * 3's run; none in its four new samples), p 0.23, not moved; production keeps
 * round 3's clause.
 */
export const IDENTITY_CLAUSE_GROUPS_NAMELESS: Record<"one" | "more", string> = {
  one: IDENTITY_CLAUSE.one,
  more: IDENTITY_CLAUSE_NO_STAT_NAMES.more,
};

export const KIDS_STATS_VARIED = KIDS_STATS.replace(
  "Name each in one or two everyday words a young reader knows (for example Courage, Snacks, Forest Friends),",
  "Name each in one or two everyday words a young reader knows, taken from this story's own world (a picnic story might count Snacks, a pirate story Gold Coins),"
);

// ---------------------------------------------------------------- no "energy" in the field examples

/** Round 1's field examples and production's stat fields, each swap exactly once. */
export const ENERGY_SWAPS = {
  sacrifice: ["'Spend 10% energy'", "'Spend 10% fuel'"],
  reward: ["'Regain 10% energy by resting instead of pressing on'", "'Regain 10% health by resting instead of pressing on'"],
  flag: ["(energy, health)", "(health, fuel)"],
  catalogue: ["(health, energy, fuel; ", "(health, fuel, oxygen; "],
  statId: ["'player_energy'", "'player_health'"],
  statType: ["e.g., health, energy, relationship strength", "e.g., health, fuel, relationship strength"],
} as const satisfies Record<string, readonly [string, string]>;

// ---------------------------------------------------------------- proposal 11 (A11) and S2

/**
 * A11's field texts. Adjusted: the role's example puts the pronouns after the
 * name as its own sentence asks (S2), and the instructions say "adjusted
 * anytime", the flag's own words since round 1.
 */
export const GUIDELINE_FIELDS = {
  world:
    "Three sentences about the world the story takes place in, ending on the tension that sets the story going. Example: '… goblins have begun to organize and demand recognition, equality, and safety, but face fierce resistance from both the populace and the hero guilds.'",
  rules:
    "Fundamental laws and social structures of the story world (not your rules for creating the story). Good rules create the constraints and opportunities that drive conflict. Example: 'Heroes are legally permitted to kill goblins for fame and fortune.'",
  tone: "The emotional atmosphere and narrative voice: how dialogue, descriptions and humor should feel in this story. Example: 'Moments of dark humor and satire, especially regarding the hypocrisy of heroic culture.'",
  conflicts:
    "The core dilemmas characters face again and again: types of moral and strategic choices, not plot events. Each is answered by at least one outcome. Example: 'Deciding when to compromise and when to stand firm.'",
  decisionsAddition: "Name what is at stake in game terms: a resource spent, a relationship risked, or one outcome favored over another.",
};

export const ELEMENT_FIELDS = {
  role: "What the element is to the players (a lead, a helper, an obstacle, a prize or a threat), which conflict or goal it serves, and the tension it carries. For NPCs, put their pronouns right after the name. Example: 'Gruk (he/him), leader of the largest goblin enclave in the city, is a pragmatic organizer who sometimes clashes with more radical activists.'",
  instructions:
    "How the storyteller uses the element: how it behaves, what players can get from it and at what price or condition, and which stat it touches, by name. Stat effects happen at the end of a thread or as a sacrifice or reward, not in the middle of one, unless the stat can be adjusted anytime. Example: 'Gruk can mobilize goblins for protests or provide sanctuary, but expects loyalty and dislikes reckless risks.'",
  facts:
    "Three facts a thread can use, at least one of them a hook: a secret, a debt, a rivalry or a complication. For NPCs, one fact gives the motivation. Example: 'Has a secret truce with a local hero, which he keeps hidden from most goblins.'",
};

/** A11's two prompt edits in production's Story elements section. */
export const ELEMENT_PROMPT_EDITS: [string, string][] = [
  ["- For NPCs, include their preferred pronouns and motivations.", "- For NPCs, give pronouns with the name in the role, and the motivation as one fact."],
  ['--- Example: "If players enter this location, they restore 10 health."', '--- Example: "Resting here restores 10 health at the end of the thread."'],
];

/** The worked example's Gruk, with his pronouns in the role (S2). */
export const GRUK_ROLE: [string, string] = [
  'Role: "Leader of the largest goblin enclave in the city, Gruk is a pragmatic organizer who sometimes clashes with more radical activists."',
  'Role: "Gruk (he/him), leader of the largest goblin enclave in the city, is a pragmatic organizer who sometimes clashes with more radical activists."',
];

/** The passages the tests pin. */
export const ROUND3_TEXT = {
  campScoreboardStart: "--- A scoreboard for each contested shared outcome, between the two camps",
  sideAWins: CAMP_SIDE_A,
  rolesCamp: ROLES_CAMP.trim(),
  playerRolesCamp: PLAYER_ROLES_CAMP.trim(),
  engineCamps: ENGINE_CAMPS.trim(),
  questionForms: QUESTION_FORMS,
  shortFloor: SHORT_FLOOR.trim(),
  milestoneCount: MILESTONE_COUNT,
  kidsSharedList: KIDS_SHARED_LIST,
  kidsPlayerList: KIDS_PLAYER_LIST,
  identityClauseOne: IDENTITY_CLAUSE.one,
  identityClauseMore: IDENTITY_CLAUSE.more,
  npcPronouns: ELEMENT_PROMPT_EDITS[0][1],
  restHealth: ELEMENT_PROMPT_EDITS[1][1].replace('--- Example: "', "").replace('"', ""),
};
