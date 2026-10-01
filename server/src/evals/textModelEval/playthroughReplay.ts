import { Story } from "core/models/Story.js";
import type { PlayerSlot, SwitchAnalysis, ThreadAnalysis } from "core/types/index.js";
import { BeatResolutionService } from "../../game/services/BeatResolutionService.js";
import { ChangeService } from "../../game/services/ChangeService.js";
import { ThreadResolutionService } from "../../game/services/ThreadResolutionService.js";
import { beatStep, switchStep, threadStep } from "../../game/services/storyTextSteps.js";
import { playRunId, withSeededDice, type PlayRun, type PlayTurn } from "./playthroughs.js";

/*
 * A stored playthrough replayed turn by turn (eval only, the choice-result
 * stage of 2026-09-30): the story the run started from (after character
 * selection), then each turn in StoryProgressionService.handleProgression's
 * order as playthroughs.ts played it: the chapter's latest steps resolved on
 * the run's own seeded dice, the harness's re-picks where it made them, the
 * plan as the run stored it (checked and repaired), the turn's reply as the
 * run stored it (repaired) and its changes, then each player's pick resolved
 * on the same seeded dice. No call is made and no plan check runs again, so
 * each state is the one the played turn saw; the tests hold the rebuilt
 * requests to the ones the run sent. Where production's code has changed
 * since the run in a way the replay goes through (a group exploration step's
 * resolution, since the owner decides it), a later state can differ from the
 * played one: build nothing on it without checking its request.
 */

export type ReplayedTurn = {
  turn: number;
  played: PlayTurn;
  /** After the chapter's latest steps were resolved (and any re-pick), before a planner ran: a planner's input */
  beforePlan: Story;
  /** The turn's own input: the plan applied; the same story as beforePlan on a turn without a planner */
  before: Story;
};

const FALLBACK_DIFFICULTY = { title: "Balanced", modifier: -10 };

/**
 * Every turn the run wrote a reply for, with the states it saw; stops at the
 * ending or where the run stopped. A short playthrough (the late-pacing stage)
 * replays from where it started, on its own seeds, its first chapter resolved
 * already in its start.
 */
export function replayRun(run: PlayRun): ReplayedTurn[] {
  if (!run.start) return [];
  const id = run.from?.seedId ?? playRunId(run.spec, run.sample);
  let story = Story.create(run.start);
  const difficulty = story.getState().difficultyLevel || FALLBACK_DIFFICULTY;
  const replayed: ReplayedTurn[] = [];
  let resolvedAlready = run.from !== undefined;
  for (const played of run.turns) {
    if (story.getCurrentTurn() + 1 !== played.turn) throw new Error(`${id}: turn ${played.turn} follows turn ${story.getCurrentTurn()}`);
    if (!resolvedAlready) {
      const resolving = story.clone();
      story = withSeededDice(`${id}|t${played.turn}|chapter`, () => ThreadResolutionService.resolveCurrentThreads(resolving));
    }
    resolvedAlready = false;
    for (const change of played.repicks ?? []) {
      const chosen = story.updateChoice(change.slot as PlayerSlot, change.to);
      story = withSeededDice(`${id}|t${played.turn}|repick|${change.slot}`, () => BeatResolutionService.resolveChoice(chosen, change.slot as PlayerSlot, change.to, difficulty));
    }
    const beforePlan = story;
    const plan = played.plan?.plan;
    if (played.plan && !plan) break;
    if (played.plan && plan) story = played.plan.kind === "switch plan" ? switchStep.apply(story, plan as SwitchAnalysis) : threadStep.apply(story, plan as ThreadAnalysis);
    if (!played.reply) break;
    const before = story;
    replayed.push({ turn: played.turn, played, beforePlan, before });
    const [withBeat, changes] = beatStep.apply(before, played.reply, true);
    story = new ChangeService().applyChanges(withBeat, changes);
    if (played.kind === "ending") break;
    for (const pick of played.picks) {
      const chosen = story.updateChoice(pick.slot as PlayerSlot, pick.option);
      story = withSeededDice(`${id}|t${played.turn}|${pick.slot}`, () => BeatResolutionService.resolveChoice(chosen, pick.slot as PlayerSlot, pick.option, difficulty));
    }
  }
  return replayed;
}

/** One turn of one stored story (its first sample), replayed; throws where the story or the turn isn't there. */
export function replayedTurn(runs: PlayRun[], storyId: string, turn: number, sample = 1): ReplayedTurn {
  const run = runs.find((r) => r.spec.id === storyId && r.sample === sample);
  if (!run) throw new Error(`No stored playthrough ${storyId} s${sample}`);
  const found = replayRun(run).find((r) => r.turn === turn);
  if (!found) throw new Error(`${storyId} s${sample} has no replayed turn ${turn}`);
  return found;
}
