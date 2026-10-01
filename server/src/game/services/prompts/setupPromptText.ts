import { GameModes, kidsBandOf, type GameMode, type KidAges } from "core/types/index.js";

/*
 * The text of the setup form adopted on 2026-09-28: setup round 3 of
 * DOCS/2026-09-27_setup-generation-improvements.md as the eval measured it
 * (variant setupR3, the carried-forward form of rounds 1 and 2 with round 3's
 * changes; .plans/2026-09-26_build-followup.md, "Setup rounds"). What each
 * piece answers, in short:
 * - the engine facts, once, in real numbers (proposal 3);
 * - outcomes as a fixed slate per mode, player count and story length (1, 10);
 * - one opposites scoreboard per contest, with two camps when three players
 *   contest (proposal 2; contests have two sides, an accepted engine limit);
 * - stats that act in play and a one-line type catalogue (4, 5);
 * - one worked example instead of two long example setups (5);
 * - the identity-name clause (a seat keeps one name only when the premise
 *   names the character), the kids stat budget, and no "energy" in examples.
 * StorySetupPromptService assembles it; setupSchema.ts holds the fields'
 * descriptions. A test holds that production builds the measured requests
 * byte for byte (adoptedForms.test.ts), so change this text only with a
 * measured reason.
 */

export const isContestMode = (mode: GameMode): boolean => mode === GameModes.Competitive || mode === GameModes.CooperativeCompetitive;

// ---------------------------------------------------------------- the engine (A3.1)

export const ENGINE_HEADING = "How the game plays your setup";

const ENGINE_LINES = [
  ENGINE_HEADING,
  "- A story runs Switch, Thread, Switch, Thread, ..., Ending. A switch is one beat in which the player chooses what the next thread is about (topic switch) or, when the story has already fixed the topic (something urgent happened, the last thread must be followed up, or an outcome is running out of time), how to approach it (flavor switch). A thread is a mini-chapter of 2 to 4 beats that ends by adding one milestone to one outcome. At the end, one beat per player writes that player's ending from the outcomes' milestones.",
  "- Thread kinds: challenge threads (the default) are rolled as favorable, mixed or unfavorable, and stats shift the odds. Exploration threads have no roll: the option the player picks decides the result. Contest threads (competitive and cooperative-competitive multiplayer only) set side A against side B.",
  "- The roll: an even roll is 33/34/33 (favorable/mixed/unfavorable), and 50 points turn it into 50/50/0. Points come from the previous beat of the thread (+30 favorable, -30 unfavorable), the difficulty (-20 to +20), how sensible the chosen option is (+5 to -15), and at most two stats, each between -15 and +15. A sacrifice option always adds 30 points and its cost is always paid; a reward option always subtracts 30 and its gain is always received. So stats count only in challenge and contest threads, and one stat moves a roll by at most 15 points.",
  "- Who reads what. The switch and thread designers see the guidelines, the story elements, the outcomes with their milestone counts, the thread types, the switch/thread instructions, and for each stat only its name, value and narrative implications. The beats inside a thread see every stat field except the tooltip and the group (which only the players see) and the adjustments after threads; they don't see the switch/thread instructions and, of the outcomes, only the question the current thread pushes. The beat after each thread applies each stat's adjustments after threads and records the milestone. The ending reads the outcomes with their resonance and milestones, and the stats.",
  "- Design the parts together: the outcomes are the questions the ending answers, the thread types are the scenes in which players push them, the switch/thread instructions set this story's rhythm, and the stats are what those scenes put at stake.",
  "- These are facts about the engine. Don't restate them anywhere in the setup.",
];

/**
 * With the scoreboard ending rule, a contested outcome's scoreboard decides
 * it at the ending unless its milestones clearly say otherwise (the beat
 * prompt's SCOREBOARD_ENDING_RULE). Three sentences of the measured form were
 * true only while no stat decided an outcome; in the setups that have a
 * contest they say so (logged at setup round 1c to change with the rule).
 */
const ENDING_FROM_MILESTONES = "At the end, one beat per player writes that player's ending from the outcomes' milestones.";
const ENDING_WITH_SCOREBOARD =
  "At the end, one beat per player writes that player's ending from the outcomes' milestones and, for a contested outcome, from its scoreboard: the side ahead wins unless the milestones clearly say otherwise.";
const ONLY_PROGRESS_BAR = "they are the story's only progress bar.";
const PROGRESS_BAR_AND_SCOREBOARD = "they are the story's progress bar, and a contested outcome's scoreboard decides it at the ending unless its milestones clearly say otherwise.";
const NO_STAT_DECIDES = "nothing in the game reads a stat to decide an outcome or to end the story.";
const ONLY_THE_SCOREBOARD_DECIDES = "no stat decides an outcome or ends the story, apart from a contested outcome's scoreboard at the ending.";

/** The engine block; where three players contest, each side is a camp; where a contest has a scoreboard, it decides the ending. */
export function engineBlock(camps: boolean, contested: boolean): string {
  let text = ENGINE_LINES.join("\n");
  if (camps) text = text.replace("set side A against side B.", "set side A against side B. With three players, each side is a camp.");
  return contested ? text.replace(ENDING_FROM_MILESTONES, ENDING_WITH_SCOREBOARD) : text;
}

// ---------------------------------------------------------------- the inventory

export const INVENTORY_OUTCOMES = '\n- Outcomes: see the Outcomes section below and the "This setup" block at the end.';

/** Two players' contest (A2.1 with the seat-free tooltip): one opposites scoreboard per contest, named by role. */
export const SCOREBOARD_LINE =
  '--- A scoreboard for each contested shared outcome: exactly one shared opposites stat that shows who is ahead. Name its two sides after the two players\' roles in this story (for example "Enclave\'s Voice|Printers\' Voice"), never a player\'s seat ("Player 1") or a player character\'s name, because every player sees this name and players choose their characters\' names later; NPC names are fine, and so are the names the premise gives the player characters. The first side is player1\'s. It starts at 50 and moves only after a thread about that contest: 10 to 20 points toward the side that won the thread, none after a mixed result, so it is not adjustable anytime and has no sacrifice or reward. Its tooltip says it is the score of that contest and which role holds which side, without naming a seat ("player1"): each seat\'s backgrounds already carry its role. Give the side that is behind one way to catch up (for example a bonus when it takes a risk), so the race stays open. Never keep one counter per player.';

/** Three players' contest: two camps, one opposites scoreboard between them. */
export const CAMP_SCOREBOARD_LINE =
  '--- A scoreboard for each contested shared outcome, between the two camps: exactly one shared opposites stat that shows which camp is ahead. Name its two sides after the two camps in this story (for example "Enclave\'s Voice|Printers\' Voice"), never a player\'s seat ("Player 1") or a player character\'s name, because every player sees this name and players choose their characters\' names later; NPC names are fine, and so are the names the premise gives the player characters. The first side is player1\'s camp. It starts at 50 and moves only after a thread about that contest: 10 to 20 points toward the camp that won the thread, none after a mixed result, so it is not adjustable anytime and has no sacrifice or reward. Its tooltip says it is the score of that contest and which camp holds which side, without naming a seat ("player1"): each seat\'s backgrounds already carry its role and camp. Give the camp that is behind one way to catch up (for example a bonus when it takes a risk), so the contest stays open. Never keep one counter per player.';

// ---------------------------------------------------------------- outcomes

const IDENTITY_CLAUSE = {
  one: "- When the premise gives the player character a name (not only a role, such as 'a detective' or 'the customer'), use that name in outcomes and stats, and give the player three identities that keep the name and vary in appearance and details. Otherwise the three identities have three different names.",
  more: "- When the premise gives the player characters names (not only roles), use those names in outcomes and stats, and give each named seat three identities that keep its name and vary in appearance and details. Otherwise a seat's three identities have three different names.",
};

/** The fixed Outcomes section (A1.2 with the story-length floor, the seat roles, the identity clause and the scored-by line). */
export function outcomesSection(players: number, contested: boolean, camps: boolean): string {
  const multiplayer = players > 1;
  return [
    "Outcomes",
    `- Outcomes are the questions the ending answers. Milestones earned in threads move each outcome toward one of its three resolutions; ${contested ? PROGRESS_BAR_AND_SCOREBOARD : ONLY_PROGRESS_BAR}`,
    "- Each player's outcomes cover both sides of that character's story: the story's main conflict (the public question) and the character's private life (a relationship, a belief, a secret, who they are becoming).",
    multiplayer
      ? "- No two outcomes ask the same question in other words. A shared outcome is never repeated as a personal one, and no two players get the same personal outcome."
      : "- No two outcomes ask the same question in other words.",
    "- The field descriptions say which question form fits which kind of resolutions.",
    '- The "This setup" block at the end of these instructions says how many outcomes of which kind this setup has and how many milestones each carries.',
    ...(multiplayer
      ? [
          "- In multiplayer games there are one or two shared outcomes, never more. Every player keeps at least one personal outcome, and each player's personal outcomes carry at least 2 of that player's milestones (in short stories, as many as the \"This setup\" block says).",
          `- Each player seat has its own role in this story, shared by all three of that seat's backgrounds. Each background's text says the role.${
            camps ? " With three players and a contest, each role also names the seat's camp, side A or side B." : ""
          } A player's personal outcomes grow out of that role and must fit every identity and background that player can choose, so refer to the character by role or as "player2's character", never by a name, unless the premise itself names the player characters.`,
        ]
      : []),
    IDENTITY_CLAUSE[multiplayer ? "more" : "one"],
    ...(contested ? ['- A contested outcome\'s resonance ends with "Scored by <name of its scoreboard stat>."'] : []),
  ].join("\n");
}

// ---------------------------------------------------------------- story elements (A11, S2)

export const STORY_ELEMENTS_SECTION = `Story elements
- For NPCs, give pronouns with the name in the role, and the motivation as one fact.
- Use the instructions attribute to establish story hints and gameplay mechanics.
--- Example: "Mr. X only helps players in exchange for gold."
--- Example: "If players enter this location, the scene should involve significant danger."
--- Example: "Resting here restores 10 health at the end of the thread."

No franchise copyright infringement!
Don't borrow story elements from established franchises.
- Example: a story about a teenage wizard should not have NPCs named "Luna" or "Dumbledore".
- Example: a space opera should not have story elements from the universes of Star Trek Enterprise or Firefly.\n\n`;

// ---------------------------------------------------------------- stats (A4, A5)

export const CONTESTED_FAVOR =
  "--- If the players compete for one NPC's favor, that favor is a contest: one shared scoreboard stat, not a relationship stat for each player.";

/**
 * Which way a lever runs (fix 3 of the second playthroughs' review, the
 * lever-direction stage of 2026-09-30, adopted on 2026-10-01): a sacrifice
 * always costs the player and a reward always helps, also on a stat where more
 * is worse. Production's setups wrote 19 pressures' levers backwards against 7
 * the right way (the mouse story's "Give up 10% Cat's Nearness" moved the cat
 * away, a second benefit beside the sacrifice's +30); with this line and the
 * lever fields' wording (setupSchema.ts) every lever ran the right way in 12
 * of 12 measured setups, against production's 11 of 12.
 */
export const LEVER_DIRECTION_LINE =
  "- A sacrifice always costs the player and a reward always helps, whichever way the stat runs. On a stat where more is worse for the player (a danger, suspicion, a pursuer's nearness, pressure or strain), the sacrifice raises it and the reward lowers it: 'Let the guards' Suspicion rise 10% to slip past them in plain sight'; 'Lower Suspicion 10% by lying low instead of pressing on'.";

/** A4.1's stats that act in play, in place of today's "don't use stats for…" lines. */
export function statsThatAct(players: number, contested: boolean): string {
  const multiplayer = players > 1;
  const progressMeters = contested ? "- No progress meters (the one exception is the scoreboard of a contested outcome)." : "- No progress meters.";
  return [
    "- Every stat earns its place in play in at least two ways: it shifts chances in challenge scenes the thread types create (effects), it can be spent or earned in a scene (sacrifice or reward), or its thresholds change which threads and scenes happen (narrative implications).",
    "- Name the stats after what the premise says the characters care about or have to manage or balance: its resources, relationships and pressures (for example the Queen's opinion in a court intrigue, fuel on a long voyage, burnout for an activist).",
    "- Most player stats can be spent or earned in a scene: resources, reserves, contacts, items, moods. Only special powers, standings earned over the whole story (a rank, a faction's stance on a four-step scale) and trust that must be earned in a thread are 'None'.",
    LEVER_DIRECTION_LINE,
    `- Player stats are about the person: their values, their approach, their resilience, the people who support them.${
      multiplayer
        ? " A relationship between the player characters themselves is one shared stat, not a copy for each player. Every player gets every player stat, so none is written for one role or named after one player."
        : ""
    }`,
    `${progressMeters} Milestones already track how close an outcome is to its resolution, and ${contested ? ONLY_THE_SCOREBOARD_DECIDES : NO_STAT_DECIDES} Weak: 'Reform Progress (0-100%)', 'Fragments collected', 'Dream: Beginning → Fulfillment'. A list of concrete clues, allies or items is fine when each item opens options on its own.`,
    "- No two stats track the same thing. A stat may bear on an outcome as a lever the player spends or protects (a standing with the court, next to an outcome about the court's verdict).",
    "- Don't track the remaining turns or the players' ordinary decisions; the game tracks both.",
  ].join("\n");
}

/** A5's one-line catalogue, with A2.3's opposites line (a scoreboard use only where a contest has one). */
export function statTypes(players: number, contested: boolean): string {
  const uses = !contested
    ? "a disposition or alignment the player shifts, or a tug of war in the world"
    : players === 2
      ? "a disposition or alignment the player shifts, a tug of war in the world, or the scoreboard of a two-player contest (which moves after threads)"
      : "a disposition or alignment the player shifts, a tug of war in the world, or the scoreboard of a contest between the two camps (which moves after threads)";
  return [
    "Stat types",
    "- string: a state that changes in steps (a condition, a relationship state, a rank, a faction's standing).",
    "- string[]: a collection where having an item matters (abilities, inventory, contacts).",
    "- percentage: a capacity that is managed often and in small steps (health, fuel, oxygen; one relationship only if managing it is central).",
    `- opposites: two percentages in one; the second is 100 minus the first. Use it for a balance that moves both ways: ${uses}. Not for a pair where one side is simply better for the players, unless it is a tug of war the story is about.`,
    "- number: a countable quantity whose management is central (money, ammunition). Not for skills, influence, goals or friends, and not for counting progress.",
  ].join("\n");
}

// ---------------------------------------------------------------- the worked example (A5)

export const WORKED_EXAMPLE_HEADING = "WORKED EXAMPLE";

export const WORKED_EXAMPLE = `${WORKED_EXAMPLE_HEADING} (a different premise from yours; it shows how the parts fit, not what your setup should contain. Your counts come from the list above.)

Premise: A goblin activist fights for goblin rights in a kingdom where heroes hunt goblins for fame. (1 player)

Guidelines
- A rule that creates conflict: "Heroes are legally permitted to kill goblins for fame and fortune."
- Tone: "Moments of dark humor and satire, especially regarding the hypocrisy of 'heroic' culture."
- A conflict (a dilemma that returns, not a plot event): "Deciding when to compromise and when to stand firm."
- Thread types, public and private, with more than one way to fight:
  "Public protest (challenge, 3): rally goblins in a square the Hero Guild patrols without handing the Guild an excuse to crack down"
  "Secret negotiation (challenge, 3): win over a powerful figure who can't be seen with you"
  "Sabotage (challenge, 3): strike at a guild's trophy hall when talking has failed"
  "Rescue (challenge, 4): get goblins out of a hunting ground before the heroes' hunt begins"
  "Old friends (challenge, 2): keep a friend from the old neighbourhood on side when the movement puts them at risk"
  "A walk with Mia (exploration, 2): time with a hero's daughter, far from the movement's eyes"
- Switch and thread instructions:
  "If the activist is ever hurt physically, the next thread is about healing their wounds."
  "Around the middle of the story, someone launches a personal attack on the activist, socially or physically."
  "When Public Support falls below 30%, the next thread is about winning back the crowd."

Story element
- Gruk. Role: "Gruk (he/him), leader of the largest goblin enclave in the city, is a pragmatic organizer who sometimes clashes with more radical activists." Instructions: "Gruk can mobilize goblins for protests or provide sanctuary, but expects loyalty and dislikes reckless risks." A fact that is a hook: "Has a secret truce with a local hero, which he keeps hidden from most goblins."

Outcomes (all three are the player's own)
- Public, 3 milestones: "Will the Hero Guilds reform their anti-goblin policies?" Favorable: "The Hero Guilds adopt new codes that protect goblin rights and punish violence against them." Mixed: "Some reforms are enacted, but enforcement is weak and many heroes resist change." Unfavorable: "The Hero Guilds double down on anti-goblin violence, forcing goblins further underground."
- Private, 2: "Can the activist keep the trust of the goblins who knew them before, once humans know their face?" (favorable, mixed, unfavorable)
- Side, 1: "What will the activist's friendship with Mia, a hero's daughter, look like in the end?" (three paths)

Stats: the movement, the person, the people around them (groups: Movement, Personal, Relationships). One of each kind is shown; a real setup has the counts from the list above.
- Public Support (shared, percentage; not adjustable anytime, so it changes after threads and through its sacrifice and reward). Effects: "Above 70%: +10 in public challenges"; "Below 30%: -10 in public challenges". Sacrifice: "Give up 10% Public Support to push a controversial action through." Reward: "Gain 5% Public Support by making a dramatic gesture instead of a safe plea." Narrative: "Below 30%: onlookers are hostile, and heroes break up protests in the open"; "Above 70%: crowds join protests and offer help." After threads: "+10% after a favorable challenge thread about the crowd, -10% after an unfavorable one."
- Fervor (player, percentage, adjustable anytime): the activist's drive, which burnout drains. Effects: "Below 30%: -10 in rescues and sabotage"; "Above 70%: +5 when a protest runs into the night". Sacrifice: "Spend 15% Fervor to push through exhaustion." Reward: "Regain 10% Fervor by resting instead of acting." Narrative: "At 10% or below: the next switch forces an old-friends thread." After threads: "+10% after a favorable challenge thread about a friend, +5% after a mixed one."
- Community Standing (player, string: Newcomer, Respected Advocate, Movement Leader; not adjustable anytime). Effects: "Respected Advocate or above: +10 when rallying goblins"; "Newcomer: -10 in secret negotiations, where nobody vouches for the activist". Sacrifice: None. Reward: None (it is earned over the whole story). Narrative: "A Movement Leader is recognized on sight, by allies and by heroes." After threads: "One step up after a favorable challenge thread in which the activist led the crowd."
- Friends (player, list) and Romantic Interest (player, string) carry the private and side outcomes. Friends sacrifice: "Ask one friend for a risky favor; they leave the list until an old-friends thread."
Not stats: "Personal Safety" (the Hero Guilds' hostility already covers it), and any meter of how close the reforms are (the milestones track that).

In a cooperative version for two activists, the reform question is the shared outcome, and each activist keeps two personal outcomes from their role (player1 the enclave's organizer, player2 the movement's printer). In a competitive version where the two compete to lead the movement, "Who will speak for the goblins at the Queen's council?" is the contested outcome, and "Enclave's Voice|Printers' Voice" (opposites, starts at 50, moves 15 toward the winner of each leadership contest, not in single beats; its tooltip says which role holds which side) is its scoreboard.

Not like this: "+25 points when using a power" (a stat gives at most 15); "Can risk 10 followers for a +20 bonus" (a sacrifice names only its cost, and the cost is certain); "Followers (Player 1)" and "Followers (Player 2)" (one contest has one shared scoreboard, named by role).`;

// ---------------------------------------------------------------- the list rule and the game modes

export const NO_BLANK_ITEMS = "Every item in a list carries real content; a list never holds an empty or blank item.";

/** A1.5: the setup's game-mode sentences. */
export const GAME_MODES: Record<Exclude<GameMode, GameModes.SinglePlayer>, string> = {
  [GameModes.Competitive]:
    "The players compete against each other. At least one shared outcome is contested between them, and no shared outcome is a goal they pursue together; something they share, such as a friendship, can still be a shared question.",
  [GameModes.Cooperative]:
    "The players cooperate. At least one shared outcome is a goal they can only reach together. Each player also has a private arc that competes with the shared goal for their attention but never opposes it.",
  [GameModes.CooperativeCompetitive]:
    "The players cooperate on one shared goal and compete over one contested shared outcome, and each has a private arc. They balance helping each other against getting ahead.",
};

// ---------------------------------------------------------------- the slate ("This setup", A1.3 with A10)

export const THIS_SETUP_HEADING = "This setup";

/** The milestones each player earns over a story of this length: 6 at 25 turns, 4 at 15, 3 at 10 or fewer (A10). */
export function milestoneBudgetFor(maxTurns: number): number {
  return Math.max(3, Math.min(6, Math.round(maxTurns / 4)));
}

export type SlateMode = "single" | "cooperative" | "competitive" | "bond" | "cooperativeCompetitive";

/**
 * Milestones per outcome of a slate at budget M: `main` is the single
 * player's main conflict or the shared goal, `contest` the contested outcome,
 * `bond` the competitive variant's shared bond, `personal` each player's own
 * outcomes. A10's table for M = 6, 4 and 3; M = 5 puts the milestone beyond
 * M = 4 where the mode's weight is. Every player keeps at least 2 personal
 * milestones down to M = 4 and 1 at M = 3.
 */
export type SlateMilestones = { main: number; contest?: number; bond?: number; personal: number[] };

const SLATES: Record<SlateMode, Record<3 | 4 | 5 | 6, SlateMilestones>> = {
  single: { 6: { main: 3, personal: [2, 1] }, 5: { main: 2, personal: [2, 1] }, 4: { main: 2, personal: [1, 1] }, 3: { main: 1, personal: [1, 1] } },
  cooperative: { 6: { main: 3, personal: [2, 1] }, 5: { main: 3, personal: [1, 1] }, 4: { main: 2, personal: [1, 1] }, 3: { main: 1, personal: [2] } },
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

const milestones = (n: number) => `${n} milestone${n === 1 ? "" : "s"}`;

function personalOutcomes(personal: number[]): string {
  if (personal.length === 1) return `one personal outcome, with ${milestones(personal[0])}`;
  const [first, second] = personal;
  return first === second ? `two personal outcomes, with ${milestones(first)} each` : `two personal outcomes, with ${milestones(first)} and ${milestones(second)}`;
}

function storyLengthLine(maxTurns: number, multiplayer: boolean): string {
  const threads = Math.round(maxTurns / 4);
  const counting = multiplayer ? ", counting the shared outcomes" : "";
  return `- Story length: about ${maxTurns} turns, so each player plays about ${threads} thread${threads === 1 ? "" : "s"} and earns about ${milestoneBudgetFor(maxTurns)} milestones in total${counting}.`;
}

/**
 * The kids budget line. Its examples are the setup retests' of 2026-09-28
 * (the eval's setupR3b, KIDS_STATS_VARIED): round 3's "for example Courage,
 * Snacks, Forest Friends" had a kids setup copy an example in 4 of 4, Courage
 * every time; examples from other kinds of story, 1 of 4.
 */
export const KIDS_STATS =
  "- A child reads this story along with an adult, so keep the stats few and plain: two visible shared stats and two visible player stats, and no hidden ones. Name each in one or two everyday words a young reader knows, taken from this story's own world (a picnic story might count Snacks, a pirate story Gold Coins), and give it a tooltip of one short, simple sentence.";

/**
 * The kids budget line where the youngest child is 9 or older (the kids-ages
 * stage of 2026-10-01, the owner's decision: small up to about 10, "a little
 * more for older children"): a third visible player stat. Measured on two
 * setups at age 10: two shared and three player stats each, plain names,
 * every lever the right way.
 */
export const OLDER_KIDS_STATS =
  "- A child reads this story along with an adult, so keep the stats few and plain: two visible shared stats and three visible player stats, and no hidden ones. Name each in one or two everyday words a young reader knows, taken from this story's own world (a picnic story might count Snacks, a pirate story Gold Coins), and give it a tooltip of one short, simple sentence.";

/** Whether a kids setup takes the older children's budget: its youngest child is 9 or older. */
export const takesOlderKidsBudget = (kidAges: KidAges | undefined): boolean => kidAges !== undefined && kidsBandOf(kidAges) === "9-12";

const CAMPS =
  "Contests have two sides, so the three players form two camps: side A is player1's camp and side B the other, and one camp holds two players. The seat roles say which seat is in which camp.";

export type SlateCall = {
  players: number;
  mode: GameMode;
  maxTurns: number;
  /** Where the slate points at the scoreboard rule: only when the stat rules print (the stats are written) */
  pointsAtScoreboardRule: boolean;
  /** Both outcome lists are written anew (a new setup, or an iteration that regenerates both) */
  writesBothLists: boolean;
  /** A child reads along and the stat rules print */
  kids: boolean;
  /** The youngest child is 9 or older: a third visible player stat */
  olderKids?: boolean;
};

/** The "This setup" block: the story's length, then this mode's outcomes sized to its milestone budget. */
export function thisSetupBlock(call: SlateCall): string {
  const M = milestoneBudgetFor(call.maxTurns);
  const length = storyLengthLine(call.maxTurns, call.players > 1);
  const kids = call.kids ? [call.olderKids ? OLDER_KIDS_STATS : KIDS_STATS] : [];
  const pointer = call.pointsAtScoreboardRule ? " (see the scoreboard rule in the list of elements to include)" : "";
  const opposites = `- Keep the contested outcome's score in exactly one shared opposites stat${pointer}.`;
  let lines: string[];
  if (call.players === 1) {
    const slate = slateMilestones("single", M);
    const [privateLife, side] = slate.personal;
    const outcomes = `the story's main conflict as it lands on this character (${milestones(slate.main)}), the character's private life (${milestones(privateLife)}), and a smaller side question that pulls against one of the others, such as a person, a promise or a price (${milestones(side)}).`;
    lines = [
      length,
      call.writesBothLists
        ? `- No shared outcomes. The player has three outcomes of their own: ${outcomes}`
        : `- The player has three outcomes in all, whether this template keeps them in player1's list or in its shared list: ${outcomes}`,
      "- Shared stats describe the world and the people around the player. No stat keeps a score.",
      ...kids,
    ];
  } else {
    const sides = call.players === 2 ? "Side A is player1's character, side B is player2's." : CAMPS;
    switch (call.mode) {
      case GameModes.Cooperative: {
        const slate = slateMilestones("cooperative", M);
        const one = slate.personal.length === 1;
        lines = [
          length,
          `- One shared outcome for the goal the players can only reach together: the story's main conflict, ${milestones(slate.main)}. Its resonance names what each player, by role, stands to gain or lose.`,
          `- For each player, ${personalOutcomes(slate.personal)}, that ${one ? "grows" : "grow"} out of that player's role: a stake in the shared goal that only this player has, a relationship the goal strains, a doubt. ${
            one ? "It never opposes the shared goal, but it competes" : "They never oppose the shared goal, but they compete"
          } with it for the player's attention. ${one ? "It differs" : "They differ"} from the other players' outcomes.`,
          "- The players do not compete, so no stat keeps a score.",
          ...kids,
        ];
        break;
      }
      case GameModes.Competitive: {
        const slate = slateMilestones("competitive", M);
        const bond = slateMilestones("bond", M);
        lines =
          call.players === 2
            ? [
                length,
                `- One shared contested outcome about what the players compete for: ${milestones(slate.contest ?? 0)}. ${sides}`,
                `- For each player, ${personalOutcomes(slate.personal)}, about what winning or losing costs that character: a relationship the rivalry strains, a principle, a person they protect. Never split the prize into one personal outcome per player ("Does A win X?" and "Does B win X?").`,
                `- If the rivalry puts something the two characters share at risk, such as their friendship, make it a second shared outcome (${milestones(bond.bond ?? 0)}) instead of two mirrored personal outcomes. Then the contest has ${milestones(bond.contest ?? 0)}, and each player keeps one personal outcome with ${milestones(bond.personal[0])}.`,
                opposites,
                ...kids,
              ]
            : [
                length,
                `- One shared contested outcome about what the players compete for: ${milestones(slate.contest ?? 0)}. ${sides}`,
                `- For each player, ${personalOutcomes(slate.personal)}, about what winning or losing costs that character. ${slate.personal.length === 1 ? "It differs" : "They differ"} from the other players' outcomes.`,
                opposites,
                ...kids,
              ];
        break;
      }
      default: {
        const slate = slateMilestones("cooperativeCompetitive", M);
        lines = [
          length,
          `- One shared outcome the players can only achieve together: ${milestones(slate.main)}.`,
          `- One shared contested outcome about what the premise says the players compete for: ${milestones(slate.contest ?? 0)}. ${sides}`,
          `- For each player, one personal outcome about that character's private stake: ${milestones(slate.personal[0])}. The ${call.players === 2 ? "two players'" : "players'"} personal outcomes differ.`,
          opposites,
          ...kids,
        ];
      }
    }
  }
  return [THIS_SETUP_HEADING, ...lines].join("\n");
}

// ---------------------------------------------------------------- AI Iteration (A1.6)

export const ONE_OUTCOME_LIST =
  "You are regenerating only one of the shared outcomes and the player outcomes. Keep the other's outcomes as they are, and fit yours to them so that every player still has three outcomes and the same milestone total.";
export const KEEP_IDS = "Keep existing stats and outcomes under their current ids unless you remove them.";
