import fs from "fs";
import path from "path";
import { Story } from "core/models/Story.js";
import type {
  Beat,
  DifficultyLevel,
  StoryPhase,
  StoryState,
  StoryTemplate,
  SwitchAnalysis,
  ThreadAnalysis,
} from "core/types/index.js";
import type { TemplateIterationSections } from "core/types/admin.js";
import { DEFAULT_TURNS } from "core/config.js";
import { BeatResolutionService } from "../../game/services/BeatResolutionService.js";
import { ThreadResolutionService } from "../../game/services/ThreadResolutionService.js";
import type { EvalRole } from "./arms.js";
import { sha256 } from "./executor.js";
import type { IterationInput, SetupInput } from "./variants.js";

/*
 * Selects and assembles replay cases from local files (read-only, no API
 * calls): stored single-player continuations with the old model's output,
 * synthetic choices, endings, the 15-case subset and template-iteration
 * cases. Cases that need the baseline to play forward are built in
 * caseBuilder.ts. Never touches a database.
 */

export type CaseTags = {
  players: number;
  gameMode: string;
  beatType?: string;
  images: boolean;
  multiplayer: boolean;
  kids: boolean;
  dark: boolean;
  subset15: boolean;
  hasStoredOutput: boolean;
  firstBeat: boolean;
  ending: boolean;
  /** A switch or thread analysis runs before this beat */
  analysisTurn: boolean;
  source: "stored" | "synthetic" | "built" | "premise" | "template";
  category?: string;
};

export type FixedAnalysis =
  | { kind: "switch"; phase: SwitchAnalysis }
  | { kind: "thread"; phase: ThreadAnalysis };

export type EvalCase = {
  id: string;
  role: EvalRole;
  tags: CaseTags;
  /** beat, switch, thread: the input state, after thread resolution (frozen) and before analysis */
  state?: StoryState;
  /** Isolated beat cases: the analysis every arm gets */
  fixedAnalysis?: FixedAnalysis;
  setup?: SetupInput;
  iteration?: IterationInput;
  /** The stored output for the same input (the model in use during play) */
  storedOutput?: unknown;
  note?: string;
};

export type Snapshot = {
  /** Directory name (story id, or "checkpoint") */
  unit: string;
  file: string;
  /** For pregeneration_<k>_<slot>_<j>.json */
  choiceTurn?: number;
  option?: number;
  state: StoryState;
};

export type StoredUnit = { parent: Snapshot; child: Snapshot };

const PREGEN_FILE = /^pregeneration_(\d+)_player1_(\d+)\.json$/;

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** A stable pick in [0, n) for an id. */
export function hashIndex(id: string, n: number): number {
  return parseInt(sha256(id).slice(0, 8), 16) % n;
}

export function hashOrder<T>(items: T[], idOf: (item: T) => string): T[] {
  return [...items].sort((a, b) => sha256(idOf(a)).localeCompare(sha256(idOf(b))));
}

function turnOf(state: StoryState): number {
  return Story.create(state).getCurrentTurn();
}

function beatAt(state: StoryState, index: number): Beat | undefined {
  return Object.values(state.players)[0]?.beatHistory[index];
}

function snapshotsIn(dir: string, unit: string): Snapshot[] {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  const snapshots: Snapshot[] = [];
  for (const file of fs.readdirSync(dir).sort()) {
    const match = PREGEN_FILE.exec(file);
    if (file === "story.json" || match) {
      snapshots.push({
        unit,
        file,
        choiceTurn: match ? Number(match[1]) : undefined,
        option: match ? Number(match[2]) : undefined,
        state: readJson<StoryState>(path.join(dir, file)),
      });
    }
  }
  return snapshots;
}

/** story.json and pregeneration files of every stored story, plus the checkpoint story. */
export function loadStoredSnapshots(storiesDir: string, checkpointsDir?: string): Snapshot[] {
  const snapshots = fs
    .readdirSync(storiesDir)
    .sort()
    .flatMap((storyId) => snapshotsIn(path.join(storiesDir, storyId), storyId));
  return checkpointsDir ? [...snapshots, ...snapshotsIn(checkpointsDir, "checkpoint")] : snapshots;
}

/** A pregeneration with the next beat generated (not just the resolution). */
function isComplete(snapshot: Snapshot): boolean {
  return snapshot.choiceTurn !== undefined && turnOf(snapshot.state) === snapshot.choiceTurn + 1;
}

/**
 * Pairs each played state (an adopted pregeneration, or story.json) with the
 * complete pregenerations made from it. A pregeneration P(k,j) is adopted
 * when its latest beat is the beat at that index in story.json or in any
 * P(k+1,·). Returns the pairs and the complete but unadopted snapshots.
 */
export function pairParentsAndChildren(snapshots: Snapshot[]): {
  units: StoredUnit[];
  unadopted: Snapshot[];
} {
  const units: StoredUnit[] = [];
  const unadopted: Snapshot[] = [];
  const byUnit = new Map<string, Snapshot[]>();
  for (const s of snapshots) byUnit.set(s.unit, [...(byUnit.get(s.unit) ?? []), s]);

  for (const group of byUnit.values()) {
    const story = group.find((s) => s.file === "story.json");
    const complete = group.filter(isComplete);
    const isAdopted = (p: Snapshot) => {
      const index = p.choiceTurn ?? 0;
      const text = beatAt(p.state, index)?.text;
      const later = [story, ...complete.filter((c) => c.choiceTurn === index + 1)];
      return text !== undefined && later.some((s) => s && beatAt(s.state, index)?.text === text);
    };
    const parents = new Map<number, Snapshot>();
    for (const p of complete) {
      if (isAdopted(p)) parents.set(turnOf(p.state), parents.get(turnOf(p.state)) ?? p);
      else unadopted.push(p);
    }
    if (story && !parents.has(turnOf(story.state))) parents.set(turnOf(story.state), story);

    for (const child of complete) {
      const turn = child.choiceTurn ?? 0;
      const parent = parents.get(turn);
      if (parent && beatAt(parent.state, turn - 1)?.text === beatAt(child.state, turn - 1)?.text) {
        units.push({ parent, child });
      }
    }
  }
  return { units, unadopted };
}

function newPhase(parent: StoryState, child: StoryState): FixedAnalysis | undefined {
  if (child.storyPhases.length <= parent.storyPhases.length) return undefined;
  const phase: StoryPhase = child.storyPhases[child.storyPhases.length - 1];
  return "threads" in phase ? { kind: "thread", phase } : { kind: "switch", phase };
}

/**
 * The input the stored child was generated from: the parent with the child's
 * choice, resolution and roll on its current beat, and the child's copy of
 * the existing phases, which carries the thread resolution and milestones
 * exactly as they were decided during play (that step rolls dice, so it is
 * never re-run on a stored unit).
 */
export function resolvedInput(unit: StoredUnit): StoryState {
  const state = parentWithChildChoice(unit.parent.state, unit.child.state);
  state.storyPhases = clone(unit.child.state.storyPhases.slice(0, unit.parent.state.storyPhases.length));
  return state;
}

/** The parent with the child's choice, resolution and roll copied onto its current beat. */
export function parentWithChildChoice(parent: StoryState, child: StoryState): StoryState {
  const state = clone(parent);
  const index = turnOf(parent) - 1;
  for (const [slot, player] of Object.entries(state.players)) {
    const chosen = child.players[slot]?.beatHistory[index];
    const beat = player.beatHistory[index];
    if (chosen && beat) {
      player.beatHistory[index] = {
        ...beat,
        choice: chosen.choice,
        resolution: chosen.resolution,
        resolutionDetails: chosen.resolutionDetails,
      };
    }
  }
  return state;
}

function storedBeats(child: StoryState, index: number): Record<string, Beat> {
  return Object.fromEntries(
    Object.entries(child.players).map(([slot, p]) => [slot, p.beatHistory[index]])
  );
}

function baseTags(state: StoryState, source: CaseTags["source"]): CaseTags {
  const players = Object.keys(state.players).length;
  const turn = turnOf(state);
  return {
    players,
    gameMode: state.gameMode,
    images: state.generateImages,
    multiplayer: players > 1,
    kids: state.category === "read-with-kids",
    dark: false,
    subset15: false,
    hasStoredOutput: false,
    firstBeat: turn === 0,
    ending: false,
    analysisTurn: false,
    source,
  };
}

function difficultyOf(state: StoryState): DifficultyLevel {
  return state.difficultyLevel || { title: "Balanced", modifier: -10 };
}

/**
 * A continuation beat case. With a child: the stored unit's input, the
 * child's new analysis (if any) as the fixed analysis, the stored beat as
 * output. Without: a synthetic choice on an unplayed snapshot, picked by hash
 * and resolved now; the dice (choice and thread resolution) are frozen with
 * the case, so every arm sees the same input.
 */
export function continuationCase(parent: Snapshot, child?: Snapshot): EvalCase {
  const turn = turnOf(parent.state);
  if (child) {
    const fixedAnalysis = newPhase(parent.state, child.state);
    return {
      id: `cont-${parent.unit.slice(0, 8)}-t${turn}-o${child.option}`,
      role: "beat",
      state: resolvedInput({ parent, child }),
      fixedAnalysis,
      storedOutput: storedBeats(child.state, turn),
      tags: {
        ...baseTags(parent.state, "stored"),
        hasStoredOutput: true,
        analysisTurn: fixedAnalysis !== undefined,
      },
    };
  }
  const id = `synth-${parent.unit.slice(0, 8)}-t${turn}-${parent.file.replace(/\.json$/, "")}`;
  let story = Story.create(clone(parent.state));
  for (const slot of story.getPlayerSlots()) {
    const options = story.getCurrentBeat(slot)?.options.length ?? 3;
    const option = hashIndex(`${id}|${slot}`, options);
    story = BeatResolutionService.resolveChoice(
      story.updateChoice(slot, option),
      slot,
      option,
      difficultyOf(parent.state)
    );
  }
  const resolved = ThreadResolutionService.resolveCurrentThreads(story);
  const next = resolved.determineNextBeatType();
  return {
    id,
    role: "beat",
    state: resolved.getState(),
    tags: {
      ...baseTags(parent.state, "synthetic"),
      analysisTurn: next === "switch" || (next === "thread" && resolved.getCurrentThreadBeatsCompleted() === 0),
    },
    note: "Synthetic choice: the analysis for this turn is produced at build time",
  };
}

/** Images off: no generation, no image library, not template-based (so no template images). */
export function withImagesOff(evalCase: EvalCase): EvalCase {
  const state = clone(evalCase.state as StoryState);
  state.generateImages = false;
  state.images = [];
  delete state.templateId;
  return { ...evalCase, id: `${evalCase.id}-noimg`, state, tags: { ...evalCase.tags, images: false } };
}

/**
 * The story's last beat: maxTurns set to the current turn on a parent whose
 * thread resolves with this choice. Undefined when the beat would not be an
 * ending. (Production reaches the ending through getCurrentBeatType after
 * resolution; determineNextBeatType never returns "ending" at that point.)
 */
export function endingCase(unit: StoredUnit): EvalCase | undefined {
  const state = resolvedInput(unit);
  state.maxTurns = turnOf(state);
  if (Story.create(state).getCurrentBeatType() !== "ending") return undefined;
  return {
    id: `end-${unit.parent.unit.slice(0, 8)}-t${state.maxTurns}-o${unit.child.option}`,
    role: "beat",
    state,
    tags: { ...baseTags(state, "synthetic"), ending: true, beatType: "ending" },
  };
}

/** A stored analysis case: the parent with the child's choice; the output is the child's new phase. */
export function analysisCase(unit: StoredUnit): EvalCase | undefined {
  const analysis = newPhase(unit.parent.state, unit.child.state);
  if (!analysis) return undefined;
  const turn = turnOf(unit.parent.state);
  return {
    id: `${analysis.kind}-${unit.parent.unit.slice(0, 8)}-t${turn}-o${unit.child.option}`,
    role: analysis.kind,
    state: resolvedInput(unit),
    storedOutput: analysis.phase,
    tags: { ...baseTags(unit.parent.state, "stored"), hasStoredOutput: true },
  };
}

/**
 * The input a beat or analysis call sees. The frozen state is already past
 * thread resolution (which rolls dice and is not idempotent, so it never runs
 * here); for beats the fixed analysis is applied as production would.
 */
export function caseStory(evalCase: EvalCase, withFixedAnalysis = true): Story {
  if (!evalCase.state) {
    throw new Error(`Case ${evalCase.id} has no story state`);
  }
  const story = Story.create(clone(evalCase.state));
  const fixed = withFixedAnalysis ? evalCase.fixedAnalysis : undefined;
  if (!fixed) return story;
  return fixed.kind === "thread"
    ? story.updatePlayerPreviousThreadTypes(fixed.phase.threads).addPhase(fixed.phase)
    : story.addPhase(fixed.phase);
}

export const SUBSET_STRATA = { spContinuation: 9, firstBeat: 2, multiplayer: 3, ending: 1 } as const;

/** 9 single-player continuations, 2 first beats, 3 multiplayer, 1 ending; hash-ordered. */
export function selectSubset15(cases: EvalCase[]): Set<string> {
  const beats = cases.filter((c) => c.role === "beat");
  const stratum = (c: EvalCase): keyof typeof SUBSET_STRATA => {
    if (c.tags.ending) return "ending";
    if (c.tags.multiplayer) return "multiplayer";
    if (c.tags.firstBeat) return "firstBeat";
    return "spContinuation";
  };
  const chosen = new Set<string>();
  for (const [name, count] of Object.entries(SUBSET_STRATA)) {
    hashOrder(beats.filter((c) => stratum(c) === name), (c) => c.id)
      .slice(0, count)
      .forEach((c) => chosen.add(c.id));
  }
  // A short stratum is filled from the single-player continuations
  const total = Object.values(SUBSET_STRATA).reduce((a, b) => a + b, 0);
  for (const c of hashOrder(beats, (c) => c.id)) {
    if (chosen.size >= total) break;
    if (stratum(c) === "spContinuation") chosen.add(c.id);
  }
  return chosen;
}

const ITERATION_REQUESTS: { feedback: string; sections: TemplateIterationSections[] }[] = [
  { feedback: "Make the world feel stranger and give the conflicts higher stakes.", sections: ["guidelines"] },
  { feedback: "Rebalance the stats so that resources matter more in challenges.", sections: ["stats"] },
  { feedback: "Give the characters more distinct backgrounds and motivations.", sections: ["players"] },
  { feedback: "Add two memorable side characters and a location that hides a secret.", sections: ["storyElements"] },
  { feedback: "Shift the look toward watercolor with warmer colors.", sections: ["media"] },
];

/** The template fields an iteration case reads (the rest is serialised as is). */
export type IterationSource = Pick<
  StoryTemplate,
  "id" | "playerCountMin" | "gameMode" | "maxTurnsMin" | "containsImages" | "tags" | "creatorId" | "creatorUsername"
>;

/** Template-iteration cases (5): a template without its creator fields, feedback and sections. */
export function iterationCases(templates: IterationSource[]): EvalCase[] {
  return hashOrder(templates, (t) => t.id)
    .slice(0, ITERATION_REQUESTS.length)
    .map((full, index) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { creatorId, creatorUsername, ...template } = full;
      const request = ITERATION_REQUESTS[index];
      return {
        id: `iter-${full.id.slice(0, 8)}-${request.sections.join("-")}`,
        role: "iteration" as const,
        iteration: {
          template,
          feedback: request.feedback,
          sections: request.sections,
          playerCount: full.playerCountMin,
          gameMode: full.gameMode,
          maxTurns: full.maxTurnsMin || DEFAULT_TURNS,
        },
        tags: {
          players: full.playerCountMin,
          gameMode: full.gameMode,
          images: full.containsImages,
          multiplayer: full.playerCountMin > 1,
          kids: full.tags.includes("read-with-kids"),
          dark: false,
          subset15: false,
          hasStoredOutput: false,
          firstBeat: false,
          ending: false,
          analysisTurn: false,
          source: "template" as const,
        },
      };
    });
}
