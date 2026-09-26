import type { StoryState } from "core/types/index.js";
import type { EvalCase } from "./cases.js";
import { sha256 } from "./executor.js";
import {
  setupCard,
  turnContent,
  turnContext,
  type ContextSection,
  type OptionContent,
} from "./ratingContent.js";
import { usable, type CallRecord } from "./runner.js";

/*
 * Which items and options go on a blind rating page, their labels, and the
 * answer key: stratified items where every arm produced a usable sample-1
 * output, a salt-driven option order with the baseline's position balanced
 * across the set, one repeated item and one baseline-against-baseline item.
 * Item ids are neutral; the key lives in its own file.
 */

export type RatingKind = "setup" | "turn";

export type ArmRef = { promptState: string; armKey: string };

export type RatingSpec = {
  kind: RatingKind;
  /** The first arm is the baseline */
  arms: ArmRef[];
  items: number;
  preview: boolean;
  /**
   * Candidates shown beside the baseline on each item, rotated so every
   * candidate appears about equally often; every candidate when unset.
   */
  perItem?: number;
};

export type RatingOption = { label: string; content: OptionContent };

export type RatingItem = {
  id: string;
  /** Setup items: the premise the options were written from */
  premise?: string;
  context: ContextSection[];
  options: RatingOption[];
};

export type RatingSet = {
  setId: string;
  pageId: string;
  kind: RatingKind;
  title: string;
  instructions: string[];
  fieldLabels: string[];
  items: RatingItem[];
  preview: boolean;
};

export type LabelRef = ArmRef & { sample: number; caseId: string };

export type KeyItem = {
  caseId: string;
  labels: Record<string, LabelRef>;
  repeatOf?: string;
  control?: "baseline-vs-baseline";
};

export type RatingKey = {
  setId: string;
  pageId: string;
  salt: string;
  keyFile: string;
  createdAt: string;
  /** The arm every other arm is compared with */
  baseline: ArmRef;
  items: Record<string, KeyItem>;
  /** Label -> how often the first arm (baseline) sits there, over the regular items */
  labelDistribution: Record<string, number>;
  notes: string[];
};

export const LABELS = ["A", "B", "C", "D"];
export const FIELD_LABELS = ["Acceptable?", "Yes", "No", "Rank", "Note (optional)", "Previous", "Next", "Export ratings"];
export const REPEAT_MIN_DISTANCE = 3;

const TITLES: Record<RatingKind, string> = {
  setup: "ChosenPath story setups: blind rating",
  turn: "ChosenPath turns: blind rating",
};

const INSTRUCTIONS: Record<RatingKind, string[]> = {
  setup: [
    "Each item shows one premise and several story setups written from it, in random order.",
    "Acceptable? is the minimum bar: coherent and true to the premise, sensible stats, and distinct playable characters.",
    "Rank the options from best (1) to worst. Ties are allowed.",
    "A note is optional. Your answers save in this browser as you go; export them when you are done.",
  ],
  turn: [
    "Each item shows what happened just before, then several versions of the next turn, in random order.",
    "Acceptable? is the minimum bar: no continuity error (a wrong name, fact, stat, or outcome of the choice), it shows the chosen action and its result in second person, the three options are meaningfully different, and there is no commentary about the game itself.",
    "Rank the options from best (1) to worst. Ties are allowed.",
    "A note is optional. Your answers save in this browser as you go; export them when you are done.",
  ],
};

/** An item before labels become final: the case and its options in page order. */
type Draft = { caseId: string; refs: LabelRef[]; repeat?: boolean; control?: "baseline-vs-baseline" };

const byHash = (seed: string) => (a: string, b: string) =>
  sha256(`${seed}|${a}`).localeCompare(sha256(`${seed}|${b}`));

function groupOf(kind: RatingKind): "setup" | "beat" {
  return kind === "setup" ? "setup" : "beat";
}

function findOutput(records: CallRecord[], kind: RatingKind, ref: LabelRef): CallRecord | undefined {
  return records.find(
    (r) =>
      r.caseId === ref.caseId &&
      r.armKey === ref.armKey &&
      r.promptState === ref.promptState &&
      r.sample === ref.sample &&
      r.group === groupOf(kind) &&
      r.jobFinal &&
      usable(r)
  );
}

function stratum(evalCase: EvalCase): string {
  const t = evalCase.tags;
  if (evalCase.role === "setup") return `${t.players}|${t.gameMode}|${t.kids ? "kids" : t.dark ? "dark" : "plain"}`;
  if (t.ending) return "ending";
  if (t.firstBeat) return "first";
  if (t.multiplayer) return `mp${t.players}`;
  return t.analysisTurn ? "analysis" : "plain";
}

/** Cases where every arm has a usable sample-1 output. */
function qualifying(spec: RatingSpec, records: CallRecord[], cases: EvalCase[]): EvalCase[] {
  return cases.filter(
    (c) =>
      c.role === groupOf(spec.kind) &&
      spec.arms.every((arm) => findOutput(records, spec.kind, { ...arm, sample: 1, caseId: c.id }))
  );
}

/** Round-robin over strata, each in salted hash order. */
export function stratifiedPick(candidates: EvalCase[], count: number, salt: string): EvalCase[] {
  const strata = new Map<string, EvalCase[]>();
  for (const c of candidates) strata.set(stratum(c), [...(strata.get(stratum(c)) ?? []), c]);
  const order = byHash(salt);
  const queues = [...strata.keys()]
    .sort(order)
    .map((key) => [...(strata.get(key) ?? [])].sort((a, b) => order(a.id, b.id)));
  const picked: EvalCase[] = [];
  while (picked.length < count && queues.some((q) => q.length > 0)) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next && picked.length < count) picked.push(next);
    }
  }
  return picked;
}

/** The baseline at `baselinePosition`, the other arms in salted hash order. */
function orderRefs(baseline: LabelRef, others: LabelRef[], seed: string, baselinePosition: number): LabelRef[] {
  const ordered = [...others].sort((a, b) => byHash(seed)(a.armKey, b.armKey));
  ordered.splice(Math.min(baselinePosition, ordered.length), 0, baseline);
  return ordered;
}

function combinations(n: number, k: number): number[][] {
  if (k === 0) return [[]];
  const result: number[][] = [];
  for (let first = 0; first <= n - k; first++) {
    for (const rest of combinations(n - first - 1, k - 1)) result.push([first, ...rest.map((i) => i + first + 1)]);
  }
  return result;
}

/**
 * Which candidates each item shows: every k-subset once per cycle, each
 * pick the one whose members have appeared least, so a partial cycle stays
 * within about one appearance of even.
 */
export function candidateRotation(candidates: number, perItem: number, items: number): number[][] {
  const subsets = combinations(candidates, perItem);
  const counts = new Array<number>(candidates).fill(0);
  const load = (subset: number[]) => subset.reduce((sum, i) => sum + counts[i], 0);
  const rotation: number[][] = [];
  let unused: number[][] = [];
  while (rotation.length < items) {
    if (unused.length === 0) unused = [...subsets];
    const next = unused.reduce((best, subset) => (load(subset) < load(best) ? subset : best));
    unused = unused.filter((subset) => subset !== next);
    for (const i of next) counts[i]++;
    rotation.push(next);
  }
  return rotation;
}

function refsFor(arms: ArmRef[], caseId: string, sample = 1): { baseline: LabelRef; others: LabelRef[] } {
  const [baseline, ...others] = arms.map((arm) => ({ ...arm, sample, caseId }));
  return { baseline, others };
}

/**
 * The picked items. The baseline's position cycles through the labels, so it
 * is balanced; with rotating candidates it is also offset once per rotation
 * cycle, so each candidate subset meets the baseline at different labels.
 */
function itemDrafts(spec: RatingSpec, picked: EvalCase[], salt: string): Draft[] {
  const [baseline, ...candidates] = spec.arms;
  const perItem = spec.perItem !== undefined && spec.perItem < candidates.length ? spec.perItem : candidates.length;
  const rotation = candidateRotation(candidates.length, perItem, picked.length);
  const cycle = combinations(candidates.length, perItem).length;
  const shown = perItem + 1;
  return [...picked]
    .sort((a, b) => byHash(`${salt}|order`)(a.id, b.id))
    .map((c, index) => {
      const arms = [baseline, ...rotation[index].map((i) => candidates[i])];
      const { baseline: base, others } = refsFor(arms, c.id);
      const position = cycle > 1 ? (index + Math.floor(index / cycle)) % shown : index % shown;
      return { caseId: c.id, refs: orderRefs(base, others, `${salt}|${c.id}`, position) };
    });
}

/** Adds the repeated item and the baseline-against-baseline item, or notes why not. */
function withControls(
  spec: RatingSpec,
  drafts: Draft[],
  records: CallRecord[],
  cases: EvalCase[],
  salt: string,
  notes: string[]
): Draft[] {
  const result = [...drafts];
  if (spec.preview || spec.arms.length < 2) {
    notes.push("No control items (preview or a single arm).");
    return result;
  }
  if (result.length >= REPEAT_MIN_DISTANCE) {
    // The same arms the first item showed, in a fresh order
    const first = result[0];
    const isBaseline = (ref: LabelRef) => ref.armKey === spec.arms[0].armKey && ref.promptState === spec.arms[0].promptState;
    const baseline = first.refs.find(isBaseline) as LabelRef;
    const others = first.refs.filter((ref) => !isBaseline(ref));
    const position = parseInt(sha256(`${salt}|repeat`).slice(0, 8), 16) % first.refs.length;
    result.push({ caseId: first.caseId, refs: orderRefs(baseline, others, `${salt}|repeat`, position), repeat: true });
  } else {
    notes.push(`No repeated item: fewer than ${REPEAT_MIN_DISTANCE} items.`);
  }
  const used = new Set(drafts.map((d) => d.caseId));
  const baseline = spec.arms[0];
  const control = cases
    .filter((c) => c.role === groupOf(spec.kind) && !used.has(c.id))
    .sort((a, b) => byHash(`${salt}|control`)(a.id, b.id))
    .find((c) =>
      [1, 2].every((sample) => findOutput(records, spec.kind, { ...baseline, sample, caseId: c.id }))
    );
  if (control) {
    const refs = [1, 2].map((sample) => ({ ...baseline, sample, caseId: control.id }));
    const flip = parseInt(sha256(`${salt}|control-order`).slice(0, 2), 16) % 2 === 1;
    result.splice(Math.floor(result.length / 2), 0, {
      caseId: control.id,
      refs: flip ? refs.reverse() : refs,
      control: "baseline-vs-baseline",
    });
  } else {
    notes.push("No baseline-against-baseline item: no other case has two usable baseline samples.");
  }
  return result;
}

export type PlanDeps = {
  loadOutput: (record: CallRecord) => unknown;
  salt: string;
  now: Date;
};

export function planRatingSet(
  spec: RatingSpec,
  records: CallRecord[],
  cases: EvalCase[],
  deps: PlanDeps
): { set: RatingSet; key: RatingKey } {
  const notes: string[] = [];
  const picked = stratifiedPick(qualifying(spec, records, cases), spec.items, deps.salt);
  if (picked.length < spec.items) {
    notes.push(`Only ${picked.length} of ${spec.items} requested items qualified.`);
  }
  const drafts = withControls(spec, itemDrafts(spec, picked, deps.salt), records, cases, deps.salt, notes);

  const caseById = new Map(cases.map((c) => [c.id, c]));
  const itemId = (index: number) => `${spec.kind}-${String(index + 1).padStart(2, "0")}`;
  const firstItemId = itemId(drafts.findIndex((d) => !d.repeat && !d.control));
  const baseline = spec.arms[0];
  const labelDistribution: Record<string, number> = {};
  const keyItems: Record<string, KeyItem> = {};

  const items = drafts.map((draft, index): RatingItem => {
    const evalCase = caseById.get(draft.caseId);
    if (!evalCase) throw new Error(`Unknown case ${draft.caseId}`);
    const id = itemId(index);
    keyItems[id] = {
      caseId: draft.caseId,
      labels: Object.fromEntries(draft.refs.map((ref, position) => [LABELS[position], ref])),
      repeatOf: draft.repeat ? firstItemId : undefined,
      control: draft.control,
    };
    const baselineAt = draft.refs.findIndex((r) => r.armKey === baseline.armKey && r.promptState === baseline.promptState);
    if (!draft.control && !draft.repeat && baselineAt >= 0) {
      labelDistribution[LABELS[baselineAt]] = (labelDistribution[LABELS[baselineAt]] ?? 0) + 1;
    }
    return {
      id,
      premise: evalCase.setup?.premise,
      context: spec.kind === "turn" && evalCase.state ? turnContext(evalCase.state) : [],
      options: draft.refs.map((ref, position) => ({
        label: LABELS[position],
        content: optionContent(spec.kind, deps.loadOutput(findOutput(records, spec.kind, ref) as CallRecord), evalCase.state),
      })),
    };
  });

  const setId = `text-${spec.kind}`;
  const pageId = sha256(`${deps.salt}|page`).slice(0, 10);
  return {
    set: { setId, pageId, kind: spec.kind, title: TITLES[spec.kind], instructions: INSTRUCTIONS[spec.kind], fieldLabels: FIELD_LABELS, items, preview: spec.preview },
    key: {
      setId,
      pageId,
      salt: deps.salt,
      keyFile: `${setId}-${pageId}.json`,
      createdAt: deps.now.toISOString(),
      baseline: { promptState: baseline.promptState, armKey: baseline.armKey },
      items: keyItems,
      labelDistribution,
      notes,
    },
  };
}

function optionContent(kind: RatingKind, output: unknown, state: StoryState | undefined): OptionContent {
  if (kind === "setup") return setupCard(output);
  if (!state) throw new Error("A turn option needs the case's story state");
  return turnContent(output, state);
}
