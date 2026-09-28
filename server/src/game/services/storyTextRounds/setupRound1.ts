import { z } from "zod";
import { createStorySetupSchema, GameModes, PLAYER_SLOTS, type GameMode, type PlayerCount } from "core/types/index.js";
import { templateIterationSections } from "core/utils/templateIterationSections.js";
import { StorySetupPromptService } from "../prompts/StorySetupPromptService.js";
import type { TextRequest } from "../storyTextSteps.js";
import {
  CAMP_SCOREBOARD_LINE,
  CAMP_SCOREBOARD_USE,
  CAMP_SIDE_A,
  CAMP_SIDE_B,
  CAMPS,
  ELEMENT_FIELDS,
  ELEMENT_PROMPT_EDITS,
  ENERGY_SWAPS,
  ENGINE_CAMPS,
  GRUK_ROLE,
  GUIDELINE_FIELDS,
  IDENTITY_CLAUSE,
  KIDS_INVENTORY,
  KIDS_PLAYER_LIST,
  KIDS_SHARED_LIST,
  KIDS_STATS,
  MILESTONE_COUNT,
  PLAYER_LIST_COUNT,
  QUESTION_FORMS,
  ROLES_CAMP,
  SHARED_LIST_COUNT,
  SHORT_FLOOR,
  milestoneBudgetFor,
  milestones,
  personalOutcomes,
  slateMilestones,
  storyLengthLine,
} from "./setupRound3Text.js";

/*
 * Setup round 1 of DOCS/2026-09-27_setup-generation-improvements.md (section
 * 4, "Round 1"), eval only until the owner adopts it: proposals 1 (outcome
 * slates), 2 (the setup side of the scoreboard), 3 (the engine facts), 4
 * (stats that act in play), 5 (one worked example) and 6 (outcome questions
 * that name what is at stake), plus the one sentence that no list item is
 * blank. The wording is the document's Appendix A (A1 to A6), adjusted only
 * where the current code, round 1's scope or the review of round 1 says
 * otherwise; each adjustment is listed in .plans/2026-09-26_build-followup.md
 * under "Setup rounds" and "Setup rounds, review fixes".
 *
 * It edits production's own request: the prompt at anchors in production's
 * wording (each must occur exactly once in the instructions before the
 * configuration block, so a production edit there fails the tests instead of
 * silently undoing a change), and the schema by extending production's zod
 * instances, so the stat, outcome and player instances stay shared across
 * lists and seats. One user message, production's shape. Custom stories,
 * templates and AI Iteration each get the document's text where it says so.
 * The eval's variants.ts and setupRound2.ts are its callers.
 *
 * Later rounds build on the round-1 changes that passed the stop rule
 * (Round1Parts): proposals 3, 4 and 6 and the blank-items sentence are in
 * every form; 1, 2 and 5 only where they carry forward. Where one of those is
 * left out, production's text stands in its place, with the edits the
 * passing proposals make to that text (the setup document's own fallback for
 * proposal 5: "at least delete the contradicting example lines"). Round 1b
 * (ROUND1B_PARTS) is round 1 with the round-1 report's one-sentence fixes.
 */

type Kind = "story" | "template" | "iteration";

/**
 * Which of round 1's separable proposals a form keeps: 1 (the outcome slate,
 * with the fixed seat roles, S7 and S8's identities), 2 (the scoreboard, with
 * the stat-name rule) and 5 (the worked example, with the one-line catalogue
 * and without the "For each stat" block). The scoreboard needs the slate: its
 * "Scored by" line and the slates' pointers are printed there. `fixes` adds
 * the round-1 report's one-sentence fixes (round 1b) to the parts they fix:
 * the scoreboard names no seat and, for two players, has one or two effects;
 * the worked example's "Energy" is renamed. `everyPlayerStat` is proposal
 * 1's one fix-and-retest after round 1b (round 1c): with the seat roles,
 * every player gets every player stat. `round3` is setup round 3's changes
 * (setupRound3Text.ts): two-sided contests in every player count, the kids
 * stat budget, the identity-name clause, no "energy" in the field examples,
 * the story length (proposal 10) and conflict rules and hook facts with NPC
 * pronouns in the role (proposal 11, S2).
 */
export type Round1Parts = { slate: boolean; scoreboard: boolean; example: boolean; fixes: boolean; everyPlayerStat: boolean; round3?: boolean };
/** Setup round 1 as it ran: all six proposals. */
export const ROUND1_PARTS: Round1Parts = { slate: true, scoreboard: true, example: true, fixes: false, everyPlayerStat: false };
/**
 * The round-1 proposals that passed the stop rule as it was first read (3, 4
 * and 6), which round 2 built on. Under the moved reading of 2026-09-27
 * proposal 1 passes too (.plans/2026-09-26_build-followup.md, "Setup rounds,
 * stop rule").
 */
export const PASSING_ROUND1_PARTS: Round1Parts = { slate: false, scoreboard: false, example: false, fixes: false, everyPlayerStat: false };
/** Round 1b: all six proposals with the round-1 report's one-sentence fixes (setup round 1's fix run). */
export const ROUND1B_PARTS: Round1Parts = { slate: true, scoreboard: true, example: true, fixes: true, everyPlayerStat: false };
/**
 * Round 1c: round 1b with proposal 1's one fix-and-retest. In round 1b the
 * 3-4 visible player stats rule moved lower (36 to 31 of 36, p 0.027): each
 * of the five misses wrote one set of player stats per seat, by role or by
 * the premise's player names, which the seat roles and S8 invite.
 */
export const ROUND1C_PARTS: Round1Parts = { ...ROUND1B_PARTS, everyPlayerStat: true };
/**
 * Setup round 3's form: round 1c (the base of round 2b's carried-forward arm
 * B) with round 3's changes; setupRound2.ts adds the steering fields and the
 * generation order on top.
 */
export const ROUND3_PARTS: Round1Parts = { ...ROUND1C_PARTS, round3: true };

/** What a call knows beyond its premise, player count and mode: whether a child reads along (a read-with-kids story, a template tagged Kids). */
export type SetupCallOptions = { kids?: boolean };

type On = { players: PlayerCount; mode: GameMode; kind: Kind; sections: string[]; parts: Round1Parts; maxTurns: number; kids: boolean };

const ALL_SECTIONS = Object.keys(templateIterationSections);

const SEPARATOR = "#".repeat(50);

const isContestMode = (mode: GameMode) => mode === GameModes.Competitive || mode === GameModes.CooperativeCompetitive;
const contested = (on: On) => on.players > 1 && isContestMode(on.mode);
const asks = (on: On, ...sections: string[]) => sections.some((section) => on.sections.includes(section));
const asksOutcomes = (on: On) => asks(on, "sharedOutcomes", "players");
const asksStatRules = (on: On) => asks(on, "stats", "players");
/** The per-call slate speaks about outcomes and stats. */
const asksSlate = (on: On) => asks(on, "sharedOutcomes", "players", "stats");
/** Round 3: three players with a contest form two camps (owner, 2026-09-28: contests have two sides). */
const camps = (on: On) => !!on.parts.round3 && on.players === 3 && contested(on);
/** Round 3: a story read with a child gets the smaller stat budget. */
const kidsBudget = (on: On) => !!on.parts.round3 && on.kids;
/** An AI Iteration that regenerates only one of the two outcome lists and keeps the other (A1.6) */
const keepsOneList = (on: On) => on.kind === "iteration" && asks(on, "sharedOutcomes") !== asks(on, "players");
/** Both outcome lists are written anew: a new setup, or an iteration that regenerates both */
const writesBothLists = (on: On) => on.kind !== "iteration" || (asks(on, "sharedOutcomes") && asks(on, "players"));

// ---------------------------------------------------------------- the text

export const ENGINE_HEADING = "How the game plays your setup";
export const THIS_SETUP_HEADING = "This setup";
export const WORKED_EXAMPLE_HEADING = "WORKED EXAMPLE";

/** Round 1's one sentence about list items: the count fix's (storyTextRewrite/common.ts NO_EMPTY_ITEMS), stated in production's prompt. */
export const NO_BLANK_ITEMS = "Every item in a list carries real content; a list never holds an empty or blank item.";

/**
 * A3.1, checked against the code on 2026-09-27: the roll (beatResolutionUtils,
 * BeatResolutionService, which now clamps each stat to ±15 and counts two),
 * and who reads what (the state sections of the switch, thread and beat
 * prompts). The beats' detailed stat view shows possible values since round
 * 0, and never the tooltip or group, nor the adjustments inside a thread.
 * Three sentences hold only while the ending reads no stat to decide an
 * outcome ("from the outcomes' milestones" here, the Outcomes section's "only
 * progress bar", STATS_THAT_ACT's "nothing in the game reads a stat"): they
 * change in the same step as the ending's scoreboard rule (decision 3, turn
 * doc B8).
 */
const ENGINE = [
  ENGINE_HEADING,
  "- A story runs Switch, Thread, Switch, Thread, ..., Ending. A switch is one beat in which the player chooses what the next thread is about (topic switch) or, when the story has already fixed the topic (something urgent happened, the last thread must be followed up, or an outcome is running out of time), how to approach it (flavor switch). A thread is a mini-chapter of 2 to 4 beats that ends by adding one milestone to one outcome. At the end, one beat per player writes that player's ending from the outcomes' milestones.",
  "- Thread kinds: challenge threads (the default) are rolled as favorable, mixed or unfavorable, and stats shift the odds. Exploration threads have no roll: the option the player picks decides the result. Contest threads (competitive and cooperative-competitive multiplayer only) set side A against side B.",
  "- The roll: an even roll is 33/34/33 (favorable/mixed/unfavorable), and 50 points turn it into 50/50/0. Points come from the previous beat of the thread (+30 favorable, -30 unfavorable), the difficulty (-20 to +20), how sensible the chosen option is (+5 to -15), and at most two stats, each between -15 and +15. A sacrifice option always adds 30 points and its cost is always paid; a reward option always subtracts 30 and its gain is always received. So stats count only in challenge and contest threads, and one stat moves a roll by at most 15 points.",
  "- Who reads what. The switch and thread designers see the guidelines, the story elements, the outcomes with their milestone counts, the thread types, the switch/thread instructions, and for each stat only its name, value and narrative implications. The beats inside a thread see every stat field except the tooltip and the group (which only the players see) and the adjustments after threads; they don't see the switch/thread instructions and, of the outcomes, only the question the current thread pushes. The beat after each thread applies each stat's adjustments after threads and records the milestone. The ending reads the outcomes with their resonance and milestones, and the stats.",
  "- Design the parts together: the outcomes are the questions the ending answers, the thread types are the scenes in which players push them, the switch/thread instructions set this story's rhythm, and the stats are what those scenes put at stake.",
  "- These are facts about the engine. Don't restate them anywhere in the setup.",
].join("\n");

/** The engine block, with round 3's camps where three players contest. */
const engine = (on: On) => (camps(on) ? replaceOnce(ENGINE, "set side A against side B.", `set side A against side B.${ENGINE_CAMPS}`) : ENGINE);

/** A1.1 */
const INVENTORY_OUTCOMES = '\n- Outcomes: see the Outcomes section below and the "This setup" block at the end.';

/**
 * A2.1, printed for competitive and cooperative-competitive games only, with
 * smaller decision S8 (premise names may name the sides) and the flag in the
 * stat view's terms: "cannot be changed in beat resolutions" read, next to
 * the sacrifice field, as if a scoreboard could still be spent.
 */
const SCOREBOARD_LINE: Record<2 | 3, string> = {
  2: '--- A scoreboard for each contested shared outcome: exactly one shared opposites stat that shows who is ahead. Name its two sides after the two players\' roles in this story (for example "Enclave\'s Voice|Printers\' Voice"), never a player\'s seat ("Player 1") or a player character\'s name, because every player sees this name and players choose their characters\' names later; NPC names are fine, and so are the names the premise gives the player characters. The first side is player1\'s. It starts at 50 and moves only after a thread about that contest: 10 to 20 points toward the side that won the thread, none after a mixed result, so it is not adjustable anytime and has no sacrifice or reward. Its tooltip says it is the score of that contest and which role holds which side. Give the side that is behind one way to catch up (for example a bonus when it takes a risk), so the race stays open. Never keep one counter per player.',
  3: '--- A scoreboard for each contested shared outcome: one shared string stat whose values name who currently leads, by role or by the names the premise gives the player characters, plus "Nobody yet" (for example "Nobody yet, The Archivist, The Performer, The Neighbor"). List these values in its narrative implications and its tooltip, and say there which role belongs to which player. It changes only after threads about that contest, so it is not adjustable anytime and has no sacrifice or reward.',
};

/**
 * Round 1b's fix for the scoreboard (round-1 report, section 2): 10 of round
 * 1's 12 contest setups named seats in the tooltip ("player1's bounty
 * hunter") or the leader's values ("Player1's Founder"), as "which role holds
 * which side" and "which role belongs to which player" invited. The tooltip
 * and values name no seat; each seat's backgrounds carry its role. (Worded as
 * "no seat" rather than "roles only", since S8 lets the premise's own names
 * name the sides.)
 */
const ROLES_ONLY: Record<2 | 3, [string, string]> = {
  2: [
    "Its tooltip says it is the score of that contest and which role holds which side.",
    'Its tooltip says it is the score of that contest and which role holds which side, without naming a seat ("player1"): each seat\'s backgrounds already carry its role.',
  ],
  3: [
    "List these values in its narrative implications and its tooltip, and say there which role belongs to which player.",
    'List these values in its narrative implications and its tooltip, without naming a seat ("player1") in either: each seat\'s backgrounds already carry its role.',
  ],
};

function scoreboardLine(on: On): string {
  if (camps(on)) return CAMP_SCOREBOARD_LINE;
  const players = on.players as 2 | 3;
  return on.parts.fixes ? replaceOnce(SCOREBOARD_LINE[players], ...ROLES_ONLY[players]) : SCOREBOARD_LINE[players];
}

/** S8 for every player count: a named protagonist keeps the name in every identity. */
const PREMISE_NAMES: Record<"one" | "more", string> = {
  one: "- When the premise names the player character, use that name in outcomes and stats, and give the player three identities that keep the name and vary in appearance and details.",
  more: "- When the premise names the player characters, use those names in outcomes and stats, and give each seat three identities that keep the name and vary in appearance and details.",
};

/**
 * A1.2, with A2.2's contested-resonance line (contest modes only). The
 * document's "(in short stories, as many as the "This setup" block says)"
 * is left out: story length is proposal 10, in round 3. The milestone sizes
 * are the milestone field's and the slate's; the rules about two players'
 * outcomes are for multiplayer only.
 */
function outcomesSection(on: On): string {
  const multiplayer = on.players > 1;
  // Round 3: the floor follows the story length (A10), a seat's role names its camp, and the identity-name clause
  const floor = on.parts.round3 ? SHORT_FLOOR : "";
  const camp = camps(on) ? ROLES_CAMP : "";
  const names = on.parts.round3 ? IDENTITY_CLAUSE : PREMISE_NAMES;
  return [
    "Outcomes",
    "- Outcomes are the questions the ending answers. Milestones earned in threads move each outcome toward one of its three resolutions; they are the story's only progress bar.",
    "- Each player's outcomes cover both sides of that character's story: the story's main conflict (the public question) and the character's private life (a relationship, a belief, a secret, who they are becoming).",
    multiplayer
      ? "- No two outcomes ask the same question in other words. A shared outcome is never repeated as a personal one, and no two players get the same personal outcome."
      : "- No two outcomes ask the same question in other words.",
    "- The field descriptions say which question form fits which kind of resolutions.",
    '- The "This setup" block at the end of these instructions says how many outcomes of which kind this setup has and how many milestones each carries.',
    ...(multiplayer
      ? [
          `- In multiplayer games there are one or two shared outcomes, never more. Every player keeps at least one personal outcome, and each player's personal outcomes carry at least 2 of that player's milestones${floor}.`,
          `- Each player seat has its own role in this story, shared by all three of that seat's backgrounds. Each background's text says the role.${camp} A player's personal outcomes grow out of that role and must fit every identity and background that player can choose, so refer to the character by role or as "player2's character", never by a name, unless the premise itself names the player characters.`,
        ]
      : []),
    names[multiplayer ? "more" : "one"],
    ...(contested(on) && on.parts.scoreboard ? ['- A contested outcome\'s resonance ends with "Scored by <name of its scoreboard stat>."'] : []),
  ].join("\n");
}

/** A2.2, after the NPC-relationship rule (contest modes only). */
const CONTESTED_FAVOR = "--- If the players compete for one NPC's favor, that favor is a contest: one shared scoreboard stat, not a relationship stat for each player.";

/**
 * Round 1c's fix for proposal 1 (the round-1 report's suggestion, section 2):
 * with a role per seat, and the premise's player names allowed in stats (S8),
 * models wrote one set of player stats per seat, though every player gets
 * every player stat. Printed where the seats have roles.
 */
const EVERY_PLAYER_STAT = " Every player gets every player stat, so none is written for one role or named after one player.";

/**
 * A4.1, in place of the "Don't use stats for things that are covered by
 * other mechanics" lines. The scoreboard exception is stated once, and only
 * where a contest has a scoreboard; the relationship between the player
 * characters only where there are several.
 */
function statsThatAct(on: On): string {
  const progressMeters = contested(on) ? "- No progress meters (the one exception is the scoreboard of a contested outcome)." : "- No progress meters.";
  return [
    "- Every stat earns its place in play in at least two ways: it shifts chances in challenge scenes the thread types create (effects), it can be spent or earned in a scene (sacrifice or reward), or its thresholds change which threads and scenes happen (narrative implications).",
    "- Name the stats after what the premise says the characters care about or have to manage or balance: its resources, relationships and pressures (for example the Queen's opinion in a court intrigue, fuel on a long voyage, burnout for an activist).",
    "- Most player stats can be spent or earned in a scene: resources, reserves, contacts, items, moods. Only special powers, standings earned over the whole story (a rank, a faction's stance on a four-step scale) and trust that must be earned in a thread are 'None'.",
    `- Player stats are about the person: their values, their approach, their resilience, the people who support them.${on.players > 1 ? " A relationship between the player characters themselves is one shared stat, not a copy for each player." : ""}${on.players > 1 && on.parts.slate && on.parts.everyPlayerStat ? EVERY_PLAYER_STAT : ""}`,
    `${progressMeters} Milestones already track how close an outcome is to its resolution, and nothing in the game reads a stat to decide an outcome or to end the story. Weak: 'Reform Progress (0-100%)', 'Fragments collected', 'Dream: Beginning → Fulfillment'. A list of concrete clues, allies or items is fine when each item opens options on its own.`,
    "- No two stats track the same thing. A stat may bear on an outcome as a lever the player spends or protects (a standing with the court, next to an outcome about the court's verdict).",
    "- Don't track the remaining turns or the players' ordinary decisions; the game tracks both.",
  ].join("\n");
}

/** A5's one-line catalogue, with A2.3's opposites line (its scoreboard use only where a two-player contest has one). */
function statTypes(on: On): string {
  const uses =
    contested(on) && on.players === 2 && on.parts.scoreboard
      ? "a disposition or alignment the player shifts, a tug of war in the world, or the scoreboard of a two-player contest (which moves after threads)"
      : camps(on) && on.parts.scoreboard
        ? `a disposition or alignment the player shifts, a tug of war in the world, or ${CAMP_SCOREBOARD_USE}`
        : "a disposition or alignment the player shifts, or a tug of war in the world";
  const percentage = "- percentage: a capacity that is managed often and in small steps (health, energy, fuel; one relationship only if managing it is central).";
  return [
    "Stat types",
    "- string: a state that changes in steps (a condition, a relationship state, a rank, a faction's standing).",
    "- string[]: a collection where having an item matters (abilities, inventory, contacts).",
    on.parts.round3 ? replaceOnce(percentage, ...ENERGY_SWAPS.catalogue) : percentage,
    `- opposites: two percentages in one; the second is 100 minus the first. Use it for a balance that moves both ways: ${uses}. Not for a pair where one side is simply better for the players, unless it is a tug of war the story is about.`,
    "- number: a countable quantity whose management is central (money, ammunition). Not for skills, influence, goals or friends, and not for counting progress.",
    // Round 1b's review read: the stat guidelines' first bullet already says this, with its exceptions
    ...(on.parts.fixes ? [] : ["In general, favor string and string[] over numbers and percentages."]),
  ].join("\n");
}

/**
 * A5, made to follow the rules it sits beside (the document says it does):
 * three switch/thread instructions, as production's field allows (A7.1's
 * "two to four" is round 2), without the rhythm rule whose "public threads 3"
 * contradicted Rescue's 4 beats; each stat two effects; changes after threads
 * keyed on the kind of thread and its result (A4.2's fallback, as the field
 * says); the flag in the stat view's terms; the Public Support trigger stated
 * once (as the instruction); and "Reform Progress" left to the stat
 * guidelines' Weak list.
 */
const WORKED_EXAMPLE = `${WORKED_EXAMPLE_HEADING} (a different premise from yours; it shows how the parts fit, not what your setup should contain. Your counts come from the list above.)

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
- Gruk. Role: "Leader of the largest goblin enclave in the city, Gruk is a pragmatic organizer who sometimes clashes with more radical activists." Instructions: "Gruk can mobilize goblins for protests or provide sanctuary, but expects loyalty and dislikes reckless risks." A fact that is a hook: "Has a secret truce with a local hero, which he keeps hidden from most goblins."

Outcomes (all three are the player's own)
- Public, 3 milestones: "Will the Hero Guilds reform their anti-goblin policies?" Favorable: "The Hero Guilds adopt new codes that protect goblin rights and punish violence against them." Mixed: "Some reforms are enacted, but enforcement is weak and many heroes resist change." Unfavorable: "The Hero Guilds double down on anti-goblin violence, forcing goblins further underground."
- Private, 2: "Can the activist keep the trust of the goblins who knew them before, once humans know their face?" (favorable, mixed, unfavorable)
- Side, 1: "What will the activist's friendship with Mia, a hero's daughter, look like in the end?" (three paths)

Stats: the movement, the person, the people around them (groups: Movement, Personal, Relationships). One of each kind is shown; a real setup has the counts from the list above.
- Public Support (shared, percentage; not adjustable anytime, so it changes after threads and through its sacrifice and reward). Effects: "Above 70%: +10 in public challenges"; "Below 30%: -10 in public challenges". Sacrifice: "Give up 10% Public Support to push a controversial action through." Reward: "Gain 5% Public Support by making a dramatic gesture instead of a safe plea." Narrative: "Below 30%: onlookers are hostile, and heroes break up protests in the open"; "Above 70%: crowds join protests and offer help." After threads: "+10% after a favorable challenge thread about the crowd, -10% after an unfavorable one."
- Energy (player, percentage, adjustable anytime): activist burnout. Effects: "Below 30%: -10 in rescues and sabotage"; "Above 70%: +5 when a protest runs into the night". Sacrifice: "Spend 15% Energy to push through exhaustion." Reward: "Regain 10% Energy by resting instead of acting." Narrative: "At 10% or below: the next switch forces an old-friends thread." After threads: "+10% after a favorable challenge thread about a friend, +5% after a mixed one."
- Community Standing (player, string: Newcomer, Respected Advocate, Movement Leader; not adjustable anytime). Effects: "Respected Advocate or above: +10 when rallying goblins"; "Newcomer: -10 in secret negotiations, where nobody vouches for the activist". Sacrifice: None. Reward: None (it is earned over the whole story). Narrative: "A Movement Leader is recognized on sight, by allies and by heroes." After threads: "One step up after a favorable challenge thread in which the activist led the crowd."
- Friends (player, list) and Romantic Interest (player, string) carry the private and side outcomes. Friends sacrifice: "Ask one friend for a risky favor; they leave the list until an old-friends thread."
Not stats: "Personal Safety" (the Hero Guilds' hostility already covers it), and any meter of how close the reforms are (the milestones track that).

In a cooperative version for two activists, the reform question is the shared outcome, and each activist keeps two personal outcomes from their role (player1 the enclave's organizer, player2 the movement's printer). In a competitive version where the two compete to lead the movement, "Who will speak for the goblins at the Queen's council?" is the contested outcome, and "Enclave's Voice|Printers' Voice" (opposites, starts at 50, moves 15 toward the winner of each leadership contest, not in single beats; its tooltip says which role holds which side) is its scoreboard.

Not like this: "+25 points when using a power" (a stat gives at most 15); "Can risk 10 followers for a +20 bonus" (a sacrifice names only its cost, and the cost is certain); "Followers (Player 1)" and "Followers (Player 2)" (one contest has one shared scoreboard, named by role).`;

/**
 * Round 1b's fix for the worked example (round-1 report, section 2): 10 of
 * round 1's 36 setups named a stat "... Energy", the example's player stat,
 * against 4 of 36 on today's prompt. The stat gets a less common name.
 */
const RENAMED_STAT: [string, string][] = [
  ["- Energy (player, percentage, adjustable anytime): activist burnout.", "- Fervor (player, percentage, adjustable anytime): the activist's drive, which burnout drains."],
  ['"Spend 15% Energy to push through exhaustion."', '"Spend 15% Fervor to push through exhaustion."'],
  ['"Regain 10% Energy by resting instead of acting."', '"Regain 10% Fervor by resting instead of acting."'],
];

const workedExample = (on: On) => {
  const renamed = on.parts.fixes ? RENAMED_STAT.reduce((text, [passage, name]) => replaceOnce(text, passage, name), WORKED_EXAMPLE) : WORKED_EXAMPLE;
  // Round 3 (S2): the example's NPC carries its pronouns in the role, as the role field asks
  return on.parts.round3 ? replaceOnce(renamed, ...GRUK_ROLE) : renamed;
};

/*
 * Without proposal 5, production's catalogue, its "For each stat" block and its
 * two example stat setups stay, so the passing proposals' edits land on them
 * instead. Each passage must occur exactly once in the instructions.
 */

/** Proposal 4 (A4.1) on production's catalogue: numbers are not counters. */
const CATALOGUE_EDITS: [string, string][] = [["--- Counters (e.g., wins in a tournament, number of people saved)\n", ""]];

/**
 * Proposals 3 and 4 on production's "For each stat" block: A3.2's pointer in
 * place of the ±10/±20 effects and their two examples, "(expressed in
 * points)" dropped; the adjustments that A4.2's field no longer asks for
 * (player choices, decay and regeneration, choices that shift a balance);
 * and the flag as round 1's field reads it (a false flag still has its
 * sacrifice and reward).
 */
const FOR_EACH_STAT_EDITS: [string, string][] = [
  [" for a higher chance of success in certain beats (expressed in points)", " for a higher chance of success in certain beats"],
  [
    "Define how the stat changes based on player choices and thread resolutions (often unfavorable/mixed/favorable).",
    "Define how the stat changes based on thread resolutions (often unfavorable/mixed/favorable).",
  ],
  [
    '- Define decay or regeneration patterns (e.g., "Decreases by 5% per thread for each threat")\n- For opposites stats, define how choices shift the balance (e.g., "Major moral choices shift value by 5-15%")\n',
    "",
  ],
  [
    "- If false, the stat can only be changed after threads are resolved. Good for stats where a change would be very noticeable and/or have a long-term effect. This should only happen after a relevant thread is resolved.",
    "- If false, the stat changes when a thread gets resolved and through its own sacrifice and reward options. Good for stats where a change would be very noticeable and/or have a long-term effect.",
  ],
];

/**
 * Proposals 3 and 4 on production's example stat setups (setup doc section 3:
 * "if 5 slips, at least delete the contradicting example lines"; B3.4 lists
 * most of them). Effects beyond ±15 are clamped to 15, as the engine clamps
 * them; formula effects are cut, or made a threshold where the stat would keep
 * fewer than two effects, and penalties that grow over time are cut;
 * sacrifices and rewards name only their cost or gain, certain and in the
 * stat's own units (three rewards gain their amount); a special power's
 * sacrifice is 'None'; a third change after threads is cut (the field asks
 * for one or two), and changes are sized 5 to 15; the "Personal Dream"
 * ladder, the progress meter A4.1 names as weak, is cut whole.
 */
const EXAMPLE_EDITS: [string, string][] = [
  // Seasonal Powers
  ['"+30 points when using a specific power in a challenge directly related to that power",', '"+15 points when using a specific power in a challenge directly related to that power",'],
  ['optionsToSacrifice: "Can spend 20% energy to use a power for +30 points in a relevant challenge"', 'optionsToSacrifice: "None"'],
  [
    '"Powers may temporarily weaken (-10 points effectiveness) after an unfavorable resolution in a thread where they were heavily relied upon",\n    "Powers can evolve to more potent versions after repeated successful use in critical moments"\n',
    '"Powers may temporarily weaken (-10 points effectiveness) after an unfavorable resolution in a thread where they were heavily relied upon"\n',
  ],
  // Energy
  [
    'optionsToSacrifice: "Can spend 20% energy to use a Seasonal Power or 30% energy for a +20 point boost in any spiritual challenge"',
    'optionsToSacrifice: "Can spend 20% energy to use a Seasonal Power, or 30% energy in any spiritual challenge"',
  ],
  ['optionsToGainAsReward: "Can choose to rest and recover energy instead of pursuing immediate goals"', 'optionsToGainAsReward: "Can choose to rest and recover 10% energy instead of pursuing immediate goals"'],
  ['    "Regenerates 5% after each thread resolution for each special follower in your following",\n', ""],
  ['"Can be fully restored after a favorable resolution in a thread focused on spiritual renewal"', '"Increases by 15% after a favorable resolution in a thread focused on spiritual renewal"'],
  // Followers
  ['    "+1 point for every 10 followers in social influence challenges",\n', ""],
  ['"+15 points in challenges where followers can directly assist (maximum +30)",', '"+15 points in challenges where followers can directly assist",'],
  ['"-10 points in stealth challenges for each 20 followers due to increased visibility"', '"-10 points in stealth challenges above 50 followers due to increased visibility"'],
  ['optionsToSacrifice: "Can risk 10 followers (potentially losing them) for a +20 bonus in critical challenges"', 'optionsToSacrifice: "Can give up 10 followers in a critical challenge"'],
  // Special followers
  [
    'optionsToSacrifice: "Can send a special follower on a dangerous mission for a +30 bonus, risking their permanent loss"',
    'optionsToSacrifice: "Can send a special follower on a dangerous mission, losing them for good"',
  ],
  ['    "Can gain a new special follower at 100 regular followers or through a dedicated recruitment thread",\n', ""],
  // Threats: penalties that grow over time break the effects' absolute values (A3.2)
  [
    '"Multiple threats of the same category (e.g., two Human threats) intensify their narrative impact",\n    "Unaddressed threats escalate over time, changing their description and increasing their penalties"\n',
    '"Multiple threats of the same category (e.g., two Human threats) intensify their narrative impact"\n',
  ],
  [
    '"Threats can be removed through dedicated challenge threads with favorable resolutions",\n    "Threats may evolve or combine if multiple remain unaddressed for several threads"\n',
    '"Threats can be removed through dedicated challenge threads with favorable resolutions"\n',
  ],
  // Forest health
  ['"Below 30% applies -20 points to all nature-based challenges due to dying ecosystem",', '"Below 30% applies -15 points to all nature-based challenges due to dying ecosystem",'],
  [
    'optionsToSacrifice: "Can channel forest health (reducing it by 10%) for a +25 bonus in critical challenges"',
    'optionsToSacrifice: "Can channel forest health, reducing it by 10%, in a critical challenge"',
  ],
  [
    'optionsToGainAsReward: "Can focus on forest restoration instead of pursuing immediate goals"',
    'optionsToGainAsReward: "Can focus on forest restoration instead of pursuing immediate goals, restoring 10% forest health"',
  ],
  ['    "Decreases by 5% after each thread for each active forest threat",\n', ""],
  ['"Increases by 20% after favorable resolutions in threads focused on healing the forest",', '"Increases by 15% after favorable resolutions in threads focused on healing the forest",'],
  // Stage Presence
  ['    "Provides (Stage Presence - 50) points to performance challenges (negative at low values, positive at high values)",\n', ""],
  ['"+20 points in social challenges with fans when above 70%",', '"+15 points in social challenges with fans when above 70%",'],
  [
    'optionsToSacrifice: "Can push limits for a temporary +20 boost in a beat for a permanent -5% Stage Presence after the challenge"',
    'optionsToSacrifice: "Can push limits in a beat for a permanent -5% Stage Presence after the challenge"',
  ],
  [
    'optionsToGainAsReward: "Can choose riskier, more flamboyant performance options that might fail but build presence if successful"',
    'optionsToGainAsReward: "Can choose a riskier, more flamboyant performance option to gain 5% Stage Presence"',
  ],
  [
    '"Increases by 20% after favorable resolutions in performance threads",\n    "Decreases by 5-10% after public failures or embarrassments"\n',
    '"Increases by 15% after favorable resolutions in performance threads"\n',
  ],
  // Instrument Mastery
  ['"Provides -20/-10/0/+10/+20 points in performance and recording challenges based on level",', '"Provides -15/-10/0/+10/+15 points in performance and recording challenges based on level",'],
  // Band Loyalty|Solo Ambition
  [
    '"Shifts 5-15% toward Band Loyalty after favorable resolutions in collaborative threads",\n    "Major decisions in critical moments can cause shifts of up to 20%"\n',
    '"Shifts 5-15% toward Band Loyalty after favorable resolutions in collaborative threads"\n',
  ],
  // Gear Quality
  ['"Broken gear creates -20 points in professional venue challenges due to credibility loss",', '"Broken gear creates -15 points in professional venue challenges due to credibility loss",'],
  ['optionsToSacrifice: "Can push equipment beyond limits"', 'optionsToSacrifice: "Can push equipment beyond its limits, losing one level of Gear Quality"'],
  [
    'optionsToGainAsReward: "Can choose to maintain or upgrade equipment instead of pursuing immediate opportunities"',
    'optionsToGainAsReward: "Can choose to maintain or upgrade equipment instead of pursuing immediate opportunities, raising Gear Quality one level"',
  ],
  [
    '"Can improve one level after favorable resolutions in threads focused on equipment acquisition or repair",\n    "Extreme performance conditions (dust storms, temperature) may cause unexpected degradation"\n',
    '"Can improve one level after favorable resolutions in threads focused on equipment acquisition or repair"\n',
  ],
  // Fans
  ['    "+1 point for every 100 fans in performance challenges (maximum +20)",\n', ""],
  ['optionsToSacrifice: "Can alienate 50-100 fans for bonuses in artistic integrity challenges"', 'optionsToSacrifice: "Can alienate 50-100 fans in an artistic integrity challenge"'],
  // Group Chemistry
  ['"Above 70% provides +10 points to collaborative challenges, increasing to +20 above 90%"', '"Above 70% provides +10 points to collaborative challenges, increasing to +15 above 90%"'],
  [
    '"Decreases by 5-15% after conflicts or when individual ambitions are prioritized",\n    "Affected by the average Band Loyalty|Solo Ambition balance across all players"\n',
    '"Decreases by 5-15% after conflicts or when individual ambitions are prioritized"\n',
  ],
];

/** The "Personal Dream" ladder (B3.4, A4.1's weak "Dream: Beginning → Fulfillment"), from its heading through its last line. */
const PERSONAL_DREAM: [string, string] = ['\n\n\n- Personal Dream (string)', 'Initial value: "Beginning" (no variation)'];

/** A6.1's question form on production's multiplayer outcome block: a three-path example asks What / How / Which path. */
const ALEX_EXAMPLE: [string, string] = [
  "Example: Does Alex choose loyalty to the family or their own ambitions? 1. Loyalty.",
  "Example: Which path will Alex choose, loyalty to the family or their own ambitions? 1. Loyalty.",
];

/**
 * A6.1's three-player race (three paths, one per player) against production's
 * rule that a shared competitive outcome has side A, side B and a mixed
 * result: in a three-player contest call, the rule points to the exception.
 */
const THREE_PLAYER_RACE: [string, string] = [
  "--- Shared competitive outcomes should include one resolution for side A winning, one for side B winning, and one resolution that is mixed.",
  "--- Shared competitive outcomes should include one resolution for side A winning, one for side B winning, and one resolution that is mixed; a three-player race takes three paths instead, one per player, as the outcome description says.",
];

/** A1.5: the setup's game-mode sentences. */
const GAME_MODES: Record<Exclude<GameMode, GameModes.SinglePlayer>, string> = {
  [GameModes.Competitive]:
    "The players compete against each other. At least one shared outcome is contested between them, and no shared outcome is a goal they pursue together; something they share, such as a friendship, can still be a shared question.",
  [GameModes.Cooperative]:
    "The players cooperate. At least one shared outcome is a goal they can only reach together. Each player also has a private arc that competes with the shared goal for their attention but never opposes it.",
  [GameModes.CooperativeCompetitive]:
    "The players cooperate on one shared goal and compete over one contested shared outcome, and each has a private arc. They balance helping each other against getting ahead.",
};

/**
 * Where a slate points at the scoreboard rule, when the call prints it (it
 * prints with the stat lists). The document says "in STATS", but A2.1 puts
 * the rule in the list of elements to include.
 */
const SCOREBOARD_POINTER = "(see the scoreboard rule in the list of elements to include)";
const pointer = (on: On) => (asks(on, "stats") ? ` ${SCOREBOARD_POINTER}` : "");

const THREE_PATH_RACE =
  "Write its resolutions as three paths: resolution1, player1's character wins; resolution2, player2's; resolution3, player3's. (This is the three-player exception to the question-form rule in the outcome description.)";
/** The three-player slate points back to A2.1's lead string, as the two-player slate does, instead of restating it in other words. */
const leadString = (on: On) => `- Keep the contested outcome's score in one shared string stat that names who leads${pointer(on)}.`;
const opposites = (on: On) => `- Keep the contested outcome's score in exactly one shared opposites stat${pointer(on)}.`;

const SINGLE_PLAYER_OUTCOMES =
  "the story's main conflict as it lands on this character (3 milestones), the character's private life (2 milestones), and a smaller side question that pulls against one of the others, such as a person, a promise or a price (1 milestone).";

/**
 * A1.3, only this call's mode and player count. The document's first line
 * ("Story length: about 25 turns, so ...") is proposal 10, in round 3; round
 * 1 keeps production's fixed budget of 6 milestones, so it says only that.
 * An AI Iteration that keeps one outcome list may meet a single-player
 * template made before round 1, with outcomes in its shared list (B13: all
 * 16 of gpt-4.1's), so its slate counts the player's outcomes in both lists.
 */
/**
 * Round 3's slate (A1.3 with A10): the story's length first, then this
 * mode's outcomes sized to its milestone budget, contests two-sided in every
 * player count (three players form two camps), and, for a story read with a
 * child, the stat budget.
 */
function round3SlateLines(on: On): string[] {
  const M = milestoneBudgetFor(on.maxTurns);
  const length = storyLengthLine(on.maxTurns, on.players > 1);
  const kids = kidsBudget(on) && asksStatRules(on) ? [KIDS_STATS] : [];
  if (on.players === 1) {
    const slate = slateMilestones("single", M);
    const [privateLife, side] = slate.personal;
    const outcomes = `the story's main conflict as it lands on this character (${milestones(slate.main)}), the character's private life (${milestones(privateLife)}), and a smaller side question that pulls against one of the others, such as a person, a promise or a price (${milestones(side)}).`;
    return [
      length,
      writesBothLists(on)
        ? `- No shared outcomes. The player has three outcomes of their own: ${outcomes}`
        : `- The player has three outcomes in all, whether this template keeps them in player1's list or in its shared list: ${outcomes}`,
      "- Shared stats describe the world and the people around the player. No stat keeps a score.",
      ...kids,
    ];
  }
  const sides = on.players === 2 ? "Side A is player1's character, side B is player2's." : CAMPS;
  switch (on.mode) {
    case GameModes.Cooperative: {
      const slate = slateMilestones("cooperative", M);
      const one = slate.personal.length === 1;
      return [
        length,
        `- One shared outcome for the goal the players can only reach together: the story's main conflict, ${milestones(slate.main)}. Its resonance names what each player, by role, stands to gain or lose.`,
        `- For each player, ${personalOutcomes(slate.personal)}, that ${one ? "grows" : "grow"} out of that player's role: a stake in the shared goal that only this player has, a relationship the goal strains, a doubt. ${one ? "It never opposes the shared goal, but it competes" : "They never oppose the shared goal, but they compete"} with it for the player's attention. ${one ? "It differs" : "They differ"} from the other players' outcomes.`,
        "- The players do not compete, so no stat keeps a score.",
        ...kids,
      ];
    }
    case GameModes.Competitive: {
      const slate = slateMilestones("competitive", M);
      const bond = slateMilestones("bond", M);
      return on.players === 2
        ? [
            length,
            `- One shared contested outcome about what the players compete for: ${milestones(slate.contest ?? 0)}. ${sides}`,
            `- For each player, ${personalOutcomes(slate.personal)}, about what winning or losing costs that character: a relationship the rivalry strains, a principle, a person they protect. Never split the prize into one personal outcome per player ("Does A win X?" and "Does B win X?").`,
            `- If the rivalry puts something the two characters share at risk, such as their friendship, make it a second shared outcome (${milestones(bond.bond ?? 0)}) instead of two mirrored personal outcomes. Then the contest has ${milestones(bond.contest ?? 0)}, and each player keeps one personal outcome with ${milestones(bond.personal[0])}.`,
            opposites(on),
            ...kids,
          ]
        : [
            length,
            `- One shared contested outcome about what the players compete for: ${milestones(slate.contest ?? 0)}. ${sides}`,
            `- For each player, ${personalOutcomes(slate.personal)}, about what winning or losing costs that character. ${slate.personal.length === 1 ? "It differs" : "They differ"} from the other players' outcomes.`,
            opposites(on),
            ...kids,
          ];
    }
    default: {
      const slate = slateMilestones("cooperativeCompetitive", M);
      return [
        length,
        `- One shared outcome the players can only achieve together: ${milestones(slate.main)}.`,
        `- One shared contested outcome about what the premise says the players compete for: ${milestones(slate.contest ?? 0)}. ${sides}`,
        `- For each player, one personal outcome about that character's private stake: ${milestones(slate.personal[0])}. The ${on.players === 2 ? "two players'" : "players'"} personal outcomes differ.`,
        opposites(on),
        ...kids,
      ];
    }
  }
}

function slateLines(on: On): string[] {
  if (on.parts.round3) return round3SlateLines(on);
  const earns = (outcomes: "outcome" | "outcomes") => `- Each player earns about 6 milestones in total, counting the shared ${outcomes}.`;
  if (on.players === 1) {
    return [
      "- The player earns about 6 milestones in total.",
      writesBothLists(on)
        ? `- No shared outcomes. The player has three outcomes of their own: ${SINGLE_PLAYER_OUTCOMES}`
        : `- The player has three outcomes in all, whether this template keeps them in player1's list or in its shared list: ${SINGLE_PLAYER_OUTCOMES}`,
      "- Shared stats describe the world and the people around the player. No stat keeps a score.",
    ];
  }
  switch (on.mode) {
    case GameModes.Cooperative:
      return [
        earns("outcome"),
        "- One shared outcome for the goal the players can only reach together: the story's main conflict, 3 milestones. Its resonance names what each player, by role, stands to gain or lose.",
        "- For each player, two personal outcomes, with 2 milestones and 1 milestone, that grow out of that player's role: a stake in the shared goal that only this player has, a relationship the goal strains, a doubt. They never oppose the shared goal, but they compete with it for the player's attention. They differ from the other players' outcomes.",
        "- The players do not compete, so no stat keeps a score.",
      ];
    case GameModes.Competitive:
      return on.players === 2
        ? [
            earns("outcomes"),
            "- One shared contested outcome about what the players compete for: 3 milestones. Side A is player1's character, side B is player2's.",
            '- For each player, two personal outcomes, with 2 milestones and 1 milestone, about what winning or losing costs that character: a relationship the rivalry strains, a principle, a person they protect. Never split the prize into one personal outcome per player ("Does A win X?" and "Does B win X?").',
            "- If the rivalry puts something the two characters share at risk, such as their friendship, make it a second shared outcome (2 milestones) instead of two mirrored personal outcomes. Then the contest has 2 milestones, and each player keeps one personal outcome with 2.",
            opposites(on),
          ]
        : [
            earns("outcome"),
            `- One shared contested outcome about what the players compete for: 3 milestones. ${THREE_PATH_RACE}`,
            "- For each player, two personal outcomes, with 2 milestones and 1 milestone, about what winning or losing costs that character. They differ from the other players' outcomes.",
            leadString(on),
          ];
    default:
      // Cooperative-competitive; three players race over three paths (A1.3's "as the 2-player version, but ...")
      return [
        earns("outcomes"),
        "- One shared outcome the players can only achieve together: 2 milestones.",
        on.players === 2
          ? "- One shared contested outcome about what the premise says the players compete for: 2 milestones. Side A is player1's character, side B is player2's."
          : `- One shared contested outcome about what the premise says the players compete for: 2 milestones. ${THREE_PATH_RACE}`,
        `- For each player, one personal outcome about that character's private stake: 2 milestones. The ${on.players === 2 ? "two players'" : "players'"} personal outcomes differ.`,
        on.players === 2 ? opposites(on) : leadString(on),
      ];
  }
}

const thisSetup = (on: On) => [THIS_SETUP_HEADING, ...slateLines(on)].join("\n");

/** A1.6, for every player count: a single-player template made before round 1 can hold outcomes in its shared list. */
const ONE_OUTCOME_LIST =
  "You are regenerating only one of the shared outcomes and the player outcomes. Keep the other's outcomes as they are, and fit yours to them so that every player still has three outcomes and the same milestone total.";
/** Proposal 2's AI Iteration risk: a stats-only iteration must not rename what the outcomes and rules name. */
const KEEP_IDS = "Keep existing stats and outcomes under their current ids unless you remove them.";

// ---------------------------------------------------------------- prompt edits

function count(text: string, passage: string): number {
  return text.split(passage).length - 1;
}

function mustBeOnce(text: string, passage: string): void {
  const n = count(text, passage);
  if (n !== 1) throw new Error(`Setup round 1: "${passage.slice(0, 70)}" found ${n} times in production's setup instructions`);
}

/** The text with one passage replaced; the passage must occur exactly once. */
function replaceOnce(text: string, passage: string, replacement: string): string {
  mustBeOnce(text, passage);
  return text.split(passage).join(replacement);
}

/** The text with everything from `from` through `through` (both included) replaced; each must occur exactly once, in order. */
function replaceThrough(text: string, from: string, through: string, replacement: string): string {
  mustBeOnce(text, from);
  mustBeOnce(text, through);
  const start = text.indexOf(from);
  const end = text.indexOf(through) + through.length;
  if (end - through.length < start) throw new Error(`Setup round 1: "${through.slice(0, 70)}" comes before "${from.slice(0, 70)}"`);
  return text.slice(0, start) + replacement + text.slice(end);
}

/** The text with an insertion before the first of the markers that occurs. */
function insertBeforeFirst(text: string, markers: string[], insertion: string): string {
  const at = markers.map((marker) => text.indexOf(marker)).filter((i) => i >= 0);
  if (at.length === 0) throw new Error(`Setup round 1: none of ${markers.map((m) => `"${m.slice(0, 40)}"`).join(", ")} found`);
  const index = Math.min(...at);
  return text.slice(0, index) + insertion + text.slice(index);
}

/** Round 1's general instructions: production's, with A1 to A6 applied. */
function round1Instructions(production: string, on: On): string {
  let text = production;
  const opening = text.indexOf("\n\n") + 2;
  if (!/^(Create a setup|We already have a setup) for an interactive fiction game/.test(text)) {
    throw new Error("Setup round 1: production's setup prompt no longer opens as expected");
  }
  // A3.1 sits right after the opening line, so everything after it reads in its light
  text = `${text.slice(0, opening)}${engine(on)}\n\n${text.slice(opening)}`;
  // Round 3: a story read with a child gets the smaller stat budget in the inventory too (the slate says it once)
  if (kidsBudget(on) && asks(on, "stats")) for (const [passage, replacement] of KIDS_INVENTORY) text = replaceOnce(text, passage, replacement);
  // Round 3 (A11, S2): pronouns in the role, the motivation as a fact, and a rest example that says when it applies
  if (on.parts.round3 && asks(on, "storyElements")) for (const [passage, replacement] of ELEMENT_PROMPT_EDITS) text = replaceOnce(text, passage, replacement);

  if (asksOutcomes(on)) {
    if (on.parts.slate) {
      text = replaceThrough(text, "\n- A total of 3 outcomes for each player", "there should be 0 individual outcomes.", INVENTORY_OUTCOMES);
      text =
        on.players > 1
          ? replaceThrough(text, "Outcomes\n- Every player should have 3 outcomes", "become the new spirit leader?'\n\n\n", `${outcomesSection(on)}\n\n`)
          : replaceThrough(text, "Outcomes\n- The player should have 3 outcomes", "and one mixed.\n\n", `${outcomesSection(on)}\n\n`);
    } else if (on.players > 1) {
      // Production's outcome blocks stay; their three-path example takes A6.1's question form
      text = replaceOnce(text, ...ALEX_EXAMPLE);
      // and their two-sided contest line points at A6.1's three-path race, which the slate would have spelled out
      if (on.players === 3 && contested(on)) text = replaceOnce(text, ...THREE_PLAYER_RACE);
    }
  }
  if (asks(on, "stats") && on.players > 1 && on.parts.scoreboard) {
    const line = contested(on) ? `\n${scoreboardLine(on)}` : "";
    text = replaceOnce(text, "\n--- Stats to track the score about things that players compete over (e.g. territory control, which side the council/an npc leans towards, etc.)", line);
  }
  if (asksStatRules(on)) {
    text = replaceOnce(text, "Detective/Investigation/Contacts (for a mystery story)", "Detective/City/Contacts (for a mystery story)");
    if (contested(on) && on.parts.scoreboard) {
      const rule = "If only one specific player has a relationship with that NPC, use a character stat.\n";
      text = replaceOnce(text, rule, `${rule}${CONTESTED_FAVOR}\n`);
    }
    text = replaceThrough(text, "- Don't use stats for things that are covered by other mechanics.", "--- Don't track ordinary player decisions (tracked separately)\n", `${statsThatAct(on)}\n`);
    if (on.parts.example) {
      // The long catalogue, the old engine paragraph (now A3.1) and the "For each stat" block
      text = replaceThrough(text, "Type of stats and what they are good for:", "interesting part in the story.\n\n", `${statTypes(on)}\n\n`);
    } else {
      for (const [passage, replacement] of CATALOGUE_EDITS) text = replaceOnce(text, passage, replacement);
      // A3.1 replaces the old engine paragraph
      text = replaceThrough(text, "Context for additional stat parameters\n", "as it decides which milestone is added to the story state.\n\n", "");
      text = replaceThrough(text, "Effects on Beat Resolution\n", 'required to perform a risky maneuver")\n', "Effects on beat resolution: see the scale in 'How the game plays your setup'.\n");
      for (const [passage, replacement] of FOR_EACH_STAT_EDITS) text = replaceOnce(text, passage, replacement);
    }
  }
  if (on.parts.example) {
    // A5: the worked example where production's examples sit (production leaves them out of iteration; round 1 keeps its short one)
    text =
      on.kind === "iteration"
        ? insertBeforeFirst(text, ["Character Selection Instructions", "Difficulty Levels\n", SEPARATOR], `${workedExample(on)}\n\n`)
        : replaceThrough(text, "EXAMPLE STAT SETUPS", "Initial value: 70\n\n", `${workedExample(on)}\n\n`);
  } else if (on.kind !== "iteration") {
    for (const [passage, replacement] of EXAMPLE_EDITS) text = replaceOnce(text, passage, replacement);
    text = replaceThrough(text, ...PERSONAL_DREAM, "");
  }
  return replaceOnce(text, `${SEPARATOR}\n\n`, `${NO_BLANK_ITEMS}\n\n${SEPARATOR}\n\n`);
}

/**
 * Round 1's configuration block: A1.5's game-mode sentence, then A1.3's slate;
 * for AI Iteration also A1.6. All of it is proposal 1's, apart from the
 * scoreboard's iteration line (KEEP_IDS), so without the slate production's
 * block stays.
 */
function round1Configuration(configuration: string, on: On): string {
  if (!on.parts.slate) return configuration;
  const at = configuration.indexOf("Game mode: ");
  const lineEnd = configuration.indexOf("\n", at);
  if (at < 0 || lineEnd < 0) throw new Error("Setup round 1: no Game mode line in production's configuration block");
  const players = on.kind === "iteration" ? `Number of players: ${on.players}\n` : "";
  const mode = on.players > 1 ? GAME_MODES[on.mode as keyof typeof GAME_MODES] : configuration.slice(at + "Game mode: ".length, lineEnd);
  const slate = on.kind !== "iteration" || asksSlate(on) ? `\n${thisSetup(on)}\n` : "";
  let text = `${configuration.slice(0, at)}${players}Game mode: ${mode}\n${slate}${configuration.slice(lineEnd + 1)}`;
  if (on.kind === "iteration") {
    // These come after the user's feedback, so the last occurrence is production's own
    if (keepsOneList(on)) {
      const sections = `You must ONLY regenerate the following sections:\n${on.sections.join(", ")}\n`;
      const end = text.lastIndexOf(sections) + sections.length;
      text = `${text.slice(0, end)}\n${ONE_OUTCOME_LIST}\n${text.slice(end)}`;
    }
    if (asksSlate(on) && on.parts.scoreboard) {
      const consistency = "Maintain consistency with the other parts of the template that you are not changing.";
      const end = text.lastIndexOf(consistency) + consistency.length;
      text = `${text.slice(0, end)} ${KEEP_IDS}${text.slice(end)}`;
    }
  }
  return text;
}

function round1Prompt(production: string, on: On): string {
  // Edits apply to the general instructions only; the premise, template and feedback come after the separator
  const split = production.indexOf(`${SEPARATOR}\n\n`) + SEPARATOR.length + 2;
  return round1Instructions(production.slice(0, split), on) + round1Configuration(production.slice(split), on);
}

// ---------------------------------------------------------------- schema

function asObject(schema: unknown, label: string): z.AnyZodObject {
  if (!(schema instanceof z.ZodObject)) throw new Error(`Setup round 1: ${label} is not an object schema`);
  return schema;
}

function asArray(schema: unknown, label: string): z.ZodArray<z.ZodTypeAny> {
  if (!(schema instanceof z.ZodArray)) throw new Error(`Setup round 1: ${label} is not an array schema`);
  return schema;
}

function asUnion(schema: unknown, label: string): z.ZodUnion<[z.ZodTypeAny, ...z.ZodTypeAny[]]> {
  if (!(schema instanceof z.ZodUnion)) throw new Error(`Setup round 1: ${label} is not a union schema`);
  return schema;
}

/** The schema with one passage of its description replaced; the passage must occur exactly once. */
function reworded<T extends z.ZodTypeAny>(schema: T, passage: string, replacement: string): T {
  const description = schema.description ?? "";
  const n = count(description, passage);
  if (n !== 1) throw new Error(`Setup round 1: "${passage.slice(0, 70)}" found ${n} times in a description`);
  return schema.describe(description.split(passage).join(replacement));
}

const appended = <T extends z.ZodTypeAny>(schema: T, addition: string): T => schema.describe(`${schema.description ?? ""} ${addition}`.trim());

/**
 * A6.1, verbatim with the seat roles; without them (the slate left out), in
 * the wording A1.2 gives for decision 2 (b): the character is "player2's
 * character", never a name.
 */
const outcomeDescription = (on: On) =>
  [
    "A question the story's ending answers, from the milestones the players earn along the way.",
    '- Ask about one thing, in the story\'s own names (a person, faction, place or object from the story elements). Don\'t restate the premise, and don\'t join two questions with "and" or "without".',
    // Round 3: every contest has two sides, so no three-player race (owner, 2026-09-28)
    on.parts.round3
      ? QUESTION_FORMS
      : "- The question's form matches its resolutions: 'Will / Does / Can …?' takes favorable, mixed and unfavorable; 'Who / Which player …?' about one prize two players compete for takes the contest resolutions; 'What / How / Which path …?' about a character's choice takes three paths. In a three-player race, 'Who …?' takes three paths, one per player.",
    "- Each resolution is a concrete end state someone could picture. The favorable one may carry a price; the mixed and unfavorable ones are endings worth playing toward.",
    `- A player's outcomes fit every identity and background that player can choose, so refer to the character ${on.parts.slate ? "by role or " : ""}as "player2's character", never by a name, unless the premise itself names the player characters.`,
    "Examples (a story about goblin activists): 'Will the Hero Guilds reform their anti-goblin policies?' Favorable: the Guilds adopt codes that protect goblins and punish violence against them. Mixed: some reforms pass, but enforcement is weak and many heroes resist. Unfavorable: the Guilds double down, forcing goblins further underground. Contested: 'Who will become the King's Black Hand?' Three paths: 'What will the activist's friendship with Mia look like in the end?'",
    "Weak: 'Do the players successfully complete their mission?' It restates the premise and names nothing.",
  ].join("\n");

/**
 * A6.2, each kind of outcome only where the call has it. The shared line
 * names roles only where the seats have them (the slate), and the contested
 * line points to the scoreboard's "Scored by" rule only where it is printed.
 */
function resonance(on: On): string {
  const shared = on.parts.slate ? "what each player, by role, stands to gain or lose" : "what each player stands to gain or lose";
  const scored = on.parts.scoreboard ? " (and, see the Outcomes section, which stat keeps its score)" : "";
  return [
    "Why the answer matters, in one or two sentences.",
    "- Personal outcome: which need, fear, hope, relationship or secret of this character it tests, in a way that fits all of the player's backgrounds.",
    ...(on.players > 1 ? [`- Shared outcome: ${shared}, and why they can't settle it alone.`] : []),
    ...(contested(on) ? [`- Contested outcome: what drives each side and what winning would cost them${scored}.`] : []),
  ].join("\n");
}

/**
 * A6.3's three-path object description, after A6's replacement of the
 * schema's Alex example; the two are one description of one object.
 */
const THREE_PATHS =
  "Use this for outcomes about a character's choice between paths. Example: 'What will the activist's friendship with Mia look like in the end?' Three paths the character can end up on, each an end state. Exploration threads offer these paths as choices, so none is simply better.";

const MILESTONES = "1 for a side question that one thread decides, 2 as a default, 3 for the question the ending hinges on.";

/** A1.4 and A6: one outcome instance for the shared list and every seat. */
function round1Outcome(production: z.ZodTypeAny, generation: boolean, on: On): z.AnyZodObject {
  const outcome = asObject(production, "outcome");
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
      // A2.4's sides, proposal 2's; without it production's
      on.parts.scoreboard
        ? contest.extend({
            // Round 3: where three players contest, each side is a camp
            sideAWins: contest.shape.sideAWins.describe(camps(on) ? CAMP_SIDE_A : "Side A (player1's character in a two-player game) wins."),
            sideBWins: contest.shape.sideBWins.describe(camps(on) ? CAMP_SIDE_B : "Side B (player2's character in a two-player game) wins."),
            mixed: contest.shape.mixed.describe("A draw or a compromise between them."),
          })
        : contest,
      paths.extend({ resolution1: eachPath(), resolution2: eachPath(), resolution3: eachPath() }).describe(THREE_PATHS),
    ])
    .describe(union.description ?? "");
  // A1.4's milestone counts are proposal 1's; without it production's number and description. Round 3 defers to the slate (A10)
  const counts = on.parts.round3 ? MILESTONE_COUNT : MILESTONES;
  const milestoneField: z.ZodRawShape = on.parts.slate
    ? {
        // In the generation field list only (the difficulty precedent); the stored type stays a number, which the editor writes
        intendedNumberOfMilestones: generation
          ? z.union([z.literal(1), z.literal(2), z.literal(3)]).describe(counts)
          : outcome.shape.intendedNumberOfMilestones.describe(counts),
      }
    : {};
  return outcome
    .extend({
      question: outcome.shape.question.describe("The question, in one sentence, about one thing."),
      possibleResolutions: resolutions,
      resonance: outcome.shape.resonance.describe(resonance(on)),
      ...milestoneField,
    })
    .describe(outcomeDescription(on));
}

/** A3.2, the scoreboard exception only where a contest has a scoreboard. */
const statDescription = (on: On) =>
  `A variable the game tracks. In a challenge or contest scene it adds between -15 and +15 points to a choice (for scale: difficulty adds -20 to +20 to every roll, the previous beat's result ±30). A player can spend it for the game's fixed sacrifice bonus, or gain it by accepting the fixed reward malus. Its narrative implications are what the story's planners read to decide what happens next. No stat tracks progress toward an outcome, because milestones do that${contested(on) ? ", except the scoreboard of a contested outcome" : ""}.`;
const EFFECTS =
  "How this stat shifts the chance of success in challenge and contest scenes. Two or three effects, each a situation or threshold and a value in absolute terms: +5 slight, +10 clear, +15 decisive (and the same below zero), never beyond 15 either way and never a formula. At most two stats count for any one choice, so write effects for the situations in which this stat is the one that matters, in scenes this story's thread types create. Examples: 'Above 70%: +10 in social challenges'; '-15 when the ship is Damaged and a risky maneuver is needed'.";
/**
 * Round 1b's fix for the clash between the two-player scoreboard's "one way
 * to catch up" (A2.1) and "Two or three effects" (A3.2): both of round 1's
 * one-effect stats were such scoreboards. Other stats keep two or three.
 */
const SCOREBOARD_EFFECTS: [string, string] = ["Two or three effects, each", "Two or three effects (one or two for a contest's scoreboard, its catch-up among them), each"];
const effects = (on: On) =>
  on.parts.fixes && on.parts.scoreboard && contested(on) && (on.players === 2 || camps(on)) ? replaceOnce(EFFECTS, ...SCOREBOARD_EFFECTS) : EFFECTS;
/** Round 3: the field examples without "energy" (owner, 2026-09-28), each swap exactly once. */
const withoutEnergy = (on: On, text: string, swap: readonly [string, string]) => (on.parts.round3 ? replaceOnce(text, swap[0], swap[1]) : text);
/**
 * A4.2, with the flag apart: A4.2's "'None' only for a stat that must not
 * change within one scene" matches production's reading of a false flag
 * ("can only be changed after threads are resolved"), and GPT-6 already
 * writes 'None' for most false-flag player stats (Luna low 62 of 96, Sol low
 * 70 of 71 in the stored setups; gpt-4.1 3 of 152). So the None list is
 * named, and the flag says what the stat view says (turn doc B3 row 8).
 */
const sacrifice = (on: On) =>
  `What the player gives up from this stat, in its own units, to get the game's fixed sacrifice bonus in one scene: 'Spend 10% energy', 'Burn one contact to call in a favor'. The bonus is always the same, so never state it, and the loss is certain, never a risk. A stat that is not adjustable anytime still gets a sacrifice. Write 'None' only for a special power, a standing earned over the whole story, trust that must be earned in a thread${contested(on) ? ", or a contested outcome's scoreboard" : ""}.`;
const REWARD =
  "What the player gains of this stat, in its own units, for accepting the game's fixed reward malus in one scene: 'Regain 10% energy by resting instead of pressing on'. The gain is certain. A stat that is not adjustable anytime still gets a reward. Write 'None' only for the stats whose sacrifice is 'None'.";
/** The flag in the two labels the beats' stat view prints (StoryStatePromptService's detailed view). */
const CHANGEABLE_IN_BEATS =
  "Whether this stat can be adjusted anytime. True: small changes within a thread's scenes as well, for stats that are tracked often and in small steps (energy, health); the beats see 'Can be adjusted anytime'. False: it changes when a thread gets resolved and through its own sacrifice and reward, for stats where a change is noticeable or lasting (important world stats, special powers, relationships); the beats see 'Can only be changed when a thread gets resolved or through sacrifice/reward options'. This flag does not decide whether the stat has a sacrifice or a reward; those fields do.";
/**
 * A4.2 in its fallback form: keying a change on a thread type's name needs
 * the thread designer to name its thread after one (A8's typeOfThread line),
 * which play does not ask yet; round 0 already shows the type where the
 * adjustments are applied. So a change is keyed on the kind of thread.
 */
const ADJUSTMENTS =
  "One or two changes after threads, each keyed on the kind of thread and its result: favorable, mixed or unfavorable; for a contest, which side won. Example: '+10% after a favorable challenge thread about the crowd'. Size changes so the stat can move across its range over about six threads (a percentage by 5 to 15). Changes after unfavorable results can be real setbacks.";
const TOOLTIP = "One sentence for the player: what the stat is and the value or use that matters. No disclaimers about what it does not mean.";
/** A2.4, with smaller decision S8 */
const NAME_ADDITION =
  "Never a player's seat ('Player 1') or a player character's name: every player sees this name, and players choose their characters' names later. NPC names are fine. When the premise names the player characters, their names are fine too.";

/**
 * A2.4, A3.2 and A4.2: one stat instance for the shared and the player list.
 * A2.4's name rule leaves with the scoreboard: without the scoreboard's role
 * names it would forbid the only side names production's own opposites
 * example offers ("playerA|playerB").
 */
function round1Stat(production: z.ZodTypeAny, on: On): z.AnyZodObject {
  const stat = asObject(production, "stat");
  // Round 3 swaps "energy" out of production's type and id examples too
  const energyFree: z.ZodRawShape = on.parts.round3
    ? { type: reworded(stat.shape.type, ...ENERGY_SWAPS.statType), id: reworded(stat.shape.id, ...ENERGY_SWAPS.statId) }
    : {};
  return stat
    .extend({
      ...energyFree,
      name: on.parts.scoreboard ? appended(stat.shape.name, NAME_ADDITION) : stat.shape.name,
      effectOnPoints: asArray(stat.shape.effectOnPoints, "effectOnPoints").max(3).describe(effects(on)),
      optionsToSacrifice: stat.shape.optionsToSacrifice.describe(withoutEnergy(on, sacrifice(on), ENERGY_SWAPS.sacrifice)),
      optionsToGainAsReward: stat.shape.optionsToGainAsReward.describe(withoutEnergy(on, REWARD, ENERGY_SWAPS.reward)),
      canBeChangedInBeatResolutions: stat.shape.canBeChangedInBeatResolutions.describe(withoutEnergy(on, CHANGEABLE_IN_BEATS, ENERGY_SWAPS.flag)),
      adjustmentsAfterThreads: asArray(stat.shape.adjustmentsAfterThreads, "adjustmentsAfterThreads").max(2).describe(ADJUSTMENTS),
      tooltip: stat.shape.tooltip.describe(TOOLTIP),
    })
    .describe(statDescription(on));
}

/** Round 3's proposal 11 (A11): the guideline fields, where a schema has them. */
function round3Guidelines(production: z.ZodTypeAny): z.AnyZodObject {
  const guidelines = asObject(production, "guidelines");
  return guidelines.extend({
    world: guidelines.shape.world.describe(GUIDELINE_FIELDS.world),
    rules: guidelines.shape.rules.describe(GUIDELINE_FIELDS.rules),
    tone: guidelines.shape.tone.describe(GUIDELINE_FIELDS.tone),
    conflicts: guidelines.shape.conflicts.describe(GUIDELINE_FIELDS.conflicts),
    decisions: appended(guidelines.shape.decisions, GUIDELINE_FIELDS.decisionsAddition),
  });
}

/** Round 3's proposal 11 (A11) and S2: the story element's role, instructions and facts. */
function round3Elements(production: z.ZodTypeAny): z.ZodArray<z.ZodTypeAny> {
  const list = asArray(production, "storyElements");
  const element = asObject(list.element, "story element");
  const written = element.extend({
    role: element.shape.role.describe(ELEMENT_FIELDS.role),
    instructions: element.shape.instructions.describe(ELEMENT_FIELDS.instructions),
    facts: element.shape.facts.describe(ELEMENT_FIELDS.facts),
  });
  return z.array(written).describe(list.description ?? "");
}

/** A1.4; the outcome description says they fit every identity and background, so this one doesn't repeat it. */
const PLAYER_OUTCOMES =
  "This player's own outcomes. Only elements of the ending, no intermediate goals. In multiplayer games, questions that concern all players go into sharedOutcomes instead.";
const SHARED_OUTCOMES =
  "Outcomes that concern all players: goals they pursue together and prizes they compete over. Each counts toward every player's outcomes and milestones. Only elements of the ending, no intermediate goals.";
/**
 * A single-player template's shared list in AI Iteration. A template made
 * before round 1 can hold outcomes there (B13: all 16 of gpt-4.1's, 7 with
 * only shared ones): regenerated with player1's, they fold into player1's
 * three; regenerated alone, they stay, since player1's outcomes are not
 * rewritten and an empty list could leave the template with none.
 */
const singlePlayerSharedOutcomes = (sections: string[]) =>
  sections.includes("players")
    ? "Single-player template: leave this list empty; every outcome belongs to player1, so fold any of the template's shared outcomes you keep into player1's three."
    : "Single-player template: you are not regenerating player1's outcomes here, so keep the template's shared outcomes (revised as the feedback asks) and add none; together with player1's, the player has three outcomes.";
const COORDINATION =
  "For multiplayer games: give each player seat its own role in this story, meaning what that character does for the group or wants that the others don't. All three of that seat's identities and backgrounds stay within the role, and so do its personal outcomes. If the shared outcomes or stats above already name the roles, use those names. Example: 'player1 is the enclave's organizer (backgrounds: veteran, newcomer, defector); player2 is the movement's printer (…)'. List up to three such mechanisms. For single-player games, leave this empty.";
const ROLE_IN_BACKGROUND = "In multiplayer games, name the seat's role in the story.";
const CONSIDER_A_SCORE =
  " For multiplayer games with a competitive element, consider adding an opposite stat to track who is in the lead (for 2 players) or a string to track which player currently has the most momentum (for 3+ players).";
const SCOREBOARD_STATS = " In competitive and cooperative-competitive games, one of these is the scoreboard of each contested shared outcome, as the stat rules describe.";

/**
 * One player instance for every seat: the outcome slate's list, and in
 * multiplayer backgrounds that name the seat's role; without the slate,
 * production's list and backgrounds, on round 1's outcome instance.
 */
function round1Player(production: z.ZodTypeAny, outcome: z.AnyZodObject, multiplayer: boolean, on: On): z.AnyZodObject {
  const player = asObject(production, "player");
  if (!on.parts.slate) {
    const outcomes = asArray(player.shape.outcomes, "outcomes");
    return player.extend({ outcomes: z.array(outcome).describe(outcomes.description ?? "") });
  }
  const backgrounds = asArray(player.shape.possibleCharacterBackgrounds, "possibleCharacterBackgrounds");
  const background = asObject(backgrounds.element, "character background");
  const fields: z.ZodRawShape = { outcomes: z.array(outcome).max(3).describe(PLAYER_OUTCOMES) };
  if (multiplayer) {
    const withRole = background.extend({ fluffTemplate: appended(background.shape.fluffTemplate, ROLE_IN_BACKGROUND) });
    fields.possibleCharacterBackgrounds = z.array(withRole).describe(backgrounds.description ?? "");
  }
  return player.extend(fields);
}

/**
 * Round 1's full setup schema: for a custom story or a template, the
 * generation field list (no shared list for one player, milestone counts 1 to
 * 3); for AI Iteration, the template schema it is cut from (one player keeps
 * the shared list, described by the sections regenerated; milestone counts
 * stay numbers).
 */
export function round1SetupSchema(
  playerCount: PlayerCount,
  gameMode: GameMode,
  kind: Kind,
  sections: string[] = ALL_SECTIONS,
  parts: Round1Parts = ROUND1_PARTS,
  options: SetupCallOptions = {}
): z.AnyZodObject {
  const production = asObject(createStorySetupSchema(playerCount, kind === "iteration" ? "template" : kind), "setup");
  // The schema reads no story length; the slate and its prompt lines do
  const on = onFor(playerCount, gameMode, kind, sections, parts, 0, options);
  const multiplayer = playerCount > 1;
  const shape = production.shape;
  const outcome = round1Outcome(asArray(shape.sharedOutcomes, "sharedOutcomes").element, kind !== "iteration", on);
  const stat = round1Stat(asArray(shape.sharedStats, "sharedStats").element, on);
  const player = round1Player(shape.player1, outcome, multiplayer, on);
  const plan = asObject(shape.characterSelectionPlan, "characterSelectionPlan");
  const slots = Object.keys(shape).filter((key) => PLAYER_SLOTS.includes(key));
  // Existing keys keep their place in production's order (zod's extend)
  const scored = parts.scoreboard ? reworded(shape.sharedStats, CONSIDER_A_SCORE, contested(on) ? SCOREBOARD_STATS : "") : shape.sharedStats;
  // Round 3: a story read with a child gets two visible stats of each kind and no hidden ones
  const sharedStats = kidsBudget(on) ? reworded(scored, SHARED_LIST_COUNT, KIDS_SHARED_LIST) : scored;
  const playerStats = kidsBudget(on) ? reworded(shape.playerStats, PLAYER_LIST_COUNT, KIDS_PLAYER_LIST) : shape.playerStats;
  const fields: z.ZodRawShape = {
    sharedStats: z.array(stat).describe(sharedStats.description ?? ""),
    playerStats: z.array(stat).describe(playerStats.description ?? ""),
    ...Object.fromEntries(slots.map((slot) => [slot, player])),
    // Round 3's proposal 11: conflict rules and hook facts, NPC pronouns in the role
    ...(parts.round3 ? { guidelines: round3Guidelines(shape.guidelines), storyElements: round3Elements(shape.storyElements) } : {}),
  };
  if (!parts.slate) {
    // Production's shared list for every player count, on round 1's outcome instance
    fields.sharedOutcomes = z.array(outcome).describe(shape.sharedOutcomes.description ?? "");
    return production.extend(fields);
  }
  if (multiplayer) {
    fields.sharedOutcomes = z.array(outcome).max(2).describe(SHARED_OUTCOMES);
    const coordination = asArray(plan.shape.multiplayerCoordination, "multiplayerCoordination").describe(COORDINATION);
    fields.characterSelectionPlan = plan.extend({ multiplayerCoordination: coordination });
  } else if (kind === "iteration") {
    fields.sharedOutcomes = z.array(outcome).describe(singlePlayerSharedOutcomes(sections));
  }
  // A new story or template with one player has no shared list; the code fills in an empty one (setup doc B1.8)
  const base = multiplayer || kind === "iteration" ? production : production.omit({ sharedOutcomes: true });
  return base.extend(fields);
}

/** A template schema cut to the requested sections and this player count, as production's partialTemplateSchema cuts its own. */
export function cutToSections(schema: z.AnyZodObject, sections: string[], playerCount: PlayerCount): z.AnyZodObject {
  const keep = new Set<string>();
  for (const section of sections) {
    if (section in templateIterationSections) templateIterationSections[section].forEach((field) => keep.add(field));
  }
  if (sections.includes("players")) {
    for (let i = 1; i <= playerCount; i++) keep.add(`player${i}`);
  }
  return z.object(Object.fromEntries(Object.entries(schema.shape).filter(([key]) => keep.has(key))) as z.ZodRawShape);
}

// ---------------------------------------------------------------- requests

function onFor(players: PlayerCount, mode: GameMode, kind: Kind, sections: string[], parts: Round1Parts, maxTurns: number, options: SetupCallOptions): On {
  if (parts.scoreboard && !parts.slate) throw new Error("Setup round 1: the scoreboard's lines are printed in the outcome slate, so it needs the slate");
  if (parts.round3 && !(parts.slate && parts.scoreboard && parts.example && parts.fixes)) {
    throw new Error("Setup round 3: its changes edit the carried-forward form's text, so it needs every round-1 part with its fixes");
  }
  return { players, mode, kind, sections, parts, maxTurns, kids: options.kids ?? false };
}

/**
 * A new custom story or template from a premise: production's setupStep.request
 * with round 1's changes, those in `parts` and proposals 3, 4 and 6. `options`
 * reaches round 3's changes only (the kids budget).
 */
export function setupRequestFromRound1(
  premise: string,
  playerCount: PlayerCount,
  gameMode: GameMode,
  maxTurns: number,
  kind: "story" | "template",
  parts: Round1Parts,
  options: SetupCallOptions = {}
): TextRequest {
  const on = onFor(playerCount, gameMode, kind, ALL_SECTIONS, parts, maxTurns, options);
  return {
    prompt: round1Prompt(StorySetupPromptService.createSetupPrompt(premise, playerCount, gameMode, maxTurns, kind), on),
    schema: round1SetupSchema(playerCount, gameMode, kind, ALL_SECTIONS, parts, options),
  };
}

/** AI Iteration (production's TemplateService.iterateTemplate request) with round 1's changes, those in `parts` and proposals 3, 4 and 6. */
export function iterationRequestFromRound1(
  feedback: string,
  playerCount: PlayerCount,
  gameMode: GameMode,
  maxTurns: number,
  sections: string[],
  template: object,
  parts: Round1Parts,
  options: SetupCallOptions = {}
): TextRequest {
  const on = onFor(playerCount, gameMode, "iteration", sections, parts, maxTurns, options);
  return {
    prompt: round1Prompt(StorySetupPromptService.createIterationPrompt(feedback, playerCount, gameMode, maxTurns, sections, template), on),
    schema: cutToSections(round1SetupSchema(playerCount, gameMode, "iteration", sections, parts, options), sections, playerCount),
  };
}

/** Round 1's request for a new custom story or template from a premise (production's setupStep.request with A1 to A6). */
export function setupRound1Request(
  premise: string,
  playerCount: PlayerCount,
  gameMode: GameMode,
  maxTurns: number,
  kind: "story" | "template"
): TextRequest {
  return setupRequestFromRound1(premise, playerCount, gameMode, maxTurns, kind, ROUND1_PARTS);
}

/** Round 1's AI Iteration request (production's TemplateService.iterateTemplate request with A1 to A6). */
export function iterationRound1Request(
  feedback: string,
  playerCount: PlayerCount,
  gameMode: GameMode,
  maxTurns: number,
  sections: string[],
  template: object
): TextRequest {
  return iterationRequestFromRound1(feedback, playerCount, gameMode, maxTurns, sections, template, ROUND1_PARTS);
}
