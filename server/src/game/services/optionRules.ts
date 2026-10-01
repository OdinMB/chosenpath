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
 * chain ran them (variant turnB6, today's turn form with B6 alone). Group
 * turns stayed on today's form (B6 was never built or measured for groups)
 * until the group-levers stage of 2026-10-01, which gave each player in a
 * group's challenge or contest thread B6's lever parts (below,
 * groupSacrificeRewardLines). BeatPromptService prints the lines,
 * storyTextSteps.beatStep puts the field texts in the schema;
 * adoptedTurns.test.ts holds both equal to the measured forms.
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

/*
 * A group's sacrifices and rewards (the group-levers stage of 2026-10-01,
 * measured as the eval's groupLeversB, the stage's fix-and-retest). B6 was a
 * single player's only, so a group's challenge or contest step had no lever
 * line, kept the plan question's "(Many beats are better without any
 * sacrifice or reward options.)" and had no reward exception: the second
 * playthroughs' three group stories offered 1 lever in 105 rolled option sets
 * (B6's line would have invited one in 103), every group plan answering
 * "None", and the players' own stats moved only at switches. Now each player
 * in a challenge or contest thread on a group's chapter step gets B6's lever
 * parts: the reward exception, that player's computed line (sacrificeRewardLine
 * on their own history), one sentence for a group (a shared stat's lever goes
 * to one player a turn, which the sharedLeverRepeated repair enforces; the
 * player's own stats first), NO_DOUBLE_SACRIFICE, and in that player's fields
 * the options field's reward exception and the plan's lever question asked
 * from the line (GROUP_LEVER_QUESTION). Measured on twelve group chapter steps
 * of the second playthroughs, twice: sets with a lever 0 of 50 -> 25 of 50,
 * on the player's own stat 0 -> 21, rewards 0 -> 8, none where the line said
 * none, sets that only risk tells apart 88% -> 74%, waits level. B6's other
 * parts (the three ways, the base-point scale, at most two bonuses) stay a
 * single player's: they were not measured for groups.
 */
export const GROUP_SHARED_AND_OWN =
  "A sacrifice or reward on one of a player's own stats is that player's alone; one on a shared stat spends or gains for the whole group, so offer it to one player at most this turn. Prefer the player's own stats where they allow one.";

/** The plan's lever question for a player in a group's challenge or contest thread: asked from the player's computed line. */
export const GROUP_LEVER_QUESTION =
  "Based on the stats' options to sacrifice and options to gain as reward attributes, and this player's sacrifice-or-reward line in the option instructions: where the line says one fits this turn, describe exactly one sacrifice or reward option (total) for this beat, on one of this player's own stats where one allows it, and the reason this scene gives for it. Say 'None' only where the line says none this turn, or where no stat allows one.";

/** The players in a challenge or contest thread on a group's chapter step, in seat order; none on any other turn, and none for a single player (B6 is theirs). */
export function groupLeverSlots(story: Story): string[] {
  if (!story.isMultiplayer() || story.getCurrentBeatType() !== "thread") return [];
  const threads = story.getCurrentThreadAnalysis()?.threads ?? [];
  return story.getPlayerSlots().filter((slot) => {
    const thread = threads.find((t) => t.playersSideA.includes(slot) || t.playersSideB.includes(slot));
    return thread !== undefined && getThreadType(thread) !== "exploration";
  });
}

/** Whether a turn takes the group's lever parts: a group's chapter step with a player in a challenge or contest thread. */
export function takesGroupLeverRules(story: Story): boolean {
  return groupLeverSlots(story).length > 0;
}

/** The lines after the "0 or 1 sacrifice/reward option" rule on a group's rolled step: each rolled player's computed line, the group sentence, no second sacrifice. */
export function groupSacrificeRewardLines(story: Story): string {
  const lines = groupLeverSlots(story).map((slot) => {
    const name = story.getPlayer(slot)?.name;
    const line = sacrificeRewardLine(story, slot).replace("Sacrifice or reward: ", "");
    return `----- ${slot}${name ? ` (${name})` : ""}: ${line}\n`;
  });
  return `--- Sacrifice or reward, for each player in a Challenge or Contest thread (each player's own options):\n${lines.join("")}--- ${GROUP_SHARED_AND_OWN}\n--- ${NO_DOUBLE_SACRIFICE}\n`;
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

/** A group player's plan with the lever question asked from the player's line (GROUP_LEVER_QUESTION). */
function planWithGroupQuestion(plan: z.AnyZodObject): z.AnyZodObject {
  const considerations = plan.shape.optionConsiderations;
  if (!(considerations instanceof z.ZodUnion)) throw new Error("Option rules: optionConsiderations is not a union");
  const [asText, detailed] = considerations.options as [z.ZodTypeAny, z.AnyZodObject];
  const object = asObject(detailed, "optionConsiderations object");
  const lever = object.shape.upToOneSacrificeOrRewardOption;
  const union = z.union([asText, object.extend({ upToOneSacrificeOrRewardOption: lever.describe(GROUP_LEVER_QUESTION) })]);
  return plan.extend({ optionConsiderations: considerations.description === undefined ? union : union.describe(considerations.description) });
}

/**
 * A group's beat schema with the lever fields for each player in a challenge or contest thread: the options field's
 * reward exception and the plan's lever question asked from the player's line; slots sharing one instance keep sharing
 * one, as the schema builds them; the other players' fields unchanged.
 */
export function beatSchemaWithGroupLevers(root: z.AnyZodObject, story: Story): z.AnyZodObject {
  const editedOf = new Map<unknown, z.AnyZodObject>();
  const players = Object.fromEntries(
    groupLeverSlots(story).map((slot) => {
      const player = asObject(root.shape[slot], slot);
      const known = editedOf.get(player);
      if (known) return [slot, known];
      const options = asArray(player.shape.options, "options");
      if (options.description !== OPTIONS_FIELD) throw new Error("Option rules: the options field's description changed");
      const edited = player.extend({ plan: planWithGroupQuestion(asObject(player.shape.plan, "plan")), options: options.describe(OPTIONS_FIELD_WITH_REWARD) });
      editedOf.set(player, edited);
      return [slot, edited];
    })
  );
  return root.extend(players);
}
