import { z } from "zod";
import type { Story } from "core/models/Story.js";
import { pickedOutcome } from "./pacing.js";

/*
 * Shared scenes in group stories: each person and each thing in one place per
 * turn across all the players' texts (decision A of 2026-10-01, measured in
 * the scenes stage that evening as the eval's sharedScenesB, its one
 * fix-and-retest; .context/story.md, "Shared scenes").
 *
 * Why: in the third playthroughs every group story put a person in two places
 * at once, and every split came from a thread one player picked that held a
 * player of another thread or one of the people another thread needed (the
 * estate agents' friendship thread with Rory in every step while he restaged
 * the conservatory, the food trucks' showcase contest with Omar's station
 * across the lane while he loaded his truck with Jo, the space pirates' Oren
 * joining "Tomas and Davi at the chart table" while Davi worked the engine,
 * the buyer at the nursery door and at Noor's table at once). The chapter
 * planner followed the picks and was told nothing about where parallel threads
 * happen; a thread's own plan never reached a turn; the group turn's
 * consistency lines covered only players in the same thread or switch.
 *
 * So, where the players' picks set more than one outcome, the chapter planner
 * is told that parallel threads share one moment and one world (every player
 * in one thread even where a pick names another player; one person, crew,
 * vehicle or object in one thread's scene; no stand-in for a contest's absent
 * side) and writes each thread's scene, which the plan keeps (Thread.scene);
 * and the group turn on a chapter's opening step with several threads reads
 * where everyone is (each thread's players by name and its scene) before the
 * thread configuration, with a consistency line pointing at it. Measured: the
 * chains (the planner, then its group turn on the chapter's opening) 5 of 10
 * -> 9 of 10 consistent on the calibrated judge (8 of 10 by hand: the space
 * pirates' captain still in two of three scenes); the turn alone on later
 * steps of the round's stored plans moved nothing and told openings again more
 * often, so a later step keeps production's turn (takesScenesBlock).
 */

const PLANNER_LINE =
  "\n\nParallel threads happen at the same moment, in one world, so each person and each thing is in one thread's scene at a time:\n" +
  '- Every player is in exactly one thread and only in its scenes. A pick can name another player who chose something else ("Meet Rory at the café", "Join Tomas at the chart table"), or an outcome can be shared with them or contested by their side: that player is in their own thread, so this one plays without them. No step or result has them there, acting, answering or agreeing; the thread can reach them by message, prepare something for them, or leave them for later.\n' +
  "- Everyone else is in one thread's scene too: a character, crew or group one thread's steps need is in no other thread's steps, and a key object (a ledger, a record, a plate) is in one place. A thread that moves a shared place (the ship leaves port) moves it for everyone.\n" +
  "- When two threads would need the same person (a captain, a buyer, a judge) or the same crew, vehicle or object, only one thread's scene has them: the other plays without them, or reaches them by message. A contest only one side chose stands no one in for the absent side: no rival's crew, station or vehicle in its scene.\n" +
  "- Each thread's scene says where it happens and who and what is there besides its players.";

const SCENE_FIELD =
  "Where this thread's beats happen and who and what is there besides its players: the place, then the characters, crews, vehicles and key objects its steps need. Never a player of another thread, and no one and nothing another thread's scene holds.";

const TURN_LINE =
  "- Where players are in different threads (WHERE EVERYONE IS THIS TURN), every person, group, vehicle and object is in one place across all the beats of this turn: a player appears in another player's beat only if they are in the same thread, and a shared place is in the same state in every beat.\n";

const BLOCK_HEAD = "\n======= WHERE EVERYONE IS THIS TURN =======\n\nThese threads happen at the same moment, each in its own scene:\n";

const BLOCK_RULE =
  "A player is only in their own thread's scene: in another player's text they can be remembered, talked about or reached by message, never shown there, even where a choice or a step names them. Everyone and everything else is in one scene at a time, where this chapter's plan and its earlier beats put them.\n";

/** The passages production prints, which the kept tests hold to the measured variant. */
export const SHARED_SCENES = {
  plannerLine: PLANNER_LINE,
  sceneField: SCENE_FIELD,
  turnLine: TURN_LINE,
  blockHead: BLOCK_HEAD,
  blockRule: BLOCK_RULE,
};

/** Whether the chapter planner takes the line and each thread's scene: a group after its first chapter whose players' picks set more than one outcome. */
export function takesScenesPlanner(story: Story): boolean {
  if (!story.isMultiplayer() || !story.hasThreadAnalysis()) return false;
  const outcomes = story.getPlayerSlots().flatMap((slot) => {
    const id = pickedOutcome(story, slot)?.outcomeId;
    return id ? [id] : [];
  });
  return new Set(outcomes).size > 1;
}

/**
 * Whether the group turn takes where everyone is and the consistency line: a group chapter's opening step (no step
 * played yet) whose chapter has more than one thread, the turn the stage's chains measured after their planner. Not a
 * later step: measured alone on the round's stored plans there, the block moved no split (5 of 10 -> 4 of 10) and the
 * turns told their opening again more often (openingNotReused 100% -> 60% of the kept turns, moved lower, p 0.043).
 */
export function takesScenesBlock(story: Story): boolean {
  if (!story.isMultiplayer() || story.getCurrentBeatType() !== "thread" || story.getCurrentThreadBeatsCompleted() !== 0) return false;
  return (story.getCurrentThreadAnalysis()?.threads.length ?? 0) > 1;
}

/** A thread's scene as its plan holds it, trimmed; undefined where it holds none (a plan from before, or one that wrote none). */
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

/** A group's chapter planner reply schema with each thread's scene right after its players. */
export function withSceneField(schema: z.AnyZodObject): z.AnyZodObject {
  const threads = schema.shape.threads;
  if (!(threads instanceof z.ZodArray) || !(threads.element instanceof z.ZodObject)) throw new Error("A group's chapter plan has no thread list");
  const shape = threads.element.shape as Record<string, z.ZodTypeAny>;
  const entries = Object.entries(shape).flatMap(([key, field]): [string, z.ZodTypeAny][] => (key === "playersSideB" ? [[key, field], ["scene", z.string().describe(SCENE_FIELD)]] : [[key, field]]));
  const cap = threads._def.maxLength?.value;
  const list = z.array(z.object(Object.fromEntries(entries)));
  return schema.extend({ threads: (cap === undefined ? list : list.max(cap)).describe(threads.description ?? "") });
}
