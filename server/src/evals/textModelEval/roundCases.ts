import { Story } from "core/models/Story.js";
import type {
  PlayerSlot,
  SetOfBeatGenerationSchema,
  StoryState,
  SwitchAnalysis,
  ThreadAnalysis,
} from "core/types/index.js";
import { BeatResolutionService } from "../../game/services/BeatResolutionService.js";
import { repairBeatReply } from "../../game/services/beatRepairs.js";
import { ChangeService } from "../../game/services/ChangeService.js";
import { ThreadResolutionService } from "../../game/services/ThreadResolutionService.js";
import { beatStep, switchStep, threadStep, type TextRequest } from "../../game/services/storyTextSteps.js";
import type { EvalRole } from "./arms.js";
import { chooseAndResolve } from "./caseBuilder.js";
import { caseStory, type EvalCase, type FixedAnalysis } from "./cases.js";
import { storyAfterAnalysis } from "./jobPlan.js";

/*
 * The cases the turn rounds need that play never produced (turn doc section
 * 4, "Before round 1", item 4), frozen beside the others with source "round":
 * - by editing a frozen case's state (EDITED_CASES): late switches, an outcome
 *   already at n of n, a 10-turn and a 20-turn story with their milestones
 *   scaled to the length, and trigger rules in the setup document's new form
 *   (a stat at its threshold, a mid-story timing rule, an opening rule);
 * - by playing a frozen case forward (as caseBuilder.ts does): a step inside
 *   an exploration chapter and a Neonate feeding chapter from stored GPT-6
 *   replies, and a multiplayer switch and chapter after the first. Where no
 *   stored reply exists, production's GPT-6 default for the role writes it
 *   (the `call` the CLI passes), never gpt-4.x (owner, 2026-09-27).
 * A call made on a round case's own input is recorded under that case's id
 * with production's default arm at sample 1, so the migration check reuses
 * it, as the first-beat cases reuse their build call.
 * Choices are picked by hash and resolved at build time (a challenge option
 * rolls the dice), then frozen, as every case is.
 */

export const ROUND_CASE_PREFIX = "round-";

/** One named edit of a frozen state; `describe` goes into the case's note. */
export type StateEdit = { describe: string; apply: (state: StoryState) => void };

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const turnOf = (state: StoryState) => Story.create(state).getCurrentTurn();

/** The story's length set so this many turns are left, the one being written included (STORY PROGRESS). */
export function turnsLeft(n: number): StateEdit {
  return {
    describe: `maxTurns set so ${n} turns are left, the next one included`,
    apply: (state) => {
      state.maxTurns = turnOf(state) + n;
    },
  };
}

export function maxTurns(n: number): StateEdit {
  return {
    describe: `maxTurns ${n}`,
    apply: (state) => {
      state.maxTurns = n;
    },
  };
}

/** Intended milestone counts by outcome id, on the shared list and every player's; an id the story lacks throws. */
export function intendedMilestones(counts: Record<string, number>): StateEdit {
  return {
    describe: `intended milestones ${Object.entries(counts).map(([id, n]) => `${id} ${n}`).join(", ")}`,
    apply: (state) => {
      const lists = [state.sharedOutcomes ?? [], ...Object.values(state.players).map((p) => p.outcomes ?? [])];
      for (const [id, n] of Object.entries(counts)) {
        const found = lists.flatMap((list) => list.filter((o) => o.id === id));
        if (found.length === 0) throw new Error(`The story holds no outcome ${id}`);
        found.forEach((o) => (o.intendedNumberOfMilestones = n));
      }
    },
  };
}

/** The story's switch/thread instructions replaced whole, as a setup in the new form writes them (setup doc A7.1). */
export function switchAndThreadInstructions(rules: string[]): StateEdit {
  return {
    describe: `switch and thread instructions replaced by ${rules.length} rules in the setup document's new form`,
    apply: (state) => {
      state.guidelines = { ...state.guidelines, switchAndThreadInstructions: rules };
    },
  };
}

/** A stat's narrative implications replaced whole (setup doc A7.3); a stat the story lacks throws. */
export function narrativeImplications(statId: string, lines: string[]): StateEdit {
  return {
    describe: `${statId}'s narrative implications replaced by thresholds in the new form`,
    apply: (state) => {
      const stat = [...state.sharedStats, ...state.playerStats].find((s) => s.id === statId);
      if (!stat) throw new Error(`The story holds no stat ${statId}`);
      stat.narrativeImplications = lines;
    },
  };
}

// --- Frozen round cases ---

type RoundCaseInput = {
  id: string;
  role: "beat" | "switch" | "thread";
  state: StoryState;
  fixedAnalysis?: FixedAnalysis;
  category: string;
  dark?: boolean;
  note: string;
};

/** A round case with its tags read from its state, as a turn call would see it. */
function roundCase(input: RoundCaseInput): EvalCase {
  const players = Object.keys(input.state.players).length;
  const draft: EvalCase = {
    id: input.id,
    role: input.role,
    state: input.state,
    ...(input.fixedAnalysis ? { fixedAnalysis: input.fixedAnalysis } : {}),
    note: input.note,
    tags: {
      players,
      gameMode: input.state.gameMode,
      images: input.state.generateImages,
      multiplayer: players > 1,
      kids: input.state.category === "read-with-kids",
      dark: input.dark ?? false,
      subset15: false,
      hasStoredOutput: false,
      firstBeat: false,
      ending: false,
      analysisTurn: false,
      source: "round",
      category: input.category,
    },
  };
  if (input.role !== "beat") return draft;
  const story = caseStory(draft);
  const ending = story.getCurrentBeatType() === "ending";
  return {
    ...draft,
    tags: {
      ...draft.tags,
      firstBeat: story.getCurrentTurn() === 0,
      ending,
      analysisTurn: input.fixedAnalysis !== undefined,
      ...(ending ? { beatType: "ending" } : {}),
    },
  };
}

export type EditSpec = {
  id: string;
  role: "switch" | "thread";
  /** The frozen case whose state (before any analysis) is edited */
  base: string;
  category: string;
  /** What the case tests, first in its note */
  purpose: string;
  edits: StateEdit[];
};

/** A planning case: the base's state before analysis, edited. The base stays untouched. */
export function editedCase(base: EvalCase, spec: EditSpec): EvalCase {
  if (!base.state) throw new Error(`Case ${base.id} has no story state`);
  const state = clone(base.state);
  for (const edit of spec.edits) edit.apply(state);
  return roundCase({
    id: spec.id,
    role: spec.role,
    state,
    category: spec.category,
    dark: base.tags.dark,
    note: `${spec.purpose} Built from ${base.id} by editing its state: ${spec.edits.map((e) => e.describe).join("; ")}.`,
  });
}

/** Novi Reg (story 8988006e): the switch after its second chapter, turn 8 of 20 */
const NOVI_REG_T8 = "synth-8988006e-t8-pregeneration_7_player1_2";
/** Novi Reg: the switch after its first chapter (favorable), turn 4 of 20 */
const NOVI_REG_T4 = "switch-8988006e-t4-o2";
/** Novi Reg: the second chapter's plan, turn 5 of 20 */
const NOVI_REG_T5 = "thread-8988006e-t5-o0";
/** IPO to Mars (template 2db542e9), single player, before its first switch; it has no switch/thread instructions */
const IPO_T0 = "switch-tpl-2db542e9-p1-t0";

const EXPOSE = "player1_expose_waste_ring";
const IDENTITY = "player1_redefine_identity";
const INFLUENCE = "player1_influence_city_ai";

/** The recipe both Novi Reg trigger cases keep (the story's own 2-beat rule, in the new form) */
const NOVI_REG_RECIPE =
  "Recipe for an emotion-responsive environment thread: 2 beats; the city's mood shifts around Arielle, then she decides how to use it.";

/** Rules in the new form (setup doc A7.1): a stat trigger that is due at turn 8 (Personal Agency is at 40%), a recipe and the finale */
export const NOVI_REG_STAT_RULES = [
  "When Personal Agency falls to 40% or below, the next thread is about Arielle taking back control of her own choices.",
  NOVI_REG_RECIPE,
  "The final thread is about whether the City AI Council opens its decisions to the public.",
];

/** Personal Agency's thresholds in the new form (setup doc A7.3) */
export const AGENCY_IMPLICATIONS = [
  "At 40% or below: the next switch forces a thread about Arielle reclaiming her independence.",
  "At 80% or above: every topic switch offers a bold public move.",
];

/** A mid-story timing rule that is due at the switch of turn 9 of 20, on the one outcome no chapter has pushed yet */
export const NOVI_REG_TIMING_RULES = [
  "Around the middle of the story, turns 9 to 11: the City AI Council summons Arielle to a public hearing, and the switch there is a flavor switch on how she answers the summons.",
  NOVI_REG_RECIPE,
  "The final thread is about whether the Waste Ring's backers face the public.",
];

/** An opening rule on the outcome with the fewest milestones, so a planner that ignores it picks something else */
export const IPO_OPENING_RULES = [
  "The opening: the first thread is about the launch-day explosion at the Nevada test site, which tests how far the Inner Circle will follow the player.",
  "Recipe for an investor pitch thread: 2 beats; the room's hardest objection, then the closing ask.",
  "The final thread is about the first crewed landing on Mars.",
];

const SHORT_COUNTS = { [EXPOSE]: 1, [IDENTITY]: 1, [INFLUENCE]: 1 };
const LONG_COUNTS = { [EXPOSE]: 2, [IDENTITY]: 2, [INFLUENCE]: 1 };

export const EDITED_CASES: EditSpec[] = [
  {
    id: "round-switch-late5-8988006e-t8",
    role: "switch",
    base: NOVI_REG_T8,
    category: "late-switch",
    purpose:
      "A late switch (turn doc A4, binding late): 5 turns left, so the chapter it opens is the story's last, with exactly 4 turns, while 4 milestones are still needed.",
    edits: [turnsLeft(5)],
  },
  {
    id: "round-switch-late3-8988006e-t8",
    role: "switch",
    base: NOVI_REG_T8,
    category: "late-switch",
    purpose: "A late switch: 3 turns left, so the last chapter has exactly 2 turns and no chapter fits the 4 milestones still needed.",
    edits: [turnsLeft(3)],
  },
  {
    id: "round-switch-complete-8988006e-t8",
    role: "switch",
    base: NOVI_REG_T8,
    category: "complete-outcome",
    purpose:
      "An outcome already at n of n: the Waste Ring outcome holds 1 of 1 milestones and the chapter that just ended adds an aftermath, so the switch must not offer it while the others are open (turn doc A4).",
    edits: [intendedMilestones({ [EXPOSE]: 1 })],
  },
  {
    id: "round-switch-short10-8988006e-t4",
    role: "switch",
    base: NOVI_REG_T4,
    category: "short-story",
    purpose:
      "A 10-turn story at its second switch, its milestones scaled to the length (3, one per outcome: setup doc A10): 6 turns left fit one chapter, the Waste Ring outcome is complete with the chapter that just ended, and two outcomes are still open.",
    edits: [maxTurns(10), intendedMilestones(SHORT_COUNTS)],
  },
  {
    id: "round-thread-short10-8988006e-t5",
    role: "thread",
    base: NOVI_REG_T5,
    category: "short-story",
    purpose:
      "A 10-turn story's second chapter plan, its milestones scaled to the length (3, setup doc A10): 5 turns left allow only a 2-turn chapter (turn doc A4), and the flavor switch's outcome is already complete, so its milestones are an aftermath.",
    edits: [maxTurns(10), intendedMilestones(SHORT_COUNTS)],
  },
  {
    id: "round-switch-long20-8988006e-t4",
    role: "switch",
    base: NOVI_REG_T4,
    category: "long-story",
    purpose:
      "A 20-turn story with its milestones scaled to the length (5 instead of the stored 6: setup doc A10) at its second switch: 16 turns left fit the 4 still needed, so pacing does not bind.",
    edits: [intendedMilestones(LONG_COUNTS)],
  },
  {
    id: "round-thread-long20-8988006e-t5",
    role: "thread",
    base: NOVI_REG_T5,
    category: "long-story",
    purpose: "A 20-turn story's second chapter plan with its milestones scaled to the length (5): 15 turns left allow 2, 3 or 4 turns.",
    edits: [intendedMilestones(LONG_COUNTS)],
  },
  {
    id: "round-switch-trigger-stat-8988006e-t8",
    role: "switch",
    base: NOVI_REG_T8,
    category: "trigger-stat",
    purpose:
      "A stat at its threshold, in the setup document's new form (A7.1, A7.3): Personal Agency sits at 40%, and a switch/thread rule and the stat's own implication force a thread about it at this switch (turn doc A4 step a).",
    edits: [switchAndThreadInstructions(NOVI_REG_STAT_RULES), narrativeImplications("player_personal_agency", AGENCY_IMPLICATIONS)],
  },
  {
    id: "round-switch-trigger-timing-8988006e-t8",
    role: "switch",
    base: NOVI_REG_T8,
    category: "trigger-timing",
    purpose:
      "A mid-story timing rule in the setup document's new form (A7.1): the rule names turns 9 to 11, and this switch writes turn 9 of 20, on the one outcome no chapter has pushed yet.",
    edits: [switchAndThreadInstructions(NOVI_REG_TIMING_RULES)],
  },
  {
    id: "round-switch-trigger-opening-2db542e9-t0",
    role: "switch",
    base: IPO_T0,
    category: "trigger-opening",
    purpose:
      "An opening rule in the setup document's new form (A7.1) at the story's first switch: the rule sets the first thread's subject, so the switch is a flavor switch on the outcome it bears on (turn doc A4, B7; section 5 defaults).",
    edits: [switchAndThreadInstructions(IPO_OPENING_RULES)],
  },
];

/** The edited cases whose base is frozen; a missing base is reported, not thrown. */
export function editedCases(frozen: EvalCase[]): { cases: EvalCase[]; skipped: string[] } {
  const byId = new Map(frozen.map((c) => [c.id, c]));
  const cases: EvalCase[] = [];
  const skipped: string[] = [];
  for (const spec of EDITED_CASES) {
    const base = byId.get(spec.base);
    if (base) cases.push(editedCase(base, spec));
    else skipped.push(`${spec.id}: base case ${spec.base} is not frozen`);
  }
  return { cases, skipped };
}

// --- Played forward ---

/** A stored or new call's parsed reply and its output file (for the note). */
export type RoundReply = { parsed: unknown; outputFile: string };

/** One call with production's GPT-6 default for the role and player count; undefined when nothing usable came back. */
export type RoundCall = (role: EvalRole, caseId: string, request: TextRequest, players: number) => Promise<RoundReply | undefined>;

/** A beat reply as the game keeps it: repaired, added to the story, its changes applied. */
export function afterBeatReply(story: Story, written: SetOfBeatGenerationSchema): Story {
  const { reply } = repairBeatReply(story, written);
  const [withBeats, changes] = beatStep.apply(story, reply, true);
  return new ChangeService().applyChanges(withBeats, changes);
}

/** The player's choice of this option, resolved; then any chapter step it settles. */
function chooseOption(story: Story, slot: PlayerSlot, option: number): Story {
  const difficulty = story.getState().difficultyLevel || { title: "Balanced", modifier: -10 };
  const chosen = BeatResolutionService.resolveChoice(story.updateChoice(slot, option), slot, option, difficulty);
  return ThreadResolutionService.resolveCurrentThreads(chosen);
}

/** Every player's option picked by hash and resolved, then the chapter step it settles (frozen with the case). */
function chooseByHash(story: Story, label: string): Story {
  return ThreadResolutionService.resolveCurrentThreads(chooseAndResolve(story, label));
}

const phaseOf = (story: Story) => {
  const phase = story.getCurrentPhase();
  if (!phase) throw new Error("The analysis step added no phase");
  return phase;
};

/** Where the stored replies for the played-forward cases come from (the eval's own records). */
export const STORED_SOURCES = {
  /** The production-default pair's chain on the Neonate template's first switch: Luna low's plan, then Luna medium's first beat */
  neonate: { caseId: "switch-tpl-22b80460-p1-t0", armKey: "pipeline:gpt-6-luna@low/prod>gpt-6-luna@medium/prod", promptState: "postfix", sample: 1 },
  /** Luna medium's first step of the one exploration chapter (Café de Paris, Camille's marathon dream) */
  exploration: { caseId: "cont-checkpoi-t1-o2", armKey: "gpt-6-luna@medium/prod", promptState: "postfix", sample: 1 },
  /** Luna low's first step of the three-player chapter (Red Dust Rhapsody, cooperative-competitive) */
  multiplayer: { caseId: "cont-tpl-965413e1-p3-t1", armKey: "gpt-6-luna@low/prod", promptState: "postfix", sample: 1 },
} as const;

export const NEONATE_CASES = { thread: "round-thread-neonate-feeding-t1", beat: "round-beat-neonate-feeding-t1" } as const;
export const EXPLORATION_CASE = "round-beat-exploration-checkpoi-t2";

const FEEDING = /\bfeed/i;
const FEEDING_CHAPTER = /\b(feed|predat|prey|hunt|blood)/i;

export type Built = { cases: EvalCase[]; problems: string[] };

/**
 * A step inside a Neonate feeding chapter (turn doc B2): the stored first
 * switch plan and first beat applied, the option that goes to feed chosen,
 * the chapter planned by production's default planner. Two cases: the
 * chapter plan (thread) and the chapter's first step with that plan fixed.
 */
export async function neonateFeedingCases(base: EvalCase, stored: { plan: RoundReply; beat: RoundReply }, call: RoundCall): Promise<Built> {
  const problems: string[] = [];
  const planned = storyAfterAnalysis(caseStory(base, false), "switch", stored.plan.parsed as SwitchAnalysis);
  const written = afterBeatReply(planned, stored.beat.parsed as SetOfBeatGenerationSchema);
  const options = written.getCurrentBeat("player1")?.options ?? [];
  const feeding = options.findIndex((o) => FEEDING.test(o.text));
  if (feeding < 0) return { cases: [], problems: [`${NEONATE_CASES.thread}: the stored first beat offers no feeding option`] };
  const chosen = chooseOption(written, "player1", feeding);
  const history = `The first switch plan (${stored.plan.outputFile}) and first beat (${stored.beat.outputFile}) are stored production-default replies; option ${feeding + 1}, "${options[feeding].text}", was chosen.`;
  const threadCase = roundCase({
    id: NEONATE_CASES.thread,
    role: "thread",
    state: chosen.getState(),
    category: "neonate-feeding",
    dark: base.tags.dark,
    note: `The chapter plan after the player picks feeding in the Neonate template, whose switch/thread instructions give feeding (predation) threads a recipe: 2 beats, choosing the prey, then closing the deal. Built from ${base.id}. ${history}`,
  });
  const reply = await call("thread", threadCase.id, threadStep.request(chosen), 1);
  if (!reply) return { cases: [threadCase], problems: [`${NEONATE_CASES.beat}: the chapter plan call produced nothing usable`] };
  const phase = phaseOf(storyAfterAnalysis(chosen, "thread", reply.parsed as ThreadAnalysis)) as ThreadAnalysis;
  const chapter = phase.threads.map((t) => `${t.title} ${t.typeOfThread}`).join(" ");
  if (!FEEDING_CHAPTER.test(chapter)) problems.push(`${NEONATE_CASES.beat}: the planned chapter reads as no feeding chapter ("${chapter}")`);
  const beatCase = roundCase({
    id: NEONATE_CASES.beat,
    role: "beat",
    state: chosen.getState(),
    fixedAnalysis: { kind: "thread", phase },
    category: "neonate-feeding",
    dark: base.tags.dark,
    note: `The first step of a Neonate feeding chapter, to see whether the turn follows the thread type's recipe (turn doc B2). ${history} The chapter plan (${reply.outputFile}) is production's default planner's, as the case ${threadCase.id} asked for it; it is ${phase.duration} steps long.`,
  });
  return { cases: [threadCase, beatCase], problems };
}

/**
 * A step inside an exploration chapter (turn doc section 4 item 4): the
 * chapter-opening case's stored first step applied, its option picked by
 * hash, the step resolved. Step 2 of the chapter, with no analysis before it.
 */
export function explorationStepCase(base: EvalCase, stored: RoundReply): Built {
  const played = chooseByHash(afterBeatReply(caseStory(base), stored.parsed as SetOfBeatGenerationSchema), EXPLORATION_CASE);
  const problems: string[] = [];
  if (played.getCurrentBeatType() !== "thread" || played.isCurrentThreadResolved() || played.getCurrentThreadType() !== "exploration") {
    problems.push(`${EXPLORATION_CASE}: the played state is not inside an exploration chapter`);
  }
  const step = played.getCurrentThreadBeatsCompleted() + 1;
  const evalCase = roundCase({
    id: EXPLORATION_CASE,
    role: "beat",
    state: played.getState(),
    category: "exploration-step",
    dark: base.tags.dark,
    note: `Step ${step} of ${played.getCurrentThreadDuration()} inside an exploration chapter (options resolve by their position, no roll), which no stored case had. Built from ${base.id}: its chapter plan and its stored first step (${stored.outputFile}, production's single-player turn model) applied, the option picked by hash and resolved.`,
  });
  return { cases: [evalCase], problems };
}

/**
 * A multiplayer switch and chapter after the first (turn doc section 4 item
 * 4): the three-player chapter-opening case's stored first step applied, its
 * remaining steps written by production's multiplayer turn model, then the
 * switch plan, the switch turn and the next chapter plan by production's
 * defaults. Four cases: the switch plan, the switch turn with that plan
 * fixed, the chapter plan and the chapter's first step with that plan fixed.
 */
export async function multiplayerAfterFirstCases(base: EvalCase, stored: RoundReply, call: RoundCall): Promise<Built> {
  const players = base.tags.players;
  const tag = base.id.replace(/^cont-tpl-/, "").replace(/-t\d+$/, "");
  const replies = [stored.outputFile];
  let story = chooseByHash(afterBeatReply(caseStory(base), stored.parsed as SetOfBeatGenerationSchema), `build-round-mp-${tag}-t${caseStory(base).getCurrentTurn()}`);
  for (let guard = 0; story.getCurrentBeatType() === "thread" && !story.isCurrentThreadResolved() && guard < 4; guard++) {
    const turn = story.getCurrentTurn();
    const buildId = `build-beat-round-mp-${tag}-t${turn}`;
    const reply = await call("beat", buildId, beatStep.request(story), players);
    if (!reply) return { cases: [], problems: [`${buildId}: the chapter step call produced nothing usable`] };
    replies.push(reply.outputFile);
    story = chooseByHash(afterBeatReply(story, reply.parsed as SetOfBeatGenerationSchema), buildId);
  }
  if (story.determineNextBeatType() !== "switch") {
    return { cases: [], problems: [`round-switch-mp-${tag}: the first chapter did not end in a switch`] };
  }
  const turn = story.getCurrentTurn();
  const common = { category: "multiplayer-after-first", dark: base.tags.dark };
  const history = `Built from ${base.id}: the first chapter played to its end from its stored first step and new steps (${replies.join(", ")}), each player's option picked by hash and resolved.`;
  const switchCase = roundCase({
    ...common,
    id: `round-switch-mp-${tag}-t${turn}`,
    role: "switch",
    state: story.getState(),
    note: `A multiplayer switch after the first chapter (the planner's later-switch branch), which no stored case had. ${history}`,
  });
  const plan = await call("switch", switchCase.id, switchStep.request(story), players);
  if (!plan) return { cases: [switchCase], problems: [`${switchCase.id}: the switch plan call produced nothing usable`] };
  const planned = storyAfterAnalysis(story, "switch", plan.parsed as SwitchAnalysis);
  const switchTurn = roundCase({
    ...common,
    id: `round-beat-mp-switchturn-${tag}-t${turn}`,
    role: "beat",
    state: story.getState(),
    fixedAnalysis: { kind: "switch", phase: phaseOf(planned) as SwitchAnalysis },
    note: `The multiplayer switch turn after the first chapter, with production's default switch plan (${plan.outputFile}) fixed. ${history}`,
  });
  const turnReply = await call("beat", switchTurn.id, beatStep.request(planned), players);
  if (!turnReply) return { cases: [switchCase, switchTurn], problems: [`${switchTurn.id}: the switch turn call produced nothing usable`] };
  const after = chooseByHash(afterBeatReply(planned, turnReply.parsed as SetOfBeatGenerationSchema), switchTurn.id);
  const later = `${history} The switch plan (${plan.outputFile}) and switch turn (${turnReply.outputFile}) are production's defaults' replies; each player's direction was picked by hash.`;
  const threadCase = roundCase({
    ...common,
    id: `round-thread-mp-${tag}-t${turn + 1}`,
    role: "thread",
    state: after.getState(),
    note: `A multiplayer chapter plan after the first chapter (independent, shared or mixed threads, no first-chapter rule), which no stored case had. ${later}`,
  });
  const chapter = await call("thread", threadCase.id, threadStep.request(after), players);
  if (!chapter) return { cases: [switchCase, switchTurn, threadCase], problems: [`round-beat-mp-${tag}-t${turn + 1}: the chapter plan call produced nothing usable`] };
  const chapterCase = roundCase({
    ...common,
    id: `round-beat-mp-${tag}-t${turn + 1}`,
    role: "beat",
    state: after.getState(),
    fixedAnalysis: { kind: "thread", phase: phaseOf(storyAfterAnalysis(after, "thread", chapter.parsed as ThreadAnalysis)) as ThreadAnalysis },
    note: `The first step of a multiplayer chapter after the first, with production's default chapter plan (${chapter.outputFile}) fixed. ${later}`,
  });
  return { cases: [switchCase, switchTurn, threadCase, chapterCase], problems: [] };
}

export type StoredLookup = (source: { caseId: string; armKey: string; promptState: string; sample: number }, step: number) => RoundReply | undefined;

export type RoundBuildDeps = {
  frozen: EvalCase[];
  stored: StoredLookup;
  call: RoundCall;
  log: (line: string) => void;
};

export type RoundBuildReport = { built: string[]; problems: string[] };

/** Every round case: the edited ones, then the played-forward ones (their new calls in this order). */
export async function buildRoundCases(deps: RoundBuildDeps): Promise<{ cases: EvalCase[]; report: RoundBuildReport }> {
  const byId = new Map(deps.frozen.map((c) => [c.id, c]));
  const edited = editedCases(deps.frozen);
  const cases = [...edited.cases];
  const problems = [...edited.skipped];
  const missing = (what: string) => problems.push(`${what}: the stored reply or its base case is missing`);

  const neonateBase = byId.get(STORED_SOURCES.neonate.caseId);
  const neonatePlan = deps.stored(STORED_SOURCES.neonate, 1);
  const neonateBeat = deps.stored(STORED_SOURCES.neonate, 2);
  if (neonateBase && neonatePlan && neonateBeat) {
    const built = await neonateFeedingCases(neonateBase, { plan: neonatePlan, beat: neonateBeat }, deps.call);
    cases.push(...built.cases);
    problems.push(...built.problems);
  } else missing(NEONATE_CASES.beat);

  const explorationBase = byId.get(STORED_SOURCES.exploration.caseId);
  const explorationStep = deps.stored(STORED_SOURCES.exploration, 1);
  if (explorationBase && explorationStep) {
    const built = explorationStepCase(explorationBase, explorationStep);
    cases.push(...built.cases);
    problems.push(...built.problems);
  } else missing(EXPLORATION_CASE);

  const multiplayerBase = byId.get(STORED_SOURCES.multiplayer.caseId);
  const multiplayerStep = deps.stored(STORED_SOURCES.multiplayer, 1);
  if (multiplayerBase && multiplayerStep) {
    const built = await multiplayerAfterFirstCases(multiplayerBase, multiplayerStep, deps.call);
    cases.push(...built.cases);
    problems.push(...built.problems);
  } else missing("round-*-mp");

  for (const problem of problems) deps.log(`  problem: ${problem}`);
  deps.log(`Built ${cases.length} round cases`);
  return { cases, report: { built: cases.map((c) => c.id), problems } };
}
