import { z } from "zod";
import type { GameMode, PlayerCount } from "core/types/index.js";
import type { SetupPromptOptions } from "../prompts/StorySetupPromptService.js";
import { setupStep, type SetupRequest } from "../storyTextSteps.js";
import { replaceOnce } from "./roundEdits.js";

/*
 * A sacrifice runs the right way on a stat where more is worse (eval only; fix
 * 3 of the second playthroughs' review, 2026-09-30). A sacrifice option adds
 * the game's fixed +30 and pays a certain cost; a reward subtracts 30 and
 * brings a certain gain. Found in the second round: the mouse story's setup
 * made "Cat's Nearness" a stat where more is worse (at 70% the next switch
 * must offer hiding), then wrote its sacrifice as "Give up 10% Cat's Nearness
 * by making a noisy distraction that draws Marmalade away" and its reward as
 * "Gain 10% Cat's Nearness by pausing to hide". The player took the sacrifice
 * at turn 2: +30 points, and the "cost" moved the cat away (50% -> 40%), a
 * second benefit. New Avalon's Heartwell Feedback (more is more volatile) was
 * written the same way. Production's stored setups do it on most stats that
 * count a pressure: Family Pressure, Storm, Dust and Danger, Eclipse Strain,
 * Pursuit Pressure, Corporate Scrutiny, Application Paperwork Load; a few get
 * it right (Department Strain, Civic Tension, Imperial Patrol Heat: "Add 10%
 * Patrol Heat by making a conspicuous move").
 *
 * The cause, in production's request: the lever fields say "What the player
 * gives up from this stat" and "What the player gains of this stat", and every
 * example ('Spend 10% fuel', 'Regain 10% health', the worked example's Public
 * Support and Fervor) is a stat where more is better, while the stat rules ask
 * for the premise's "pressures" among the stats. Nothing says which way a
 * lever runs on a stat where more is worse, so "give up" lowers it: a benefit.
 *
 * The variant is production's setup request with:
 * - one line in the stat rules, after the rule on which stats can be spent or
 *   earned: a sacrifice always costs the player and a reward always helps; on
 *   a stat where more is worse, the sacrifice raises it and the reward lowers
 *   it, with an example of each;
 * - the two lever fields' first sentences worded by what the lever does to
 *   the player (the sacrifice leaves the player worse off, the reward better
 *   off), each with its example for both kinds of stat; the rest of each field
 *   as production has it.
 * Everywhere else production's request byte for byte, its reply assembled as
 * production assembles it.
 *
 * Run 2026-09-30 (stage lever-direction): every lever the right way by hand
 * 11 of 12 -> 12 of 12 setups, the judge 9 -> 11 of 12 (within the noise:
 * production erred too rarely for a setup-level check to move), nothing moved
 * the wrong way, waits and cost level. Adopted on the coordinator's call
 * (2026-10-01): production's LEVER_DIRECTION_LINE (setupPromptText.ts) and the
 * lever fields' SACRIFICE_FIRST_SENTENCE and REWARD_FIRST_SENTENCE
 * (setupSchema.ts) are this variant's text, so production is this variant byte
 * for byte; the variant takes production's copies out before it inserts its
 * own (measuredBase), so it builds as measured.
 */

const LABEL = "Lever-direction setup";

/** The stat rule the line follows (every new setup prints it). */
const ANCHOR =
  "- Most player stats can be spent or earned in a scene: resources, reserves, contacts, items, moods. Only special powers, standings earned over the whole story (a rank, a faction's stance on a four-step scale) and trust that must be earned in a thread are 'None'.";

const LINE =
  "- A sacrifice always costs the player and a reward always helps, whichever way the stat runs. On a stat where more is worse for the player (a danger, suspicion, a pursuer's nearness, pressure or strain), the sacrifice raises it and the reward lowers it: 'Let the guards' Suspicion rise 10% to slip past them in plain sight'; 'Lower Suspicion 10% by lying low instead of pressing on'.";

/** The lever fields' first sentences in production's schema (setupSchema.ts), and the variant's. */
const SACRIFICE = {
  from: "What the player gives up from this stat, in its own units, to get the game's fixed sacrifice bonus in one scene: 'Spend 10% fuel', 'Burn one contact to call in a favor'.",
  to: "What the player pays in this stat, in its own units, to get the game's fixed sacrifice bonus in one scene. It always leaves the player worse off: spending some of a stat where more is better ('Spend 10% fuel', 'Burn one contact to call in a favor'), taking on more of one where more is worse ('Let Suspicion rise 10% by slipping past the guards in plain sight').",
};
const REWARD = {
  from: "What the player gains of this stat, in its own units, for accepting the game's fixed reward malus in one scene: 'Regain 10% health by resting instead of pressing on'.",
  to: "What the player gets in this stat, in its own units, for accepting the game's fixed reward malus in one scene. It always leaves the player better off: more of a stat where more is better ('Regain 10% health by resting instead of pressing on'), less of one where more is worse ('Lower Suspicion 10% by lying low instead of pressing on').",
};

/** The passages the tests pin. */
export const LEVER_DIRECTION_TEXT = { anchor: ANCHOR, line: LINE, sacrifice: SACRIFICE, reward: REWARD };

type Direction = "forward" | "back";

function reworded(schema: z.ZodTypeAny, edit: { from: string; to: string }, direction: Direction): z.ZodTypeAny {
  const [from, to] = direction === "forward" ? [edit.from, edit.to] : [edit.to, edit.from];
  return schema.describe(replaceOnce(LABEL, schema.description ?? "", from, to));
}

/**
 * The generation-order schema with the lever fields reworded (or, `back`, the
 * reworded fields as the stage measured production's). The shared and the
 * player list hold one stat instance (setupSchema.ts), which the JSON schema
 * writes once and points the other list at; the edited instance is shared the
 * same way, so only the two descriptions change.
 */
function withLeverWording(schema: z.AnyZodObject, direction: Direction = "forward"): z.AnyZodObject {
  const shared = schema.shape.sharedStats;
  const player = schema.shape.playerStats;
  if (!(shared instanceof z.ZodArray) || !(player instanceof z.ZodArray)) throw new Error(`${LABEL}: the setup schema has no stat lists`);
  const stat = shared.element;
  if (!(stat instanceof z.ZodObject) || player.element !== stat) throw new Error(`${LABEL}: the stat lists do not share one stat schema`);
  const edited = stat.extend({
    optionsToSacrifice: reworded(stat.shape.optionsToSacrifice, SACRIFICE, direction),
    optionsToGainAsReward: reworded(stat.shape.optionsToGainAsReward, REWARD, direction),
  });
  const list = (original: z.ZodArray<z.ZodTypeAny>) => {
    const cap = original._def.maxLength?.value;
    const copy = z.array(edited);
    return (cap === undefined ? copy : copy.max(cap)).describe(original.description ?? "");
  };
  return schema.extend({ sharedStats: list(shared), playerStats: list(player) });
}

/**
 * Production's setup as the stage measured it: since the adoption (2026-10-01)
 * production prints the line and the reworded fields, so they are taken out
 * first and the variant builds as it was measured.
 */
function measuredBase(
  premise: string,
  playerCount: PlayerCount,
  gameMode: GameMode,
  maxTurns: number,
  kind: "story" | "template",
  options: SetupPromptOptions
): SetupRequest {
  const production = setupStep.request(premise, playerCount, gameMode, maxTurns, kind, options);
  return { ...production, prompt: production.prompt.split(`${ANCHOR}\n${LINE}`).join(ANCHOR), schema: withLeverWording(production.schema, "back") };
}

/** Production's setup request as measured with the lever line and the lever fields reworded; production's byte for byte elsewhere. */
export function leverDirectionRequest(
  premise: string,
  playerCount: PlayerCount,
  gameMode: GameMode,
  maxTurns: number,
  kind: "story" | "template",
  options: SetupPromptOptions = {}
): SetupRequest {
  const base = measuredBase(premise, playerCount, gameMode, maxTurns, kind, options);
  return {
    ...base,
    prompt: replaceOnce(LABEL, base.prompt, ANCHOR, `${ANCHOR}\n${LINE}`),
    schema: withLeverWording(base.schema),
  };
}
