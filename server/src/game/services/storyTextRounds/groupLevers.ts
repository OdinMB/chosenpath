import { z } from "zod";
import type { Story } from "core/models/Story.js";
import { getThreadType } from "core/types/index.js";
import { createSetOfBeatGenerationSchema } from "core/types/beat.js";
import { NO_DOUBLE_SACRIFICE, REWARD_EXCEPTION, groupSacrificeRewardLines, sacrificeRewardLine } from "../optionRules.js";
import { beatSchemaForKids, takesKidsRules } from "../kidsTurnRules.js";
import { canAddMilestones, type TextRequest } from "../storyTextSteps.js";
import { replaceOnce, splitAtState } from "./roundEdits.js";
import { shortRepliesBase } from "./shortReplies.js";

/*
 * Group sacrifices, rewards and players' own stats (eval only; the
 * coordinator's brief of 2026-10-01, after the second playthroughs' review:
 * "Groups still get almost no sacrifices or rewards: 1 sacrifice in 129 group
 * option sets", no reward, and the players' own stats rarely moved).
 *
 * The cause, in production's request. The option rules (B6, optionRules.ts)
 * are a single player's only (takesOptionRules returns false for a group;
 * "B6 was never built or measured for groups"), so a group's challenge or
 * contest chapter step gets none of B6's lever parts:
 * - no lever line: a single player's rolled step is told "Sacrifice or reward:
 *   one fits this turn if a stat allows it" (sacrificeRewardLine, from the
 *   player's own history), a group's nothing that invites one;
 * - the plan's lever question still ends "(Many beats are better without any
 *   sacrifice or reward options.)", which B6 drops;
 * - no reward exception: the options must not "suddenly do something else, or
 *   derail the core theme", and a reward turns aside from the goal by design.
 * In the second round's three group stories (food trucks, estate agents,
 * space pirates) 105 player option sets sat on a challenge or contest step;
 * B6's line would have invited a lever in 103 of them, and 1 carried one (the
 * pirates' turn 11, Ship Integrity). Every group player's plan answered the
 * lever question "None" (174 of 175 option sets), with the field's own
 * reasons: "No sacrifice or reward is needed", "would distract from the
 * evidence-focused contest", "A records explanation is more interesting
 * without spending credibility or contacts", "a repair reward would
 * prematurely grant a result". The single-player stories of the same round,
 * with the line, offered a lever every time it invited one (6 of 6).
 * Players' own stats move by their levers (a sacrifice spends one, a reward
 * gains one), by a minor change where the stat may change any time, and by
 * their "Adjustments after threads" at a switch; with the levers gone the
 * groups' own stats moved only at switches and endings (food trucks 6
 * changes, estate agents 4, space pirates none in 25 turns), and the one group
 * lever was on a shared stat.
 *
 * The variant is production's group turn with B6's lever parts for each player
 * in a challenge or contest thread on a chapter step (groupLeverSlots):
 * - the reward exception after the option rule it excepts (REWARD_EXCEPTION,
 *   B6's sentence);
 * - after the "0 or 1 sacrifice/reward option" rule, each such player's
 *   computed line (sacrificeRewardLine on that player's own history: a lever
 *   fits when none was offered in the player's last two challenge turns, the
 *   other kind preferred), one sentence for a group (a sacrifice or reward on
 *   a shared stat spends or gains for everyone, so it goes to one player a
 *   turn, which production's sharedLeverRepeated repair enforces by dropping a
 *   later copy and leaving that player two options; a player's own stats come
 *   first), and NO_DOUBLE_SACRIFICE (B6's);
 * - in those players' fields, the options field's reward exception and the
 *   plan's lever question without "(Many beats …)" (B6's field edits).
 * Not B6's other parts (the three ways to act, the base-point scale, at most
 * two bonuses): they are about variety and odds, not levers, and would move
 * other readings in the same run. Everywhere else production's request byte
 * for byte, a player exploring beside the others included.
 *
 * Adopted after the run of 2026-10-01 in its fix-and-retest's form (B, below):
 * production's copy is optionRules.ts (GROUP_SHARED_AND_OWN,
 * GROUP_LEVER_QUESTION, groupSacrificeRewardLines, beatSchemaWithGroupLevers),
 * and the kept tests hold production to groupLeversB byte for byte, prompt and
 * JSON schema. The variant builds on production with those lines and fields
 * taken out (groupLeversBase), so it still builds as measured.
 */

const LABEL = "Group-levers turn";

/** The option rule the reward exception follows, on a chapter step (B6's place for it). */
const DERAIL_ANCHOR = "--- Don't give the player an opportunity to leave the scene, suddenly do something else, or derail the core theme of the thread in any other way.";

/** The lever rule the players' lines follow (B6's place for its line). */
const LEVER_ANCHOR = "--- You can only generate either 0 or 1 sacrifice/reward option (total) per beat. The rest of the options must be normal.\n";

const SHARED_AND_OWN =
  "A sacrifice or reward on one of a player's own stats is that player's alone; one on a shared stat spends or gains for the whole group, so offer it to one player at most this turn. Prefer the player's own stats where they allow one.";

/** The options field's sentence and B6's reward exception in it (optionRules.ts, OPTIONS_FIELD_WITH_REWARD). */
const OPTIONS_FIELD_RULE = { from: "derail the core theme of the switch/thread.", to: "derail the core theme of the switch/thread; a reward option is the one exception." };

/** The plan field's sentence B6 drops (optionRules.ts, MANY_BEATS). */
const MANY_BEATS = " (Many beats are better without any sacrifice or reward options.)";

/*
 * The fix-and-retest (B, after the run of 2026-10-01): the variant offered a
 * lever in 11 of the 48 sets its line said one fits (23%; a single player's
 * B6 turns of the second playthroughs 6 of 6), production none of 50. Of the
 * 37 invited sets without one, 33 plans declined in the lever question's own
 * frame (2 cited the no-repeat rule, and 2 planned a sacrifice the options then
 * wrote as a normal option at +30): the question asks whether a lever "would
 * be sensible and interesting for this beat … Otherwise, simply say 'None'",
 * and the replies answered "No sacrifice or reward is needed for this
 * card-review contest beat", "would distract from the resident's
 * boundaries"; the plan comes before the options, so the line in the option
 * instructions reads as leave. B asks the question from the player's line
 * instead, the rest of the variant byte for byte. Measured twice on the same
 * twelve cases: levers 25 of 50 (the run's variant 11), on the player's own
 * stat 21, rewards 8, none where the line said none.
 */
const LEVER_QUESTION_B =
  "Based on the stats' options to sacrifice and options to gain as reward attributes, and this player's sacrifice-or-reward line in the option instructions: where the line says one fits this turn, describe exactly one sacrifice or reward option (total) for this beat, on one of this player's own stats where one allows it, and the reason this scene gives for it. Say 'None' only where the line says none this turn, or where no stat allows one.";

/** The players in a challenge or contest thread on a group's chapter step, in seat order; none elsewhere. */
export function groupLeverSlots(story: Story): string[] {
  if (!story.isMultiplayer() || story.getCurrentBeatType() !== "thread") return [];
  const threads = story.getCurrentThreadAnalysis()?.threads ?? [];
  return story.getPlayerSlots().filter((slot) => {
    const thread = threads.find((t) => t.playersSideA.includes(slot) || t.playersSideB.includes(slot));
    return thread !== undefined && getThreadType(thread) !== "exploration";
  });
}

/** Whether a turn takes the variant's lines: a group's chapter step with a player in a challenge or contest thread. */
export function takesGroupLevers(story: Story): boolean {
  return groupLeverSlots(story).length > 0;
}

/** The lines after the lever rule: each rolled player's computed line, the group sentence, no second sacrifice. */
function leverBlock(story: Story): string {
  const lines = groupLeverSlots(story).map((slot) => {
    const name = story.getPlayer(slot)?.name;
    const line = sacrificeRewardLine(story, slot).replace("Sacrifice or reward: ", "");
    return `----- ${slot}${name ? ` (${name})` : ""}: ${line}\n`;
  });
  return `--- Sacrifice or reward, for each player in a Challenge or Contest thread (each player's own options):\n${lines.join("")}--- ${SHARED_AND_OWN}\n--- ${NO_DOUBLE_SACRIFICE}\n`;
}

/** The passages the tests pin. */
export const GROUP_LEVERS_TEXT = {
  derailAnchor: DERAIL_ANCHOR,
  leverAnchor: LEVER_ANCHOR,
  sharedAndOwn: SHARED_AND_OWN,
  block: leverBlock,
  leverQuestionB: LEVER_QUESTION_B,
};

/** The variant's forms: the run's (A), and its fix-and-retest (B: the plan's lever question asked from the player's line). */
export type GroupLeversForm = { b?: boolean };

/** One player's beat schema with B6's field edits: the options field's reward exception, the plan's lever question without "(Many beats …)" (B: from the player's line). */
function playerWithLevers(player: z.AnyZodObject, form: GroupLeversForm): z.AnyZodObject {
  const options = player.shape.options;
  if (!(options instanceof z.ZodArray) || !options.description) throw new Error(`${LABEL}: the options field has no description`);
  const plan = player.shape.plan;
  if (!(plan instanceof z.ZodObject)) throw new Error(`${LABEL}: the plan is not an object schema`);
  const considerations = plan.shape.optionConsiderations;
  if (!(considerations instanceof z.ZodUnion)) throw new Error(`${LABEL}: optionConsiderations is not a union`);
  const [asText, detailed] = considerations.options as [z.ZodTypeAny, z.ZodTypeAny];
  if (!(detailed instanceof z.ZodObject)) throw new Error(`${LABEL}: optionConsiderations has no object form`);
  const lever = detailed.shape.upToOneSacrificeOrRewardOption;
  if (!(lever instanceof z.ZodString) || !lever.description) throw new Error(`${LABEL}: the lever question has no description`);
  const question = replaceOnce(LABEL, lever.description, MANY_BEATS, "");
  const union = z.union([asText, detailed.extend({ upToOneSacrificeOrRewardOption: lever.describe(form.b ? LEVER_QUESTION_B : question) })]);
  return player.extend({
    plan: plan.extend({ optionConsiderations: considerations.description === undefined ? union : union.describe(considerations.description) }),
    options: options.describe(replaceOnce(LABEL, options.description, OPTIONS_FIELD_RULE.from, OPTIONS_FIELD_RULE.to)),
  });
}

/** The reply schema with each rolled player's fields edited, the others' as production's; slots sharing one instance keep sharing one, as production's do. */
function schemaWithLevers(root: z.AnyZodObject, slots: string[], form: GroupLeversForm): z.AnyZodObject {
  const editedOf = new Map<unknown, z.AnyZodObject>();
  const edited = Object.fromEntries(
    slots.map((slot) => {
      const player = root.shape[slot];
      if (!(player instanceof z.ZodObject)) throw new Error(`${LABEL}: ${slot} is not an object schema`);
      const known = editedOf.get(player) ?? playerWithLevers(player, form);
      editedOf.set(player, known);
      return [slot, known];
    })
  );
  return root.extend(edited);
}

/**
 * Production's group turn as the stage measured it beside the variant. Since
 * the adoption (2026-10-01, groupLeversB) production prints the variant's lines
 * and lever fields on a rolled group step, so the prompt's are taken out (the
 * texts are the variant's, which a test holds; the players' lines as production
 * prints them, which since the review of that day give a player whose roll the
 * step discards none, groupLeverLine), and the schema is built as production
 * built it before: core's set schema, with the band's kids text where the
 * story is read with a child. Since the short-replies adoption of the same day,
 * later, production's turn without that stage's lines (shortRepliesBase) on
 * every turn, as the stage measured it.
 */
export function groupLeversBase(story: Story): TextRequest<z.AnyZodObject> {
  const production = shortRepliesBase(story);
  if (groupLeverSlots(story).length === 0) return production;
  const prompt = production.prompt
    .split(`${DERAIL_ANCHOR} ${REWARD_EXCEPTION}`)
    .join(DERAIL_ANCHOR)
    .split(`${LEVER_ANCHOR}${groupSacrificeRewardLines(story)}`)
    .join(LEVER_ANCHOR);
  const raw = createSetOfBeatGenerationSchema(story.getNumberOfPlayers(), canAddMilestones(story), story.isMultiplayer(), story.generatesImages(), story.hasImages());
  return { prompt, schema: takesKidsRules(story) ? beatSchemaForKids(raw, story) : raw };
}

/** Production's group turn (as measured) with B6's lever parts for each player in a challenge or contest thread; production's request byte for byte elsewhere. */
export function groupLeversRequest(story: Story, form: GroupLeversForm = {}): TextRequest<z.AnyZodObject> {
  const production = groupLeversBase(story);
  const slots = groupLeverSlots(story);
  if (slots.length === 0) return production;
  const { instructions, state } = splitAtState(LABEL, production.prompt);
  let edited = replaceOnce(LABEL, instructions, DERAIL_ANCHOR, `${DERAIL_ANCHOR} ${REWARD_EXCEPTION}`);
  edited = replaceOnce(LABEL, edited, LEVER_ANCHOR, `${LEVER_ANCHOR}${leverBlock(story)}`);
  return { prompt: edited + state, schema: schemaWithLevers(production.schema, slots, form) };
}
