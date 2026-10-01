import { z } from "zod";
import type { Story } from "core/models/Story.js";
import type { ThreadAnalysis } from "core/types/index.js";
import { beatStep, switchStep, threadStep, type PlanRequest, type TextRequest } from "../storyTextSteps.js";
import { PARALLEL_THREADS_TEXT, takesParallelLine, takesTurnLine } from "./parallelThreads.js";
import { replaceOnce, splitAtState } from "./roundEdits.js";
import { SHARED_SCENES, scenesBlock as productionScenesBlock, takesScenesBlock as productionTakesScenesBlock } from "../sharedScenes.js";

/*
 * Shared scenes in group stories: each person and each thing in one place per
 * turn across all the players' texts (eval only; decision A's retest of the
 * parallel-thread lines, the coordinator's brief of the evening of
 * 2026-10-01: the cause re-read from round 3, the state rendering considered
 * beside the wording).
 *
 * The cause, read from the third playthroughs' three group stories (the
 * pages in stories/round3/ and the replayed requests; no calls). Every split
 * came from a thread one player picked that held a player of another thread,
 * or one of the people another thread needed:
 * - the estate agents' turns 6-7: Tamsin picked "Meet Rory away from Gloam
 *   House" (the shared friendship), Rory the conservatory staging; the
 *   chapter planner wrote Tamsin's thread with Rory in every step and result
 *   ("Tamsin and Rory agree …"), and the turn put Rory at the Amber Cup in
 *   her text while his own restaged the conservatory; turns 9-11 the reverse
 *   ("Return to the Amber Cup … with Tamsin", Tamsin at the café in Rory's
 *   text and with the buyer and Mara in her own);
 * - the food trucks' turns 12-15: the scarce-slot contest, only Amara's pick,
 *   planned with both trucks in its steps ("How do Amara and Omar serve the
 *   first guests"), made her challenge by the plan check's repair
 *   (contestOneSided) with its results still Omar's; her text put Omar's
 *   station and crew across the inspection lane while Omar's had him and his
 *   crew loading the truck in the yard with Jo;
 * - the space pirates' turn 6: Oren picked "Join Tomas and Davi at the chart
 *   table", the others their own outcomes; his text has him join them there
 *   while Davi's is at the auxiliary engine's service panel;
 * - the estate agents' turn 17: Rory's thread shows the buyer the nursery
 *   door, Tamsin's has "the buyer" at Noor's table in the conservatory: one
 *   person both threads' steps name.
 * In production's requests: the chapter planner follows the picks, and its
 * "Possible player configurations" say nothing about where parallel threads
 * happen or who is in them; a thread's own plan is stored and never shown to
 * the turn (so fix 4's "each thread's plan says where it happens and who is
 * there" never reached a turn); the group turn sees each thread's players and
 * steps, and its consistency lines cover only players "in the same thread or
 * switch".
 *
 * The variant, at those causes (fix 4's lines reworded at round 3's cause,
 * and a rendering of the state the turn reads):
 * - the chapter planner, where the picks set more than one outcome (fix 4's
 *   condition, takesParallelLine): after the player configurations, a line
 *   that parallel threads share one moment and one world, every player in
 *   exactly one thread even where a pick names another player or the outcome
 *   is shared with or contested by them, everyone else and every key object
 *   in one thread's scene, a shared place moved for everyone; and each
 *   thread's reply gains a scene (where it happens and who and what is there
 *   besides its players), right after its players, which the plan keeps;
 * - the group turn, on a chapter step whose chapter has more than one thread
 *   (fix 4's condition, takesTurnLine): "WHERE EVERYONE IS THIS TURN" before
 *   the thread configuration, each thread's title, its players by name and
 *   its scene where the plan holds one, and the rule that a player is only in
 *   their own thread's scene, never shown in another player's text even
 *   where a choice or a step names them, everyone else in one scene at a
 *   time; and fix 4's consistency line pointing at it.
 * Everywhere else production's request byte for byte.
 *
 * Adopted after the run of 2026-10-01 (evening) in its fix-and-retest's form,
 * sharedScenesB (one more planner bullet, below), where its chains measured
 * it: the chapter planner, and the turn on a chapter's opening step (the
 * chains' turn). The turn alone on later steps of the round's stored plans
 * moved no split and told openings again more often (openingNotReused 100% ->
 * 60% of the kept turns, moved lower), so production's later chapter steps
 * keep its turn. Production's copy is game/services/sharedScenes.ts, and the
 * kept tests hold production to sharedScenesB byte for byte, prompt and JSON
 * schema, where it prints them. The variant builds on production with the
 * insertions taken out (sharedScenesBase, withoutSharedScenes,
 * withoutSceneField), so both forms still build as measured, and the variants
 * measured before take them out too.
 */

const LABEL = "Shared-scenes variant";

/** The player configurations' last line (a group's chapter planner after its first chapter prints it). */
const PLANNER_ANCHOR = PARALLEL_THREADS_TEXT.parallelAnchor;

const PLANNER_HEAD = "\n\nParallel threads happen at the same moment, in one world, so each person and each thing is in one thread's scene at a time:\n";
const PLAYER_BULLET =
  '- Every player is in exactly one thread and only in its scenes. A pick can name another player who chose something else ("Meet Rory at the café", "Join Tomas at the chart table"), or an outcome can be shared with them or contested by their side: that player is in their own thread, so this one plays without them. No step or result has them there, acting, answering or agreeing; the thread can reach them by message, prepare something for them, or leave them for later.\n';
const EVERYONE_BULLET =
  "- Everyone else is in one thread's scene too: a character, crew or group one thread's steps need is in no other thread's steps, and a key object (a ledger, a record, a plate) is in one place. A thread that moves a shared place (the ship leaves port) moves it for everyone.\n";
const SCENE_BULLET = "- Each thread's scene says where it happens and who and what is there besides its players.";

const PLANNER_LINE = `${PLANNER_HEAD}${PLAYER_BULLET}${EVERYONE_BULLET}${SCENE_BULLET}`;

/*
 * The fix-and-retest (sharedScenesB, after the run of 2026-10-01 evening): every
 * chain the variant left split was its own planner writing one person or group
 * into two threads' scenes, against its everyone-else bullet: the space
 * pirates' Captain Ves in all three scenes (the quota talk, the engine room,
 * the custody hearing), so Davi's text had her at the engine-room rail while
 * the others had her at the chart table, twice; the food trucks' showcase,
 * Omar "not present", with "a rival showcase crew and its truck" at the
 * opposing station while Omar's own crew and truck stood in the loading area.
 * One bullet before the scene bullet says it at that cause.
 */
const ONE_SCENE_BULLET =
  "- When two threads would need the same person (a captain, a buyer, a judge) or the same crew, vehicle or object, only one thread's scene has them: the other plays without them, or reaches them by message. A contest only one side chose stands no one in for the absent side: no rival's crew, station or vehicle in its scene.\n";

const PLANNER_LINE_B = `${PLANNER_HEAD}${PLAYER_BULLET}${EVERYONE_BULLET}${ONE_SCENE_BULLET}${SCENE_BULLET}`;

const SCENE_FIELD =
  "Where this thread's beats happen and who and what is there besides its players: the place, then the characters, crews, vehicles and key objects its steps need. Never a player of another thread, and no one and nothing another thread's scene holds.";

/** The consistency section's line on shared threads (a group's turn prints it), fix 4's anchor. */
const TURN_ANCHOR = PARALLEL_THREADS_TEXT.turnAnchor;

const TURN_LINE =
  "- Where players are in different threads (WHERE EVERYONE IS THIS TURN), every person, group, vehicle and object is in one place across all the beats of this turn: a player appears in another player's beat only if they are in the same thread, and a shared place is in the same state in every beat.\n";

/** The state's thread configuration heading on a chapter step; the block goes right before it. */
const CONFIGURATION_ANCHOR = "\n======= CURRENT THREAD CONFIGURATION =======";

const BLOCK_HEAD = "\n======= WHERE EVERYONE IS THIS TURN =======\n\nThese threads happen at the same moment, each in its own scene:\n";

const BLOCK_RULE =
  "A player is only in their own thread's scene: in another player's text they can be remembered, talked about or reached by message, never shown there, even where a choice or a step names them. Everyone and everything else is in one scene at a time, where this chapter's plan and its earlier beats put them.\n";

/** The passages the tests pin. */
export const SHARED_SCENES_TEXT = {
  plannerAnchor: PLANNER_ANCHOR,
  plannerLine: PLANNER_LINE,
  sceneBullet: SCENE_BULLET,
  oneSceneBullet: ONE_SCENE_BULLET,
  plannerLineB: PLANNER_LINE_B,
  sceneField: SCENE_FIELD,
  turnAnchor: TURN_ANCHOR,
  turnLine: TURN_LINE,
  configurationAnchor: CONFIGURATION_ANCHOR,
  blockHead: BLOCK_HEAD,
  blockRule: BLOCK_RULE,
};

/** Whether the chapter planner takes the line and the scenes: a group after its first chapter whose picks set more than one outcome (fix 4's condition). */
export function takesScenesPlanner(story: Story): boolean {
  return takesParallelLine(story);
}

/** Whether the group turn takes where everyone is and the line: a group's chapter step whose chapter has more than one thread (fix 4's condition). */
export function takesScenesBlock(story: Story): boolean {
  return takesTurnLine(story);
}

/** A thread's scene as its plan holds it (the variant's plans keep one), trimmed; undefined where it holds none. */
export function sceneOf(thread: unknown): string | undefined {
  const scene = (thread as { scene?: unknown } | null)?.scene;
  return typeof scene === "string" && scene.trim() ? scene.trim() : undefined;
}

/** WHERE EVERYONE IS THIS TURN: each thread's title, its players by name and its scene where the plan holds one, then the rule. */
export function scenesBlock(story: Story): string {
  const threads = story.getCurrentThreadAnalysis()?.threads ?? [];
  const lines = threads.map((thread) => {
    const names = [...thread.playersSideA, ...thread.playersSideB].map((slot) => story.getPlayer(slot)?.name ?? slot).join(" and ");
    const scene = sceneOf(thread);
    return `- "${thread.title}": ${names}${scene ? `. Scene: ${scene}` : ""}\n`;
  });
  return `${BLOCK_HEAD}${lines.join("")}${BLOCK_RULE}`;
}

type Loose = Record<string, unknown>;
const asObject = (value: unknown): Loose => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : {});

/** A group's chapter planner reply schema with each thread's scene right after its players. */
function withScene(schema: z.AnyZodObject): z.AnyZodObject {
  const threads = schema.shape.threads;
  if (!(threads instanceof z.ZodArray) || !(threads.element instanceof z.ZodObject)) throw new Error(`${LABEL}: the reply has no thread list`);
  const shape = threads.element.shape as Record<string, z.ZodTypeAny>;
  if (!("playersSideB" in shape)) throw new Error(`${LABEL}: a thread has no players`);
  const entries = Object.entries(shape).flatMap(([key, field]): [string, z.ZodTypeAny][] => (key === "playersSideB" ? [[key, field], ["scene", z.string().describe(SCENE_FIELD)]] : [[key, field]]));
  const cap = threads._def.maxLength?.value;
  const list = z.array(z.object(Object.fromEntries(entries)));
  return schema.extend({ threads: (cap === undefined ? list : list.max(cap)).describe(threads.description ?? "") });
}

function insertedAfter(prompt: string, anchor: string, line: string): string {
  const { instructions, state } = splitAtState(LABEL, prompt);
  return replaceOnce(LABEL, instructions, anchor, `${anchor}${line}`) + state;
}

/**
 * A prompt of production's without the shared-scenes insertions it prints since the scenes stage's adoption
 * (2026-10-01, evening: the chapter planner's line, the group turn's consistency line and where-everyone-is block):
 * production as it stood before, which this variant was measured on and the variants measured earlier build on. A
 * prompt without them, as it is.
 */
export function withoutSharedScenes(prompt: string, story: Story): string {
  const passages = [SHARED_SCENES.plannerLine, SHARED_SCENES.turnLine, ...(productionTakesScenesBlock(story) ? [productionScenesBlock(story)] : [])];
  return passages.reduce((text, passage) => text.split(passage).join(""), prompt);
}

/** A chapter planner reply schema without the scene field production asks for where a group's picks split (the schema as it stood before). */
export function withoutSceneField(schema: z.AnyZodObject): z.AnyZodObject {
  const threads = schema.shape.threads;
  if (!(threads instanceof z.ZodArray) || !(threads.element instanceof z.ZodObject) || !("scene" in threads.element.shape)) return schema;
  const cap = threads._def.maxLength?.value;
  const list = z.array(threads.element.omit({ scene: true }));
  return schema.extend({ threads: (cap === undefined ? list : list.max(cap)).describe(threads.description ?? "") });
}

/** Production's chapter planner or group turn as it stood before the scenes stage's adoption (the variant's base). */
export function sharedScenesBase(story: Story, role: "thread"): PlanRequest<ThreadAnalysis>;
export function sharedScenesBase(story: Story, role: "beat"): TextRequest<z.AnyZodObject>;
export function sharedScenesBase(story: Story, role: "beat" | "thread"): TextRequest<z.AnyZodObject> & { assemble?: (reply: unknown) => unknown } {
  if (role === "thread") {
    const production = threadStep.request(story);
    // Production's assembly keeps a written scene since the adoption; before it, the plan held none
    const assemble = (reply: unknown): ThreadAnalysis => {
      const plan = production.assemble(reply);
      return { ...plan, threads: plan.threads.map((thread) => Object.fromEntries(Object.entries(thread).filter(([key]) => key !== "scene")) as typeof thread) };
    };
    return { ...production, prompt: withoutSharedScenes(production.prompt, story), schema: withoutSceneField(production.schema), assemble };
  }
  const production = beatStep.request(story);
  return { ...production, prompt: withoutSharedScenes(production.prompt, story) };
}

/**
 * A chapter planner's or group turn's prompt of production's as it stood before (or a form measured on it) with the
 * variant's insertions where they apply: the planner's line (`b`: the fix-and-retest's), the turn's consistency line
 * and where-everyone-is block. A prompt where they don't apply, as it is.
 */
export function withSharedScenesLines(prompt: string, story: Story, role: "beat" | "thread", options: { b?: boolean } = {}): string {
  if (role === "thread") return takesScenesPlanner(story) ? insertedAfter(prompt, PLANNER_ANCHOR, options.b === true ? PLANNER_LINE_B : PLANNER_LINE) : prompt;
  if (!takesScenesBlock(story)) return prompt;
  const { instructions, state } = splitAtState(LABEL, prompt);
  const withLine = replaceOnce(LABEL, instructions, TURN_ANCHOR, `${TURN_ANCHOR}${TURN_LINE}`);
  const withBlock = replaceOnce(LABEL, state, CONFIGURATION_ANCHOR, `${scenesBlock(story)}${CONFIGURATION_ANCHOR}`);
  return withLine + withBlock;
}

function threadRequest(story: Story, b: boolean): PlanRequest<ThreadAnalysis> {
  const base = sharedScenesBase(story, "thread");
  if (!takesScenesPlanner(story)) return base;
  return {
    prompt: withSharedScenesLines(base.prompt, story, "thread", { b }),
    schema: withScene(base.schema),
    // Production's assembly before the adoption, each thread's written scene kept on it (the threads in the reply's order)
    assemble: (reply) => {
      const plan = base.assemble(reply);
      const listed = asObject(reply).threads;
      const written = (Array.isArray(listed) ? listed : []).map(asObject);
      const threads = plan.threads.map((thread, i) => {
        const scene = sceneOf(written[i]);
        return scene ? { ...thread, scene } : thread;
      });
      return { ...plan, threads };
    },
  };
}

function turnRequest(story: Story): TextRequest {
  const production = sharedScenesBase(story, "beat");
  if (!takesScenesBlock(story)) return production;
  return { ...production, prompt: withSharedScenesLines(production.prompt, story, "beat") };
}

/**
 * The variant's request for a story role: production's chapter planner or group turn, each with its insertions where
 * they apply; production's switch planner. `b`: the fix-and-retest's planner line (sharedScenesB); its turn is the
 * variant's.
 */
export function sharedScenesRequest(story: Story, role: "thread", options?: { b?: boolean }): PlanRequest<ThreadAnalysis>;
export function sharedScenesRequest(story: Story, role: "beat" | "switch" | "thread", options?: { b?: boolean }): TextRequest & { assemble?: (reply: unknown) => unknown };
export function sharedScenesRequest(story: Story, role: "beat" | "switch" | "thread", options: { b?: boolean } = {}): TextRequest & { assemble?: (reply: unknown) => unknown } {
  if (role === "thread") return threadRequest(story, options.b === true);
  if (role === "switch") return switchStep.request(story);
  return turnRequest(story);
}
