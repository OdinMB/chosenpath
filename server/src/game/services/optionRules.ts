import { z } from "zod";
import type { Story } from "core/models/Story.js";
import { POINTS_FOR_REWARD, POINTS_FOR_SACRIFICE } from "core/config.js";
import { getThreadType, type Beat } from "core/types/index.js";

/*
 * The option rules (turn doc B6), adopted on 2026-09-28 for single-player
 * challenge and contest chapter steps, the turns whose options are rolled:
 * three different ways to act that a player can tell apart, a base-point
 * scale that separates them, at most two stat bonuses from the approach
 * itself, the reward exception, and a lever line the game computes from the
 * player's history (a sacrifice or reward fits when none was offered in the
 * last two rolled turns, the other kind preferred). As the setup-to-play
 * chain ran them (variant turnB6, today's turn form with B6 alone); group
 * turns stay on today's form (B6 was never built or measured for groups).
 * BeatPromptService prints the lines, storyTextSteps.beatStep puts the field
 * texts in the schema; adoptedTurns.test.ts holds both equal to the measured
 * form.
 */

export const THREE_WAYS = `- The three options are three different ways to act, and a player can tell them apart from their words alone (players see nothing else before they choose):
--- one is the sensible approach to the moment;
--- one plays to the character's strength, asset or contact: tempting, but not the obvious move;
--- one costs or risks something the others don't (a sacrifice, a chased reward, a relationship put on the line), or serves a different stake of the character's.
--- Weak: "Use your speech skill to…" / "Use your charm to…" / "Use your knowledge of law to…" (one approach three times)
--- Good: "Quote the Guild's own charter back to Sir Bram, clause by clause." / "Bring Gruk's enclave into the hall to stand silently behind you." / "Offer Sir Bram a public apology from the movement (-10% Public Support) in exchange for a hearing."
- A story element's Instructions can supply the tempting or the costly option.`;

export const REWARD_EXCEPTION =
  "A reward option is the one exception: it turns aside from the goal for a moment to gain something, like grabbing a healing plant while chasing a foe.";

export const NO_DOUBLE_SACRIFICE = "Don't offer to sacrifice a stat that was already sacrificed in this thread (see the CHOSEN OPTION lines).";

const BASE_POINTS = `How sensible this approach is before stats: 0 for the approach a sensible person would take; +5 for one that uses something the story has established (a clue found, an ally's promise); -5 to -15 for one that tempts because it plays to the character's strengths or assets (so it earns stat bonuses) but is not the obvious approach. Sacrifice options +${POINTS_FOR_SACRIFICE}, reward options ${POINTS_FOR_REWARD}.`;

const BONUSES =
  "At most two, from the stats this option's approach relies on, at their current values. A stat that fits the whole step rather than this option's approach gives no bonus.";

/** Today's options field, which B6 extends with the reward exception. */
const OPTIONS_FIELD =
  "Exactly 3 choices for the player. Don't allow the player to leave the scene, suddenly do something else, or derail the core theme of the switch/thread. Only mention the action/decision of the player, not the consequences. Remember that both sacrifices and rewards are certain and not just risks or potential rewards. There can only ever be a total of zero or one sacrifice/reward option among the 3 options. Don't repeat similar options to what this player was offered before in the same thread.";
const OPTIONS_FIELD_WITH_REWARD = OPTIONS_FIELD.replace(
  "derail the core theme of the switch/thread.",
  "derail the core theme of the switch/thread; a reward option is the one exception."
);

/** The plan field's "(Many beats are better…)", which the lever line replaces. */
const MANY_BEATS = " (Many beats are better without any sacrifice or reward options.)";

/** Whether this turn's options take B6: a single player's challenge or contest chapter step (the rolled options). */
export function takesOptionRules(story: Story): boolean {
  if (story.isMultiplayer() || story.getCurrentBeatType() !== "thread") return false;
  const thread = story.getCurrentThreadAnalysis()?.threads.find((t) => t.playersSideA.includes("player1") || t.playersSideB.includes("player1"));
  return thread !== undefined && getThreadType(thread) !== "exploration";
}

/*
 * The exploration-order line (the choice-result stage of 2026-09-30, measured
 * as the eval's choiceResult): on an exploration step the game records the
 * chosen option by its position as the step's result (BeatResolutionService:
 * option n is resolution n), and the playthroughs' turns wrote options that
 * carry out another result, or none, so the next turn told the recorded
 * result instead of the choice. Adopted for group turns first (a group's
 * options followed their results 0 of 6 -> 6 of 6 with nothing else moved),
 * then for a single player (the choice-line-sp stage, the same day): with
 * production's one retry of a short reply in the loop, a single player's
 * options at their own result 12 of 20 -> 19 of 20 on the replies the game
 * keeps, nothing moved the wrong way and the waits within their allowances;
 * the choice-result run's 3 of 20 one-paragraph replies with the line were
 * 0 of 20 there (production's own 3 of 20, each rescued by the retry).
 * BeatPromptService prints it after the option types; adoptedTurns.test.ts
 * holds it to the measured form.
 */
export const EXPLORATION_ORDER =
  "--- In an Exploration thread, a player's three options are the current step's three possible outcomes, in their order: option 1 is Resolution 1, option 2 is Resolution 2 and option 3 is Resolution 3, each the same action in the same direction, without its consequences, in the scene's own words. The game records the chosen option's resolution as what the player did, so an option that says something else sends the story where the player didn't choose. The beat text leads up to the three and carries out none of them.\n";

/** Whether this turn takes the exploration-order line: a chapter step where some player's thread is an exploration thread, every player count. */
export function takesExplorationOrder(story: Story): boolean {
  if (story.getCurrentBeatType() !== "thread") return false;
  return (story.getCurrentThreadAnalysis()?.threads ?? []).some((thread) => getThreadType(thread) === "exploration");
}

const isChallengeTurn = (beat: Beat) => (beat.options ?? []).length > 0 && beat.options.every((o) => o.optionType === "challenge");
const leverOf = (beat: Beat) => (beat.options ?? []).find((o) => o.resourceType !== "normal")?.resourceType;

/**
 * B6's rate, from the options stored in this player's history (offered and
 * not chosen alike): a lever fits when none was offered in the player's last
 * two challenge or contest turns, and the line names the last one offered and
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

function asObject(schema: unknown, label: string): z.AnyZodObject {
  if (!(schema instanceof z.ZodObject)) throw new Error(`Option rules: ${label} is not an object schema`);
  return schema;
}

function asArray(schema: unknown, label: string): z.ZodArray<z.ZodTypeAny> {
  if (!(schema instanceof z.ZodArray)) throw new Error(`Option rules: ${label} is not an array schema`);
  return schema;
}

/** Today's option kinds with B6's fields: the base-point scale and at most two bonuses. */
function optionsWithRules(options: z.ZodArray<z.ZodTypeAny>): z.ZodTypeAny {
  const union = options.element;
  if (!(union instanceof z.ZodDiscriminatedUnion)) throw new Error("Option rules: options are not a discriminated union");
  const [exploration, challenge] = (union.options as z.AnyZodObject[]).map((o, i) => asObject(o, `option kind ${i + 1}`));
  const modifiers = asArray(challenge.shape.modifiersToSuccessRate, "modifiersToSuccessRate");
  const edited = z.discriminatedUnion("optionType", [
    exploration,
    challenge.extend({
      optionType: challenge.shape.optionType,
      basePoints: challenge.shape.basePoints.describe(BASE_POINTS),
      modifiersToSuccessRate: z.array(modifiers.element).max(2).describe(BONUSES),
    }),
  ]);
  return z.array(edited).describe(OPTIONS_FIELD_WITH_REWARD);
}

/** The plan's option considerations without "(Many beats are better…)": the lever line says when one fits. */
function planWithRules(plan: z.AnyZodObject): z.AnyZodObject {
  const considerations = plan.shape.optionConsiderations;
  if (!(considerations instanceof z.ZodUnion)) throw new Error("Option rules: optionConsiderations is not a union");
  const [asText, detailed] = considerations.options as [z.ZodTypeAny, z.AnyZodObject];
  const object = asObject(detailed, "optionConsiderations object");
  const lever = object.shape.upToOneSacrificeOrRewardOption;
  const union = z.union([asText, object.extend({ upToOneSacrificeOrRewardOption: lever.describe((lever.description ?? "").replace(MANY_BEATS, "")) })]);
  return plan.extend({ optionConsiderations: considerations.description === undefined ? union : union.describe(considerations.description) });
}

/** A single player's beat schema with B6's field texts on player1's plan and options. */
export function beatSchemaWithOptionRules(root: z.AnyZodObject): z.AnyZodObject {
  const player = asObject(root.shape.player1, "player1");
  if (asArray(player.shape.options, "options").description !== OPTIONS_FIELD) throw new Error("Option rules: the options field's description changed");
  const player1 = player.extend({ plan: planWithRules(asObject(player.shape.plan, "plan")), options: optionsWithRules(asArray(player.shape.options, "options")) });
  return root.extend({ player1 });
}
