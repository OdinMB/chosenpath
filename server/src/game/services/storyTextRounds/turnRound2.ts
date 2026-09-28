import { z } from "zod";
import type { Story } from "core/models/Story.js";
import { POINTS_FOR_REWARD, POINTS_FOR_SACRIFICE } from "core/config.js";
import { getThreadType, type Beat, type Thread } from "core/types/index.js";
import { beatStep, type TextRequest } from "../storyTextSteps.js";
import { replaceOnce, replaceUntil, splitAtState } from "./roundEdits.js";
import { NO_BLANK_ITEMS } from "./setupRound1.js";

/*
 * Turn round 2's turns (turn doc section 4, round 2; Appendix A B3, B5 to B8,
 * B1's milestone field and B9 item 2), an eval-only variant of production's
 * beat request for every single-player turn, in production's one-message
 * shape, on today's turn form (round 1 carried no turn form forward):
 * - the rest of B3: stat changes shown by their effect (row 5), the fourth
 *   wall with game words and readouts (row 6), certain sacrifices (row 7), a
 *   chapter's first step sees the switch's last paragraph (row 9), two to four
 *   interludes (row 10), no sacrifice or reward in switches and exploration
 *   (row 12), no "Remember" before anyone decided (row 13), the single-player
 *   leftovers gone (row 16), the no-leave rule in chapter turns only (row 18),
 *   the bonus field's range and value (row 1), the first turn's
 *   previous-beat lines gone and no stat changes (row 3), the event of the
 *   chapter that ended in a paragraph of its own (row 4);
 * - B5: a prose-style block before the text rules, the last paragraph's job,
 *   and hooks planted sparingly; the held-out tics stay out of the prompt;
 * - B6: three ways to act, the base-point scale and at most two bonuses in
 *   their fields, the reward exception, and a computed lever line;
 * - B7: the first turn opens in a scene, topic and flavor options, what pulls
 *   the story on after a chapter, exploration options in resolution order;
 * - B8 with B1's milestone: the ending writes its per-outcome answers, text
 *   and summary only, every past choice shown; switch turns after a chapter
 *   and the ending write one milestone sentence, filed by code;
 * - "paragraphs" is B9 item 2 on top: the paragraph count at the text field,
 *   once more in the context, and the shouted copies gone.
 * Rows 11, 14 and 15 belong to round 1's framed chapter turn, which waits on
 * the owner's rating. Single player only: groups are round 3's B10. Replies
 * that change shape (the first turn, the switch after a chapter, the ending)
 * are assembled into today's stored shape before anything reads them. Edits
 * are anchored on production's wording, each exactly once (roundEdits.ts).
 * Model-facing text says "thread" and "beat" (turn doc Appendix A).
 */

export type TurnRound2Form = "round2" | "paragraphs";

export type TurnRound2Request = TextRequest & { assemble?: (parsed: unknown) => unknown };

const LABEL = "Turn round 2 turn";

type Loose = Record<string, unknown>;
const asObject = (value: unknown): Loose => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : {});
const asString = (value: unknown): string => (typeof value === "string" ? value : "");

// ---------------------------------------------------------------- the text

const STAT_CHANGES_NARRATED =
  "- Stat changes you just applied, shown by their effect in the world, never as a readout (the stat's name with its value or change). Weak: \"Public Support rises to 60%.\" Good: \"Two bakers who spat at you last week now hang your poster in their window.\"";

const GAME_WORDS =
  "no game words (NPC, player character, stat, beat, milestone, success rate, or the game's thread, switch and outcome), and no stat readouts: a stat's name together with its value or change (\"Public Support rises to 60%\"). Show the effect instead.";
const LEVER_EXCEPTION = " Sacrifice and reward options are the one exception: their text names the stat and the amount they cost or gain.";
/** B3 row 6, naming only what the turn writes: the ending has no options or interludes, and only challenge options carry a lever. */
const fourthWall = (kind: TurnKind, levers: boolean) =>
  `- Don't break the fourth wall in the text${kind === "ending" ? "" : ", options or interludes"}: ${GAME_WORDS}${levers ? LEVER_EXCEPTION : ""}`;

const ENDING_NO_DECISION = "The ending, the story's last beat, is the one beat no decision follows.";
const FIRST_TURN_NO_DECISION = "This is the first beat of the story, so there is no previous decision to narrate: write 'none'.";

// The held-out tics ("the path ahead", scenery that waits, the character's signature traits by name) stay out of this block and the examples, so the eval counts them unprompted
const PROSE_STYLE = `Prose style
- Write in the story's tone (STORY GUIDELINES), and follow the Instructions of the story elements that appear in this beat.
- Vary how the beat and its paragraphs open. Open on the world as often as on "you": a person, a sound, a thing that moved. Avoid opening with "You step", "You stand", "You sit", "You lean", "As you", "As the".
  Weak: "You step into the Guild hall, the air thick with tension."
  Good: "The Guild clerk doesn't look up when you come in."
- Leave out stock phrases and tics: "the weight of", "hangs in the balance", "take a deep breath", "as you prepare to", "just the beginning", "a mix of", "the air is thick", "a sense of", "palpable", "tapestry", "at the edge of", and the pattern "X, not Y".
- Use the character's appearance and signature traits only when they do something in the scene, not in every beat.
  Weak: "Your missing ear itches as you listen." (every beat)
  Good: "Gruk turns his torn ear toward the door before anyone else hears the patrol."
- Spell every name exactly as the story state does.
`;

const LAST_PARAGRAPH = `- The last paragraph brings the pressure that the options answer, inside the scene: someone asks or demands, something closes in, a deadline is named. End on that moment, in action or direct speech. The player reads the options right below the text, so the paragraph names none of them and doesn't sum up what is at stake.
  Weak: "Your resolve is strong, whatever comes next."
  Weak: "The Guild hall falls quiet in the evening light."
  Good: "Sir Bram slides the arrest list across the desk. 'Tell me why these three should walk free,' he says, 'and do it before the bell.'"`;

const HOOKS = `- Plant sparingly, pay off often. When the scene allows, bring back a detail the story already recorded (a fact in STORY ELEMENTS or GENERAL FACTS) and let it matter now. Plant a new mystery at most once per thread, record it as a fact, and never plant one in the last third of the story or in an ending. A hook among a new story element's facts counts as that thread's new mystery.
  Weak: a new unexplained flicker, sound or symbol in every beat.
  Good: "The second ledger, the one you glimpsed under the clerk's counter, lists tomorrow's arrests before they happen."`;

const FIRST_TURN = `Open in a scene, not a summary: the player character is doing something in a place from the story, and someone from the STORY ELEMENTS wants something from them. Show who the character is through what they do and say. Let the switch's directions (or, in a flavor switch, its stances) arise inside this scene (a visitor, a message, a job, a rumor), so each option reads as a next move. Hint at each outcome through what someone says or wants, never by naming it.
Weak: "You recall the Guild, the enclave and the print shop. The choice is yours."
Good: "The last poster is still wet on the bakery wall when Gruk steps out of the alley: 'Sir Bram wants the one who wrote this. Tonight.'"`;

const FLAVOR_OPENING = "This first switch is a flavor switch: stage its question as the scene's opening.";

const TOPIC_SWITCH = "- Topic switch: the three options are the switch configuration's three directions, in the same order, in the scene's words. No ids.";
const FLAVOR_SWITCH =
  "- Flavor switch: the three options are three stances toward the switch's question: one meets it head-on, one works around it, one refuses it on the character's own terms (for a trial: show up to the trial, organize a protest to stop it, escape before it starts). Every option stays on the switch's outcome.";

const MILESTONE_PARAGRAPH = `- Give a full paragraph to the event that the thread's result established (its milestone), told as something that happened, with names: who did what, and what it changes for the player. Never call it a milestone or a result.
  Weak: "The milestone is clear: Sir Bram keeps the policy."
  Good: "Sir Bram tears the petition in half in front of the Guild; by evening the anti-goblin code is nailed to every gate."`;
const AFTER_CHAPTER = "- Then show what is still open, and the new situation that pulls the story on. The options arise from it.";

const NEW_MILESTONE =
  "NEW MILESTONE: the thread that just ended adds one milestone to its outcome. Write it in the milestone field: take the thread's result as the baseline and make it specific to what happened in its beats. Example: if the result is 'The council's decision heavily favors progress', the milestone could be 'Threatened by the Furious Four, the council has no choice but to approve the new railroad.'";
const MILESTONE_FIELD =
  "The milestone that the thread that just ended (PREVIOUS THREAD CONFIGURATION) adds to its outcome: one sentence naming who did what and what it changed, built from the thread's result and what happened in its beats, not the planned milestone word for word.";

const THREE_WAYS = `- The three options are three different ways to act, and a player can tell them apart from their words alone (players see nothing else before they choose):
--- one is the sensible approach to the moment;
--- one plays to the character's strength, asset or contact: tempting, but not the obvious move;
--- one costs or risks something the others don't (a sacrifice, a chased reward, a relationship put on the line), or serves a different stake of the character's.
--- Weak: "Use your speech skill to…" / "Use your charm to…" / "Use your knowledge of law to…" (one approach three times)
--- Good: "Quote the Guild's own charter back to Sir Bram, clause by clause." / "Bring Gruk's enclave into the hall to stand silently behind you." / "Offer Sir Bram a public apology from the movement (-10% Public Support) in exchange for a hearing."
- A story element's Instructions can supply the tempting or the costly option.`;
const REWARD_EXCEPTION = "A reward option is the one exception: it turns aside from the goal for a moment to gain something, like grabbing a healing plant while chasing a foe.";
const NO_DOUBLE_SACRIFICE = "Don't offer to sacrifice a stat that was already sacrificed in this thread (see the CHOSEN OPTION lines).";
const EXPLORATION_ORDER =
  "- In exploration threads, write the three options in the order of the current step's resolutions: option 1 leads to Resolution 1, option 2 to Resolution 2, option 3 to Resolution 3.";

const BASE_POINTS = `How sensible this approach is before stats: 0 for the approach a sensible person would take; +5 for one that uses something the story has established (a clue found, an ally's promise); -5 to -15 for one that tempts because it plays to the character's strengths or assets (so it earns stat bonuses) but is not the obvious approach. Sacrifice options +${POINTS_FOR_SACRIFICE}, reward options ${POINTS_FOR_REWARD}.`;
const BONUSES = "At most two, from the stats this option's approach relies on, at their current values. A stat that fits the whole step rather than this option's approach gives no bonus.";
const BONUS_EFFECT =
  "Points that this stat's value adds to or takes from this option, between -15 and +15, using the value after this beat's stat changes. When the stat's definition names a larger effect, use 15 (or -15).";
const CERTAIN_LEVER = "A sacrifice or reward names what it costs or gains, as certain: \"Burn your last favor with Gruk (-10% Enclave Trust) to…\". Never \"risking\" or \"potentially\".";
const EXPLORATION_NORMAL = "Always 'normal': exploration options have no roll, so a sacrifice or reward would buy nothing.";
const NO_LEVER_PLAN = "Always 'None' here: this beat's options have no roll, so a sacrifice or reward would buy nothing.";

const INTERLUDES_FIELD =
  "Two to four snippets shown while the next beat is written: one thought of this beat's character in the first person (imageId = player slot); one or two facts about story elements in this beat (imageId = story element id); at most one detail about the world (imageId = \"cover\"). Hints fit facts the story state holds. Create them even if images are disabled for this story (leave imageId empty and set imageSource to 'none').";

const ENDING_RULES = `- For each outcome, first decide which of its possible resolutions its milestones support, counting the milestone this beat adds; an outcome without milestones ends in its mixed resolution (for three paths, the one closest to the character's recent choices).
- The ending answers every outcome in scenes: show each answer through what happens to the people involved, not by stating it.
- Close; don't open. The last paragraph looks forward in time (a season, a year) at the life the answers leave behind. No new mysteries, and no "this is only the beginning".
  Weak: "'This isn't the end,' you tell yourself as you look at the long road ahead."
  Good: "By spring the new code is nailed to every Guild door. Gruk still won't shake Sir Bram's hand, but his children walk to market by daylight."`;

const RESOLUTIONS = ["favorable", "mixed", "unfavorable", "sideAWins", "sideBWins", "resolution1", "resolution2", "resolution3"] as const;

const outcomeEndingsSchema = z
  .array(
    z.object({
      outcomeId: z.string().describe("An outcome of this player, or a shared outcome, exactly as its ID reads in OUTCOMES."),
      resolution: z
        .enum(RESOLUTIONS)
        .describe(
          "Which of the outcome's possible resolutions the story reached, decided as the ending rules say: favorable, mixed or unfavorable; sideAWins, mixed or sideBWins for a contested outcome; for an outcome whose resolutions are three paths, resolution1, resolution2 or resolution3 in the order its possible resolutions are listed."
        ),
      basis: z.string().describe("One sentence: the milestones, events or score that point there."),
    })
  )
  .max(6)
  .describe(`Every outcome of this player, shared ones included, once each. Write these first; the text then makes each answer unmistakable. ${NO_BLANK_ITEMS}`);

const PARAGRAPH_COUNT = "Five or six paragraphs, separated by a blank line; every paragraph has three to five sentences. An image tag starts its paragraph.";
const SHOUTED_COUNT =
  "These are a lot of instructions, so let me repeat the most important one: You MUST write 5-6 paragraphs with 3-5 sentences each! Otherwise, there simply isn't enough text to move the story forward with enough depth and detail. So again: 5-6 paragraphs, 3-5 sentences each!";

// ---------------------------------------------------------------- production's passages

const MECHANICS =
  "\nHow beats work mechanically:\n- Players have separate beat histories. No player can see the beats of other players.\n- Each beat must flow naturally from the previous beat OF THAT PLAYER.\n- If several players encounter something new, you must introduce the new information to all players separately.\n- No player can see the decisions of other players. If a player made a decision in the previous beat that affects other players, you must introduce the information to the other players separately.\n- Beats for one turn are presented to players at the same time.\n";
const OLD_STAT_CHANGES = "- statChanges you just applied (in so far as this beat's player should be aware of them).";
const OLD_FOURTH_WALL = "- Don't break the fourth wall\n--- Don't use terms like 'NPC', 'player character', 'stat', 'story beat', etc. in the beat text.";
const TEXT_START = "Text\n- The first paragraph must";
const OLD_LAST_PARAGRAPH =
  "- The last paragraph\n--- Never mention or even refer to the player's options and choices.\n--- Players will see the options below the beat text. Talking about them in the beat text is redundant.\n--- Avoid these kinds of formulations: 'The path before you ...', 'Will you do X, or will you do Y?', 'You must decide: ...', 'You weigh your options carefully', 'the complexity of your decision ...'";
const OLD_HINT = "- Plan a hint about a detail in the world that makes the player curious without spelling out what's going on. (Similar to the interlude, see below.)";
const OLD_INTERLUDE_COUNT = "Create a total of exactly 3 interludes.";
const OLD_INTERLUDE_CURIOSITY = "Use interludes to make players curious about the world. Imply interesting details instead of spelling them out.";
const NEW_INTERLUDE_CURIOSITY = "Use interludes to make players curious about the world: hint at details the story state holds instead of spelling them out.";
const OLD_INTRO_HEAD =
  "This is the first beat of the story. DON'T ADD ANY NEW STORY ELEMENTS OR NEW FACTS. Let's just give the player a proper introduction to the existing story state.\n- Required: Introduce the player itself.\n- Required: Introduce the other players and their relationship to the player.\n- Required: Introduce or at least hint at the outcomes that will define the ending for this player (both the personal and the shared ones).\n";
const OLD_INTRO_BALANCE = "\n\nFind a good balance between introducing the overall setup of the story, introducing some story elements, and still making this beat a good switch.";
const OLD_FIRST_ITEM =
  "\nThe first item must always be the players performing the action that they chose in the previous beat and how these actions play out. Concrete descriptions of the characters carrying out the actions; always direct speech if they decided to speak.";
const OLD_RESULTS =
  "\nResults of the player's actions depend on the resolution of the previous beat. The thread configuration lays out what it means specifically to succeed and fail. Follow those guidelines.";
const OLD_FIRST_PARAGRAPH =
  "- The first paragraph must\n--- continue exactly where the previous beat for this player ended\n--- describe how the player performs the action that was chosen in the previous beat (stay in the scene; show don't tell!)\n--- describe the consequences of that action\nExample: If the player decided to organize a vote, describe what they do, how the vote plays out, and what the outcome is. Stay in the scene. \n";
const OLD_IMPLEMENT_SWITCH =
  "- For topic switches: Present options that let the player choose which outcome/question to focus on next\n- If this is a flavor switch: Present options for different approaches to the predetermined outcome/question\n- Ensure options align with the coordination pattern between players";
const OLD_REMEMBER_TOPICS = "\n- Remember that topic switches already have their options defined in the switch configuration.";
const OLD_NO_LEAVE = (beatType: string) => `--- Don't give the player an opportunity to leave the scene, suddenly do something else, or derail the core theme of the ${beatType} in any other way.`;
const SACRIFICE_LIMIT = "--- You can only generate either 0 or 1 sacrifice/reward option (total) per beat. The rest of the options must be normal.\n";
const SACRIFICE_BLOCK =
  "- Define if the option is a sacrifice (losing a stat in exchange for a higher chance of success) or a reward (gaining a stat as a reward for choosing a lower chance of success) or normal (neither of the above).\n" +
  "--- You can only define sacrifice and reward options for stats that allow to be sacrificed or gained as a reward in their stat definitions.\n" +
  SACRIFICE_LIMIT +
  "--- Formulate the option with flavor in mind. Bad: 'Sacrifice 10% emotional stability for a higher chance of catching his attention.'. Good: 'Bite your lips (-10% stability) and intercept Adrian directly.'\n";
const BE_SPECIFIC =
  "- Be specific.\n--- Bad: 'Propose a compromise'. Good: Specify what the compromise is.\n--- Bad: 'Create a diversion'. Good: 'Divert the guards by throwing some gold coins around.'";
const OLD_BASE_POINTS = `--- basePoints: for normal resource types: assign a value between +5 to -15. Sensible options should get +/- 0. Options that are listed and attractive because they play to the player's strengths or assets but aren't inherently sensible for the challenge at hand should get -5 to -15 here. ${POINTS_FOR_SACRIFICE} for sacrifice options. ${POINTS_FOR_REWARD} for reward options.\n`;
const OLD_LICENCE = "That said: if it makes sense for a stat to have an influence when the specific situation is not covered in the stat's definition, you can award a modifier. ";
const CHALLENGE_OPTIONS_HEAD = "- For challenge options, define how the option affects the likelihood of different resolutions\n";
const RISK_LINE = "--- riskType: decide if this option is risky (extreme outcomes are more likely), safe (extreme outcomes become less likely), or normal.\n";
const CONSEQUENCES_EXCEPTION = " (Except for mentioning the stat that is sacrificed or gained as a reward in sacrifice and reward options.)";
const CONTEXT_DECISION = "are a narrative structure of 5-6 paragraphs of 3-5 sentences each followed by a decision that the player must make.";
const OPTION_TYPES = "--- Use 'challenge' for options in Challenge threads and Contest threads.\n";
const OLD_MILESTONE_TEXT =
  "- This beat narrates the resolution of the previous thread that the player was involved in. Spend at least a full paragraph on narrating the milestone that was added to the player's outcome.\n--- Describe the milestone, how it relates to the outcome that it's linked to, and why it's relevant to the player.\n";
const OLD_RESOLVED_PLAN = "\n- Since a thread was just resolved, describe the resolution of the thread in detail. Focus on the milestones that were added to outcomes and how that affects the player.";
const OLD_NEW_MILESTONES =
  "NEW MILESTONES: To resolve the previous set of threads, for each outcome associated with these resolved threads, add a milestone based on the thread's resolution with a newMilestone change.\n- Take the threads' resolution text as a baseline. Adjust it based on the thread's narrative text to make the new milestone more specific. Example: if the thread's general resolution is 'The council's decision heavily favors progress', based on the thread's narrative, the new milestone could be 'Threatened by the Furious Four, the council has no choice but to approve the new railroad.'";
const OLD_ENDING_IMPLEMENT =
  "- Touch on each individual and shared outcome that affects the player.\n--- Use the information why the outcome resonates with the player / why the outcome is important to them.\n--- For shared outcomes, touch on how the outcome affects the other players.\n";
const OLD_ENDING_TIE = "- Tie the ending to the individual and shared outcomes that affect the player.\n";
const SHOW_DONT_TELL_SECTION = "How to make sure that the text follows the principle of 'Show Don't Tell'?";
const OLD_USE_PLAN_LIST = "--- Use the list of 'show don't tell' instructions that you generated in the plan for the beat.\n";
const INTERLUDES_SECTION = "\nInterludes\nare little snippets";
const REMEMBER_STATE =
  "\n\nRemember: In these switches, players decided what is supposed to happen next. These things have not yet happened. The current thread and beat must make sure that the story actually continues based on the players' choices.\n";

// Field passages
const TEXT_FIRST =
  "- Start exactly where the previous beat for this player ended.\n- Describe in detail the action that the player decided to do in the previous beat.";
const NEW_TEXT_FIRST =
  "- From the second turn on: start exactly where the previous beat for this player ended, and describe in detail the action that the player decided to do in the previous beat.";
const TEXT_MILESTONE = "- If a milestone was added to a player's outcome: spend at least a full paragraph on that milestone (what it means, why it matters, and how the event resonates with the player).\n";
const TEXT_OPTIONS =
  "- Never introduce, talk about, or even hint at the player's options in the beat text.\n--- Avoid all of these and similar formulations: 'The path before you ...', 'Will you do X, or will you do Y?', 'You must decide: ...', 'You weigh your options', 'The complexity of your decision ...'\n";
const TEXT_UNRESOLVED =
  "- Remember that the resolution of the beat will only be determined AFTER this beat, based on players' choices. Only lead up to the player options. Don't define or narrate the resolution of the beat. (That will happen in the next round, based on players' choices.)\n";
const TEXT_PLAN_LIST = "- Follow the 'show don't tell' elements that you generated for the 'plan' attribute. Always";
const TEXT_COUNT = "- Write 5-6 paragraphs.\n- Each paragraph must have 3-5 sentences.\n";
const WORLD_BUILDING_HINT = " Plan a detail that makes the player curious about a detail in the world without spelling out what's going on.";
const MANY_BEATS = " (Many beats are better without any sacrifice or reward options.)";
const OLD_OPTIONS_FIELD =
  "Exactly 3 choices for the player. Don't allow the player to leave the scene, suddenly do something else, or derail the core theme of the switch/thread. Only mention the action/decision of the player, not the consequences. Remember that both sacrifices and rewards are certain and not just risks or potential rewards. There can only ever be a total of zero or one sacrifice/reward option among the 3 options. Don't repeat similar options to what this player was offered before in the same thread.";

// ---------------------------------------------------------------- the turn's kind

type TurnKind = "first" | "switch" | "chapter" | "ending";
type ChapterKind = "challenge" | "contest" | "exploration";

function turnKind(story: Story): TurnKind {
  const beatType = story.getCurrentBeatType();
  if (beatType === "ending") return "ending";
  if (beatType === "thread") return "chapter";
  if (beatType === "switch") return story.isFirstBeat() ? "first" : "switch";
  throw new Error(`${LABEL}: no round-2 form for a ${beatType} beat`);
}

function playerThread(story: Story): Thread | undefined {
  return story.getCurrentThreadAnalysis()?.threads.find((t) => t.playersSideA.includes("player1") || t.playersSideB.includes("player1"));
}

function chapterKind(story: Story): ChapterKind {
  const thread = playerThread(story);
  if (!thread) throw new Error(`${LABEL}: player1 is in no thread`);
  return getThreadType(thread);
}

/** Whether this turn's options carry a lever: a challenge or contest chapter step. */
const hasLevers = (kind: TurnKind, chapter?: ChapterKind) => kind === "chapter" && chapter !== "exploration";

// ---------------------------------------------------------------- B6: the lever line, computed

const isChallengeTurn = (beat: Beat) => (beat.options ?? []).length > 0 && beat.options.every((o) => o.optionType === "challenge");
const leverOf = (beat: Beat) => (beat.options ?? []).find((o) => o.resourceType !== "normal")?.resourceType;

/**
 * B6's rate, from the options stored in this player's history (offered and not
 * chosen alike): a lever fits when none was offered in the player's last two
 * challenge or contest turns, and the line names the last one offered and
 * prefers the other kind. A turn can't count this itself, since it sees a
 * lever's tag only on chosen options.
 */
export function sacrificeRewardLine(story: Story, slot: string): string {
  const history = story.getPlayer(slot)?.beatHistory ?? [];
  const challengeTurns = history.map((beat, index) => ({ beat, index })).filter(({ beat }) => isChallengeTurn(beat));
  if (challengeTurns.slice(-2).some(({ beat }) => leverOf(beat) !== undefined)) return "Sacrifice or reward: none this turn.";
  const last = [...challengeTurns].reverse().find(({ beat }) => leverOf(beat) !== undefined);
  if (!last) return "Sacrifice or reward: one fits this turn if a stat allows it.";
  const kind = leverOf(last.beat) as string;
  const other = kind === "sacrifice" ? "reward" : "sacrifice";
  const ago = history.length - last.index;
  return `Sacrifice or reward: one fits this turn if a stat allows it (the last one offered was a ${kind}, ${ago} turn${ago === 1 ? "" : "s"} ago; prefer a ${other}).`;
}

// ---------------------------------------------------------------- the instructions

function commonEdits(text: string, kind: TurnKind, levers: boolean): string {
  let edited = replaceOnce(LABEL, text, MECHANICS, "");
  if (kind !== "first") edited = replaceOnce(LABEL, edited, OLD_STAT_CHANGES, STAT_CHANGES_NARRATED);
  edited = replaceOnce(LABEL, edited, OLD_FOURTH_WALL, fourthWall(kind, levers));
  edited = replaceOnce(LABEL, edited, TEXT_START, `\n${PROSE_STYLE}\n${TEXT_START}`);
  // Options without a roll carry no lever, so the consequence rule's lever exception goes with them (B3 row 12)
  if (kind === "first" || kind === "switch" || (kind === "chapter" && !levers)) edited = replaceOnce(LABEL, edited, CONSEQUENCES_EXCEPTION, "");
  edited =
    kind === "ending" ? replaceOnce(LABEL, edited, `\n${OLD_LAST_PARAGRAPH}`, "") : replaceOnce(LABEL, edited, OLD_LAST_PARAGRAPH, LAST_PARAGRAPH);
  if (kind === "switch" || kind === "chapter") edited = replaceOnce(LABEL, edited, OLD_HINT, HOOKS);
  if (kind !== "ending") {
    edited = replaceOnce(LABEL, edited, OLD_INTERLUDE_COUNT, "Create two to four interludes.");
    edited = replaceOnce(LABEL, edited, OLD_INTERLUDE_CURIOSITY, NEW_INTERLUDE_CURIOSITY);
  }
  return edited;
}

function firstTurnEdits(text: string, story: Story): string {
  const flavor = story.getCurrentSwitchAnalysis()?.switches.find((s) => s.players.includes("player1"))?.type === "flavor";
  let edited = replaceUntil(LABEL, text, "1. IDENTIFY STATS AND STORY ELEMENTS", "3. GENERATE ONE STORY BEAT FOR EACH PLAYER", "Since this is the beginning of the story, there are no consequences or changes of earlier decisions to process.\n\n");
  edited = replaceOnce(LABEL, edited, "3. GENERATE ONE STORY BEAT FOR EACH PLAYER", "1. GENERATE ONE STORY BEAT FOR EACH PLAYER");
  edited = replaceOnce(
    LABEL,
    edited,
    OLD_INTRO_HEAD,
    `This is the first beat of the story. DON'T ADD ANY NEW STORY ELEMENTS OR NEW FACTS.\n${FIRST_TURN}\n${flavor ? `${FLAVOR_OPENING}\n` : ""}`
  );
  edited = replaceOnce(LABEL, edited, OLD_INTRO_BALANCE, "");
  edited = replaceOnce(LABEL, edited, OLD_FIRST_ITEM, "");
  edited = replaceOnce(LABEL, edited, OLD_RESULTS, "");
  return replaceOnce(LABEL, edited, OLD_FIRST_PARAGRAPH, "");
}

/** Switch turns, the first included: B7's option lines, no levers, no no-leave rule (B3 rows 12 and 18). */
function switchEdits(text: string): string {
  let edited = replaceOnce(LABEL, text, OLD_IMPLEMENT_SWITCH, `${TOPIC_SWITCH}\n${FLAVOR_SWITCH}`);
  edited = replaceOnce(LABEL, edited, OLD_REMEMBER_TOPICS, "");
  edited = replaceOnce(LABEL, edited, `\n${OLD_NO_LEAVE("switch")}`, "");
  return withoutLeverLines(edited);
}

/** The sacrifice lines of the option instructions, which only challenge and contest options use (B3 row 12). */
function withoutLeverLines(text: string): string {
  return replaceOnce(LABEL, text, SACRIFICE_BLOCK, "");
}

/** The switch after a chapter (B3 row 4, B7) and the ending: one milestone sentence (B1). */
function milestoneEdits(text: string): string {
  return replaceOnce(LABEL, text, OLD_NEW_MILESTONES, NEW_MILESTONE);
}

function afterChapterEdits(text: string): string {
  let edited = replaceOnce(LABEL, text, OLD_RESOLVED_PLAN, "");
  edited = replaceOnce(LABEL, edited, OLD_MILESTONE_TEXT, `${MILESTONE_PARAGRAPH}\n${AFTER_CHAPTER}\n`);
  return milestoneEdits(edited);
}

function chapterEdits(text: string, story: Story, kind: ChapterKind): string {
  let edited = text;
  if (kind === "exploration") {
    edited = replaceOnce(LABEL, edited, OPTION_TYPES, `${OPTION_TYPES}${EXPLORATION_ORDER}\n`);
    // No roll: the point rules go, whose old scale would also contradict the challenge option's field
    edited = replaceUntil(LABEL, edited, CHALLENGE_OPTIONS_HEAD, RISK_LINE, "");
    edited = replaceOnce(LABEL, edited, RISK_LINE, "");
    return withoutLeverLines(edited);
  }
  // B6 in challenge and contest chapters
  edited = replaceOnce(LABEL, edited, BE_SPECIFIC, `${BE_SPECIFIC}\n${THREE_WAYS}`);
  edited = replaceOnce(LABEL, edited, OLD_NO_LEAVE("thread"), `${OLD_NO_LEAVE("thread")} ${REWARD_EXCEPTION}`);
  edited = replaceOnce(LABEL, edited, SACRIFICE_LIMIT, `${SACRIFICE_LIMIT}--- ${sacrificeRewardLine(story, "player1")}\n--- ${NO_DOUBLE_SACRIFICE}\n`);
  edited = replaceOnce(LABEL, edited, OLD_BASE_POINTS, "");
  return replaceOnce(LABEL, edited, OLD_LICENCE, "");
}

function endingEdits(text: string): string {
  let edited = replaceOnce(LABEL, text, CONTEXT_DECISION, `${CONTEXT_DECISION} ${ENDING_NO_DECISION}`);
  edited = replaceUntil(LABEL, edited, "1. IDENTIFY STATS AND STORY ELEMENTS", "2. IDENTIFY CHANGES", "");
  edited = replaceOnce(LABEL, edited, "2. IDENTIFY CHANGES", "1. IDENTIFY CHANGES");
  edited = replaceOnce(LABEL, edited, "3. GENERATE ONE STORY BEAT FOR EACH PLAYER", "2. GENERATE ONE STORY BEAT FOR EACH PLAYER");
  edited = milestoneEdits(edited);
  edited = replaceOnce(LABEL, edited, OLD_ENDING_IMPLEMENT, `${ENDING_RULES}\n`);
  edited = replaceOnce(LABEL, edited, OLD_ENDING_TIE, "");
  edited = replaceUntil(LABEL, edited, SHOW_DONT_TELL_SECTION, "BEAT ATTRIBUTES", "");
  edited = replaceOnce(LABEL, edited, "Title: The End\n\n", "");
  edited = replaceOnce(LABEL, edited, "Stay in the scene.- Most of the beat text", "Stay in the scene.\n- Most of the beat text");
  edited = replaceOnce(LABEL, edited, OLD_USE_PLAN_LIST, "");
  // The ending shows no interludes: the section goes, to the end of the instructions
  if (edited.split(INTERLUDES_SECTION).length !== 2) throw new Error(`${LABEL}: the Interludes section is not in the ending's instructions exactly once`);
  return `${edited.slice(0, edited.indexOf(INTERLUDES_SECTION)).trimEnd()}\n\n\n`;
}

function instructionEdits(text: string, story: Story, kind: TurnKind, form: TurnRound2Form): string {
  let edited = commonEdits(text, kind, hasLevers(kind, kind === "chapter" ? chapterKind(story) : undefined));
  if (kind === "first") edited = switchEdits(firstTurnEdits(edited, story));
  if (kind === "switch") edited = switchEdits(afterChapterEdits(edited));
  if (kind === "chapter") edited = chapterEdits(edited, story, chapterKind(story));
  if (kind === "ending") edited = endingEdits(edited);
  return form === "paragraphs" ? replaceOnce(LABEL, edited, `\n\n${SHOUTED_COUNT}`, "") : edited;
}

// ---------------------------------------------------------------- the state

const paragraphsOf = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\[image\s+[^\]]*\]/g, "").trim())
    .filter(Boolean);

/** Every past choice for the ending (B8), in production's line form, not only the last one's. */
function fullHistory(story: Story): string {
  const history = story.getPlayer("player1")?.beatHistory ?? [];
  if (history.length === 0) return "No beats yet.";
  return history
    .map((beat, index) => {
      const chosen = beat.choice >= 0 ? beat.options?.[beat.choice] : undefined;
      const lever = chosen && chosen.resourceType !== "normal" ? ` [${chosen.resourceType}]` : "";
      const result = beat.resolution ? ` (Result: ${beat.resolution.charAt(0).toUpperCase()}${beat.resolution.slice(1).toLowerCase()})` : "";
      return `- Beat ${index + 1}: ${beat.summary}${chosen ? `\n  Chosen option: ${chosen.text}${lever}${result}` : ""}`;
    })
    .join("\n");
}

function stateEdits(state: string, story: Story, kind: TurnKind): string {
  let edited = state;
  if (kind === "first" || kind === "switch") {
    // B3 rows 13 and 16: nobody has decided yet, and a single player's switch relates to no other
    edited = replaceOnce(LABEL, edited, REMEMBER_STATE, "\n");
    for (const sw of story.getCurrentSwitchAnalysis()?.switches ?? []) {
      edited = replaceOnce(LABEL, edited, `\n- Relationship to other switches: ${sw.relationshipToOtherSwitches}`, "");
    }
  }
  if (kind === "chapter" && story.getCurrentThreadBeatsCompleted() === 0) {
    // B3 row 9: the chapter's first beat continues the switch turn's last paragraph
    const last = paragraphsOf(story.getCurrentBeat("player1")?.text ?? "").pop();
    const name = story.getPlayer("player1")?.name ?? "player1";
    const step = `\n\nCURRENT STEP IN THREAD PROGRESSION: Turn 1/${story.getCurrentThreadDuration()}\n`;
    if (last) edited = replaceOnce(LABEL, edited, step, `\n\nPREVIOUS BEAT (the switch), last paragraph for ${name}:\n${last}${step}`);
  }
  if (kind === "ending") edited = replaceUntil(LABEL, edited, "BEAT HISTORY:\n", "\n\n======= STORY PROGRESS", `BEAT HISTORY:\n${fullHistory(story)}`);
  return edited;
}

// ---------------------------------------------------------------- the reply

function reworded<T extends z.ZodTypeAny>(schema: T, find: string, replace: string): T {
  const description = schema.description ?? "";
  if (description.split(find).length !== 2) throw new Error(`${LABEL}: "${find.slice(0, 60)}" is not in the field's description exactly once`);
  return schema.describe(description.replace(find, replace));
}

function asZodObject(schema: unknown, label: string): z.AnyZodObject {
  if (!(schema instanceof z.ZodObject)) throw new Error(`${LABEL}: ${label} is not an object schema`);
  return schema;
}

function asZodArray(schema: unknown, label: string): z.ZodArray<z.ZodTypeAny> {
  if (!(schema instanceof z.ZodArray)) throw new Error(`${LABEL}: ${label} is not an array schema`);
  return schema;
}

function optionsField(kind: TurnKind, chapter: ChapterKind | undefined): string {
  if (kind !== "chapter") return "Exactly 3 choices for the player. Only mention the action/decision of the player, not the consequences.";
  const noLeave = hasLevers(kind, chapter)
    ? "Don't allow the player to leave the scene, suddenly do something else, or derail the core theme of the thread; a reward option is the one exception."
    : "Don't allow the player to leave the scene, suddenly do something else, or derail the core theme of the thread.";
  const levers = hasLevers(kind, chapter) ? " There can only ever be a total of zero or one sacrifice/reward option among the 3 options." : "";
  return `Exactly 3 choices for the player. ${noLeave} Only mention the action/decision of the player, not the consequences.${levers} Don't repeat similar options to what this player was offered before in the same thread.`;
}

/** Production's option kinds with B3 rows 1, 7 and 12 and B6 in their fields. */
function editedOptions(options: z.ZodArray<z.ZodTypeAny>, kind: TurnKind, chapter: ChapterKind | undefined): z.ZodTypeAny {
  if (options.description !== OLD_OPTIONS_FIELD) throw new Error(`${LABEL}: the options field's description changed`);
  const union = options.element;
  if (!(union instanceof z.ZodDiscriminatedUnion)) throw new Error(`${LABEL}: options are not a discriminated union`);
  const [exploration, challenge] = (union.options as z.AnyZodObject[]).map((o, i) => asZodObject(o, `option kind ${i + 1}`));
  const modifiers = asZodArray(challenge.shape.modifiersToSuccessRate, "modifiersToSuccessRate");
  const modifier = asZodObject(modifiers.element, "modifier");
  const edited = z.discriminatedUnion("optionType", [
    exploration.extend({ optionType: exploration.shape.optionType, resourceType: exploration.shape.resourceType.describe(EXPLORATION_NORMAL) }),
    challenge.extend({
      optionType: challenge.shape.optionType,
      text: challenge.shape.text.describe(`${challenge.shape.text.description} ${CERTAIN_LEVER}`),
      basePoints: challenge.shape.basePoints.describe(BASE_POINTS),
      modifiersToSuccessRate: z.array(modifier.extend({ effect: modifier.shape.effect.describe(BONUS_EFFECT) })).max(2).describe(BONUSES),
    }),
  ]);
  return z.array(edited).describe(optionsField(kind, chapter));
}

function editedPlan(plan: z.AnyZodObject, kind: TurnKind, chapter: ChapterKind | undefined): z.AnyZodObject {
  const considerations = plan.shape.optionConsiderations;
  if (!(considerations instanceof z.ZodUnion)) throw new Error(`${LABEL}: optionConsiderations is not a union`);
  const [asText, detailed] = considerations.options as [z.ZodTypeAny, z.AnyZodObject];
  const lever = asZodObject(detailed, "optionConsiderations object").shape.upToOneSacrificeOrRewardOption;
  const detailedEdited = asZodObject(detailed, "optionConsiderations object").extend({
    upToOneSacrificeOrRewardOption: hasLevers(kind, chapter) ? reworded(lever, MANY_BEATS, "") : lever.describe(NO_LEVER_PLAN),
  });
  const union = z.union([asText, detailedEdited]);
  return plan.extend({
    worldBuilding: reworded(plan.shape.worldBuilding, WORLD_BUILDING_HINT, ""),
    // B3 row 3's spirit: the first turn follows no decision
    ...(kind === "first" ? { showDontTellPreviousDecision: plan.shape.showDontTellPreviousDecision.describe(FIRST_TURN_NO_DECISION) } : {}),
    optionConsiderations: considerations.description === undefined ? union : union.describe(considerations.description),
  });
}

function textField(text: z.ZodTypeAny, kind: TurnKind, form: TurnRound2Form): z.ZodTypeAny {
  let edited = reworded(text, TEXT_FIRST, NEW_TEXT_FIRST);
  edited = reworded(edited, TEXT_MILESTONE, "");
  edited = reworded(edited, TEXT_OPTIONS, "");
  if (kind === "ending") {
    edited = reworded(edited, TEXT_UNRESOLVED, "");
    edited = reworded(edited, TEXT_PLAN_LIST, "- Always");
  }
  if (form === "paragraphs") {
    edited = reworded(edited, TEXT_COUNT, `- ${PARAGRAPH_COUNT}\n`);
    edited = reworded(edited, `\n\n${SHOUTED_COUNT}`, "");
  }
  return edited;
}

function editedPlayer(player: z.AnyZodObject, kind: TurnKind, chapter: ChapterKind | undefined, form: TurnRound2Form): z.AnyZodObject {
  const text = textField(player.shape.text, kind, form);
  if (kind === "ending") {
    // B8: the per-outcome answers first, then the text and summary; code fills the rest
    const imageRequest = player.shape.imageRequest as z.ZodTypeAny | undefined;
    return z.object({ outcomeEndings: outcomeEndingsSchema, ...(imageRequest ? { imageRequest } : {}), text, summary: player.shape.summary });
  }
  const interludes = asZodArray(player.shape.interludes, "interludes");
  return player.extend({
    plan: editedPlan(asZodObject(player.shape.plan, "plan"), kind, chapter),
    text,
    options: editedOptions(asZodArray(player.shape.options, "options"), kind, chapter),
    interludes: interludes.max(4).describe(INTERLUDES_FIELD),
  });
}

function editedSchema(root: z.AnyZodObject, kind: TurnKind, chapter: ChapterKind | undefined, form: TurnRound2Form): z.AnyZodObject {
  const player1 = editedPlayer(asZodObject(root.shape.player1, "player1"), kind, chapter, form);
  const milestone = z.string().describe(MILESTONE_FIELD);
  if (kind === "ending") return z.object({ statChanges: root.shape.statChanges, milestone, player1 });
  const shape: z.ZodRawShape = {};
  for (const key of Object.keys(root.shape)) {
    if (kind === "first" && (key === "statChanges" || key === "statsAffectingDecisionConsequences")) continue;
    if (kind === "switch" && key === "newMilestones") shape.milestone = milestone;
    else shape[key] = key === "player1" ? player1 : root.shape[key];
  }
  return z.object(shape);
}

/** The group whose outcome list holds this id: shared first, as the game looks it up. */
function outcomeGroup(story: Story, outcomeId: string): string {
  return story.getSharedOutcomes().some((o) => o.id === outcomeId) ? "shared" : "player1";
}

/** B1: the one sentence becomes today's milestone change on the ended chapter's outcome; a blank one is left to the game's safety net. */
function milestonesFrom(story: Story, written: unknown): unknown[] {
  const text = asString(written).trim();
  const ended = story.getResolvedThreadAnalysis()?.threads.find((t) => t.playersSideA.includes("player1") || t.playersSideB.includes("player1"));
  if (!text || !ended) return [];
  return [{ type: "newMilestone", outcomeGroup: outcomeGroup(story, ended.outcomeId), outcome: ended.outcomeId, newMilestone: text }];
}

/** The reply in today's stored shape (C7), with the ending's answers riding along. */
function assembled(story: Story, kind: TurnKind, parsed: unknown): unknown {
  const reply = asObject(parsed);
  if (kind === "first") {
    const { newMilestones, multiplayerCoordination, player1, ...rest } = reply;
    return { statsAffectingDecisionConsequences: [], statChanges: [], newMilestones, multiplayerCoordination, player1, ...rest };
  }
  if (kind === "switch") {
    const { milestone, ...rest } = reply;
    return {
      statsAffectingDecisionConsequences: rest.statsAffectingDecisionConsequences,
      statChanges: rest.statChanges,
      newMilestones: milestonesFrom(story, milestone),
      multiplayerCoordination: rest.multiplayerCoordination,
      player1: rest.player1,
    };
  }
  const beat = asObject(reply.player1);
  const { outcomeEndings, imageRequest, text, summary } = beat;
  return {
    statsAffectingDecisionConsequences: [],
    statChanges: reply.statChanges,
    newMilestones: milestonesFrom(story, reply.milestone),
    multiplayerCoordination: "",
    player1: {
      plan: { establishedFacts: [], newGameElements: [], newIntroductionsOfStoryElements: [] },
      title: "The End",
      ...(imageRequest !== undefined ? { imageRequest } : {}),
      text,
      summary,
      options: [],
      interludes: [],
      outcomeEndings,
    },
  };
}

/** Round 2's request for a single-player turn of any kind, on production's reply format or, for the paragraph arm, with B9's count at the text field. */
export function turnRound2Request(story: Story, form: TurnRound2Form): TurnRound2Request {
  if (story.isMultiplayer()) throw new Error(`${LABEL}: round 2's form is single-player (multiplayer turns are round 3's B10)`);
  const kind = turnKind(story);
  const chapter = kind === "chapter" ? chapterKind(story) : undefined;
  const production = beatStep.request(story);
  const { instructions, state } = splitAtState(LABEL, production.prompt);
  const request: TurnRound2Request = {
    prompt: instructionEdits(instructions, story, kind, form) + stateEdits(state, story, kind),
    schema: editedSchema(asZodObject(production.schema, "reply"), kind, chapter, form),
  };
  return kind === "chapter" ? request : { ...request, assemble: (parsed) => assembled(story, kind, parsed) };
}

/** The passages the tests pin. */
export const TURN_ROUND2_TEXT = {
  fourthWallStart: "- Don't break the fourth wall in the text",
  gameWords: GAME_WORDS,
  endingNoDecision: ENDING_NO_DECISION,
  firstTurnNoDecision: FIRST_TURN_NO_DECISION,
  statChangesNarrated: STAT_CHANGES_NARRATED,
  proseStyleStart: "Prose style\n- Write in the story's tone",
  lastParagraphStart: "- The last paragraph brings the pressure that the options answer",
  hooksStart: "- Plant sparingly, pay off often.",
  firstTurnStart: "Open in a scene, not a summary:",
  flavorOpening: FLAVOR_OPENING,
  topicSwitch: TOPIC_SWITCH,
  flavorSwitchStart: "- Flavor switch: the three options are three stances",
  milestoneParagraphStart: "- Give a full paragraph to the event that the thread's result established",
  afterChapter: AFTER_CHAPTER,
  newMilestoneStart: "NEW MILESTONE: the thread that just ended adds one milestone to its outcome.",
  explorationNormal: EXPLORATION_NORMAL,
  threeWaysStart: "- The three options are three different ways to act",
  rewardException: REWARD_EXCEPTION,
  noDoubleSacrifice: NO_DOUBLE_SACRIFICE,
  explorationOrder: EXPLORATION_ORDER,
  basePoints: BASE_POINTS,
  bonuses: BONUSES,
  bonusEffect: BONUS_EFFECT,
  certainLever: CERTAIN_LEVER,
  endingRulesStart: "- For each outcome, first decide which of its possible resolutions its milestones support",
  endingClose: "- Close; don't open.",
  paragraphCount: PARAGRAPH_COUNT,
  shoutedCount: SHOUTED_COUNT,
};
