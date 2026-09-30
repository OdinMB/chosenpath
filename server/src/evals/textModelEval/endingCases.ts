import { Story } from "core/models/Story.js";
import type { StoryState } from "core/types/index.js";
import { outcomeStatesAtEnding } from "../../game/services/storyTextRounds/endingState.js";
import type { EvalCase } from "./cases.js";
import { intendedMilestones, roundCase, type StateEdit } from "./roundCases.js";
import type { ChainRun } from "./setupChain.js";

/*
 * The endings the ending's run needs that no frozen case holds (the owner's
 * decision of 2026-09-30: each outcome is told as its milestones leave it).
 * The three stored endings are one story (Novi Reg after its first chapter)
 * with every outcome unfinished, and no frozen group case reaches an ending or
 * even the end of a chapter with a contest on the scoreboard: the stored group
 * cases stop at turn 1, on templates made before round 3's contest form, and
 * the one group story played past its first chapter (Red Dust Rhapsody) has no
 * contest. So four endings are built, no calls:
 * - a single player (Novi Reg after its second chapter, a frozen case): the
 *   Waste Ring complete with the ending's milestone (its intended count set to
 *   the two chapters it had), the identity and City AI outcomes unfinished;
 * - two players, the bounty hunters of setup round 3's setup-to-play chain
 *   (a round-3 contest setup with its scoreboard, the first chapter a contest
 *   on the bounty): the bounty's contest complete (its intended count set to
 *   one), and the same contest unfinished (1 of 3), side B ahead on the
 *   scoreboard in both, 35|65, as the chain's own switch turn wrote it;
 * - three players in two camps, the co-founders of the same chain (player1's
 *   Stewardship camp against the other two's Momentum camp): the pilot, the
 *   first chapter's cooperative outcome, complete (its intended count set to
 *   one), the camps' governance contest unfinished (0 of 2) with player1's
 *   camp ahead, 60|40.
 * A chain stored its story after the switch turn that followed the first
 * chapter, so it is cut back before that turn (beforeSwitchTurn): the turn's
 * beat and plan dropped, and what it added (its milestone, its facts, the
 * introductions nothing earlier made). No chain turn changed a stat. Each
 * story's length is then set to its current turn, so the next turn is the
 * ending (the stored endings were built the same way). Frozen beside the
 * others with --build-ending-cases.
 */

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const turnOf = (state: StoryState) => Story.create(state).getCurrentTurn();

/** The story's length set to its current turn, so the next turn is its ending. */
export const endHere: StateEdit = {
  describe: "maxTurns set to the current turn, so the next turn is the story's ending",
  apply: (state) => {
    state.maxTurns = turnOf(state);
  },
};

/** A shared stat's current value set (a contest's scoreboard); a stat the story lacks throws. */
export function sharedStatValue(statId: string, value: number): StateEdit {
  return {
    describe: `${statId} set to ${value}`,
    apply: (state) => {
      if (!state.sharedStats.some((s) => s.id === statId)) throw new Error(`The story holds no shared stat ${statId}`);
      state.sharedStatValues = [...state.sharedStatValues.filter((v) => v.statId !== statId), { statId, value }];
    },
  };
}

export type EndingSource = { frozen: string } | { chain: string; sample: number };

export type EndingSpec = {
  id: string;
  from: EndingSource;
  /** What the case tests, first in its note */
  purpose: string;
  edits: StateEdit[];
  /** The outcomes the built ending must hold complete (true) or unfinished (false) after its milestones */
  complete: Record<string, boolean>;
};

const EXPOSE = "player1_expose_waste_ring";
const IDENTITY = "player1_redefine_identity";
const INFLUENCE = "player1_influence_city_ai";
const BOUNTY = "shared_bounty_claim";
const PILOT = "shared_north_quay_pilot";
const GOVERNANCE = "shared_lattice_governance";

const TOLD = "Each outcome is told as its milestones leave it (the owner's decision of 2026-09-30):";

export const ENDING_CASE_SPECS: EndingSpec[] = [
  {
    id: "round-end-complete-8988006e-t8",
    from: { frozen: "synth-8988006e-t8-pregeneration_7_player1_2" },
    purpose: `${TOLD} a single player's ending after two chapters on the Waste Ring, which the ending's milestone completes (its intended count set to 2), while the identity (0 of 2) and City AI (0 of 1) outcomes are unfinished.`,
    edits: [endHere, intendedMilestones({ [EXPOSE]: 2 })],
    complete: { [EXPOSE]: true, [IDENTITY]: false, [INFLUENCE]: false },
  },
  {
    id: "round-end-contest-complete-bounty-t4",
    from: { chain: "chain-bounty-hunters", sample: 1 },
    purpose: `${TOLD} a two-player contest complete: the bounty hunters after their first chapter, a contest on the bounty, which the ending's milestone completes (its intended count set to 1), side B ahead on the scoreboard (35|65); each hunter's own outcomes unfinished.`,
    edits: [endHere, intendedMilestones({ [BOUNTY]: 1 }), sharedStatValue("shared_bounty_score", 35)],
    complete: { [BOUNTY]: true },
  },
  {
    id: "round-end-contest-unfinished-bounty-t4",
    from: { chain: "chain-bounty-hunters", sample: 1 },
    purpose: `${TOLD} the same two-player contest unfinished: 1 of 3 milestones with the ending's, side B ahead on the scoreboard (35|65).`,
    edits: [endHere, sharedStatValue("shared_bounty_score", 35)],
    complete: { [BOUNTY]: false },
  },
  {
    id: "round-end-camps-cofounders-t4",
    from: { chain: "chain-cofounders", sample: 1 },
    purpose: `${TOLD} three players in two camps: the co-founders after their first chapter, on the pilot, which the ending's milestone completes (its intended count set to 1); the camps' governance contest unfinished (0 of 2) with player1's camp (side A) ahead on the scoreboard (60|40); each founder's own outcome unfinished.`,
    edits: [endHere, intendedMilestones({ [PILOT]: 1 }), sharedStatValue("shared_governance_score", 60)],
    complete: { [PILOT]: true, [GOVERNANCE]: false },
  },
];

type Loose = Record<string, unknown>;
const asObject = (value: unknown): Loose => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : {});
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** The changes a stored turn reply made, as the game applied them. */
function changesOf(reply: unknown) {
  const r = asObject(reply);
  const players = Object.entries(r).filter(([key]) => /^player\d+$/i.test(key));
  const plans = players.map(([, beat]) => asObject(asObject(beat).plan));
  return {
    milestones: asArray(r.newMilestones).map(asObject),
    facts: plans.flatMap((plan) => asArray(plan.establishedFacts).map(asObject)),
    introductions: plans.flatMap((plan) => asArray(plan.newIntroductionsOfStoryElements).map(asObject)),
  };
}

function removeLast(list: string[], item: string): string[] {
  const at = list.lastIndexOf(item);
  return at < 0 ? list : [...list.slice(0, at), ...list.slice(at + 1)];
}

/**
 * A setup chain's story before the switch turn it stopped after: that turn's
 * beat and its switch plan dropped, its milestone taken off its outcome, its
 * facts off their elements (unless the story held them before), and its
 * introductions undone where neither the start nor an earlier turn had made
 * them. The run is left as it was.
 */
export function beforeSwitchTurn(run: ChainRun): StoryState {
  const last = run.steps[run.steps.length - 1];
  if (!run.end || !run.start || last?.kind !== "switch turn" || last.output === undefined) {
    throw new Error(`${run.premise.id} s${run.sample}: the run did not stop after its switch turn`);
  }
  const state = clone(run.end);
  for (const player of Object.values(state.players)) player.beatHistory.pop();
  const phase = state.storyPhases.pop();
  if (!phase || !("switches" in phase)) throw new Error(`${run.premise.id} s${run.sample}: the last phase is not the switch plan`);

  const turn = changesOf(last.output);
  const earlier = run.steps.slice(0, -1).map((step) => changesOf(step.output));
  for (const change of turn.milestones) {
    const text = String(change.newMilestone ?? "");
    const lists = change.outcomeGroup === "shared" ? [state.sharedOutcomes] : [state.players[String(change.outcomeGroup)]?.outcomes ?? []];
    for (const outcome of lists.flat().filter((o) => o.id === change.outcome)) outcome.milestones = removeLast(outcome.milestones ?? [], text);
  }
  const factBefore = (elementId: string, fact: string) =>
    (elementId === "world" ? run.start?.worldFacts ?? [] : run.start?.storyElements.find((e) => e.id === elementId)?.facts ?? []).includes(fact) ||
    earlier.some((e) => e.facts.some((f) => f.storyElementId === elementId && f.fact === fact));
  for (const change of turn.facts) {
    const [elementId, fact] = [String(change.storyElementId ?? ""), String(change.fact ?? "")];
    if (factBefore(elementId, fact)) continue;
    if (elementId === "world") state.worldFacts = state.worldFacts.filter((f) => f !== fact);
    else for (const element of state.storyElements.filter((e) => e.id === elementId)) element.facts = element.facts.filter((f) => f !== fact);
  }
  for (const change of turn.introductions) {
    const [slot, elementId] = [String(change.player ?? ""), String(change.storyElementId ?? "")];
    const knownBefore =
      (run.start.players[slot]?.knownStoryElements ?? []).includes(elementId) ||
      earlier.some((e) => e.introductions.some((i) => i.player === slot && i.storyElementId === elementId));
    const player = state.players[slot];
    if (player && !knownBefore) player.knownStoryElements = player.knownStoryElements.filter((id) => id !== elementId);
  }
  return state;
}

const sourceText = (from: EndingSource) => ("frozen" in from ? from.frozen : `the setup chain's ${from.chain} (sample ${from.sample}), cut back before its switch turn`);

/** The built endings from the frozen cases and the stored setup chain's runs, and what could not be built. */
export function endingStateCases(frozen: EvalCase[], runs: ChainRun[]): { cases: EvalCase[]; problems: string[] } {
  const byId = new Map(frozen.map((c) => [c.id, c]));
  const cases: EvalCase[] = [];
  const problems: string[] = [];
  for (const spec of ENDING_CASE_SPECS) {
    let state: StoryState;
    let dark = false;
    if ("frozen" in spec.from) {
      const base = byId.get(spec.from.frozen);
      if (!base?.state) {
        problems.push(`${spec.id}: no frozen case ${spec.from.frozen}`);
        continue;
      }
      state = clone(base.state);
      dark = base.tags.dark;
    } else {
      const { chain, sample } = spec.from;
      const run = runs.find((r) => r.premise.id === chain && r.sample === sample);
      if (!run) {
        problems.push(`${spec.id}: no setup chain run ${chain} s${sample}`);
        continue;
      }
      state = beforeSwitchTurn(run);
    }
    try {
      for (const edit of spec.edits) edit.apply(state);
    } catch (error) {
      problems.push(`${spec.id}: ${(error as Error).message}`);
      continue;
    }
    const story = Story.create(state);
    const states = new Map(story.getCurrentBeatType() === "ending" ? outcomeStatesAtEnding(story).map((s) => [s.id, s.complete]) : []);
    const wrong =
      story.getCurrentBeatType() !== "ending"
        ? `the built turn is a ${story.getCurrentBeatType()}, not the ending`
        : Object.entries(spec.complete)
            .filter(([id, complete]) => states.get(id) !== complete)
            .map(([id, complete]) => `${id} is not ${complete ? "complete" : "unfinished"} after the ending's milestones`)
            .join("; ");
    if (wrong) {
      problems.push(`${spec.id}: ${wrong}`);
      continue;
    }
    cases.push(
      roundCase({
        id: spec.id,
        role: "beat",
        state,
        category: "ending-state",
        dark,
        note: `${spec.purpose} Built from ${sourceText(spec.from)} by editing its state: ${spec.edits.map((e) => e.describe).join("; ")}.`,
      })
    );
  }
  return { cases, problems };
}

/** What --build-ending-cases freezes: every built ending not frozen yet (all of them when rebuilding), and what was left as frozen. */
export function endingCasesToFreeze(frozen: EvalCase[], runs: ChainRun[], replace: boolean): { cases: EvalCase[]; problems: string[]; skipped: string[] } {
  const { cases, problems } = endingStateCases(frozen, runs);
  const known = new Set(frozen.map((c) => c.id));
  const skipped = replace ? [] : cases.filter((c) => known.has(c.id)).map((c) => c.id);
  return { cases: cases.filter((c) => !skipped.includes(c.id)), problems, skipped };
}
