import type { StoryState } from "core/types/index.js";
import type { EvalCase } from "./cases.js";
import { sha256 } from "./executor.js";
import { SETUP_FIELD_LABELS, TURN_FIELD_LABELS, setupCard, turnContent, type OptionContent } from "./ratingContent.js";
import { CONTEXT_LABELS, chapterPlanLines, turnContext, type ContextSection } from "./ratingContext.js";
import { usable, type CallRecord } from "./runner.js";

/*
 * Which items and options go on a blind rating page, their labels, and the
 * answer key: stratified items where every arm produced a usable sample-1
 * output, a salt-driven option order with the baseline's position balanced
 * across the set, one repeated item (unless switched off) and one
 * baseline-against-baseline item. Item ids are neutral; the key lives in its
 * own file.
 *
 * A pairwise page (the rounds after 2026-09-27) shows exactly two options per
 * item, the reference (the first arm) against the candidate, in balanced
 * random order. The rater marks Acceptable? on both and picks the better one
 * or neither ("About the same"), by the owner's criteria in the
 * instructions; its repeat shows the pair with the labels swapped.
 */

export type RatingKind = "setup" | "turn";

/** A ranked page ranks every option; a pairwise page asks which of two is better. */
export type RatingMode = "ranked" | "pairwise";

export type ArmRef = { promptState: string; armKey: string };

export type RatingSpec = {
  kind: RatingKind;
  /** The first arm is the baseline (on a pairwise page, the reference) */
  arms: ArmRef[];
  items: number;
  preview: boolean;
  /**
   * Candidates shown beside the baseline on each item, rotated so every
   * candidate appears about equally often; every candidate when unset.
   */
  perItem?: number;
  /** Regular items come only from these cases (the control item may use any other) */
  caseIds?: string[];
  /** Two arms, two options per item, Which is better? instead of ranks */
  pairwise?: boolean;
  /** The repeated item; on unless false (--no-repeat) */
  repeat?: boolean;
  /**
   * A pairwise turn page's chapter openings: two chain arms (the reference
   * first), each item a chapter plan's case, each option the chain's first
   * turn with its own plan shown in its column
   */
  chainArms?: ArmRef[];
  chainItems?: number;
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
  /** Absent on a ranked page */
  mode?: "pairwise";
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
  /** A chain item's reference (a chapter plan, then its first turn): its own reference chain, not the page's baseline */
  reference?: ArmRef;
};

export type RatingKey = {
  setId: string;
  pageId: string;
  /** Absent on a ranked page (every key before 2026-09-27) */
  mode?: "pairwise";
  salt: string;
  keyFile: string;
  createdAt: string;
  /** The arm every other arm is compared with (on a pairwise page, the reference) */
  baseline: ArmRef;
  items: Record<string, KeyItem>;
  /** Label -> how often the first arm (baseline) sits there, over the regular items */
  labelDistribution: Record<string, number>;
  notes: string[];
};

export const LABELS = ["A", "B", "C", "D"];
export const FIELD_LABELS = ["Option", "Premise", "Acceptable?", "Yes", "No", "Rank", "Note (optional)", "Previous", "Next", "Export ratings"];
/** A pairwise page's own fixed text: its question and the answer that picks neither */
export const PAIRWISE_LABELS = { question: "Which is better?", same: "About the same" };
export const REPEAT_MIN_DISTANCE = 3;

const TITLES: Record<RatingKind, string> = {
  setup: "ChosenPath story setups: blind rating",
  turn: "ChosenPath turns: blind rating",
};

const INSTRUCTIONS: Record<RatingKind, string[]> = {
  setup: [
    "Each item shows one premise and several story setups written from it, in random order.",
    "Each setup shows its whole design, as the game uses it, in its own column. Every section starts at the same height in each column.",
    "Click a section heading to open or fold that section in every column at once. Some sections start folded; single stats, story elements, outcomes, identities and backgrounds open one by one.",
    "Acceptable? is the minimum bar: coherent and true to the premise, sensible stats, and distinct playable characters.",
    "Rank the options from best (1) to worst. Ties are allowed.",
    "A note is optional. Your answers save in this browser as you go; export them when you are done.",
  ],
  turn: [
    "Each item first shows the background: the chapter this turn belongs to, with its plan and the outcome it advances, every outcome, and what happened just before (the story so far and the story's world start folded). Then come several versions of the next turn, in random order, one column each.",
    "Click a heading to fold that part in every column at once.",
    "Acceptable? is the minimum bar: no continuity error (a wrong name, fact, stat, or outcome of the choice), it shows the chosen action and its result in second person, the three options are meaningfully different, and there is no commentary about the game itself.",
    "Rank the options from best (1) to worst. Ties are allowed.",
    "A note is optional. Your answers save in this browser as you go; export them when you are done.",
  ],
};

/**
 * The owner's criteria for the round pages (2026-09-27), printed in a
 * pairwise page's instructions: setup doc section 4 "Rating format", turn doc
 * section 4 rounds 1 and 2.
 */
export const PAIRWISE_CRITERIA: Record<RatingKind, string[]> = {
  setup: [
    "stats that matter in play and keep score sensibly",
    "a real arc for each player",
    "shared outcomes only where they fit",
    "thread types and switch rules that steer",
  ],
  turn: [
    "Does this turn move the chapter's question and follow its plan?",
    "Does the chapter pursue the direction the player picked?",
    "Is there a real choice among the options?",
    "Does the prose sound like this story?",
  ],
};

const PAIRWISE_INSTRUCTIONS: Record<RatingKind, string[]> = {
  setup: [
    "Each item shows one premise and two story setups written from it, in random order, side by side.",
    INSTRUCTIONS.setup[1],
    "Click a section heading to open or fold that section in both columns at once. Some sections start folded; single stats, story elements, outcomes, identities and backgrounds open one by one.",
    "Acceptable? is the minimum bar, for each of the two: coherent and true to the premise, sensible stats, and distinct playable characters.",
    `Which is better? Pick A or B, or ${PAIRWISE_LABELS.same} when neither is clearly better. Judge by: ${PAIRWISE_CRITERIA.setup.join("; ")}.`,
    INSTRUCTIONS.setup[5],
  ],
  turn: [
    "Each item first shows the background: the chapter this turn belongs to, with its plan and the outcome it advances, every outcome, and what happened just before (the story so far and the story's world start folded). Then come two versions of the next turn, in random order, one column each.",
    "Click a heading to fold that part in both columns at once.",
    "Acceptable? is the minimum bar, for each of the two: no continuity error (a wrong name, fact, stat, or outcome of the choice), it shows the chosen action and its result in second person, the three options are meaningfully different, and there is no commentary about the game itself.",
    `Which is better? Pick A or B, or ${PAIRWISE_LABELS.same} when neither is clearly better. Judge by: ${PAIRWISE_CRITERIA.turn.join(" ")}`,
    INSTRUCTIONS.turn[4],
  ],
};

export function pairwiseInstructions(kind: RatingKind): string[] {
  return PAIRWISE_INSTRUCTIONS[kind];
}

/** An item before labels become final: the case and its options in page order; a chain item carries its reference. */
type Draft = { caseId: string; refs: LabelRef[]; repeat?: boolean; control?: "baseline-vs-baseline"; reference?: ArmRef };

const byHash = (seed: string) => (a: string, b: string) =>
  sha256(`${seed}|${a}`).localeCompare(sha256(`${seed}|${b}`));

function groupOf(kind: RatingKind): "setup" | "beat" {
  return kind === "setup" ? "setup" : "beat";
}

const isChainKey = (armKey: string) => armKey.startsWith("pipeline:");

/** A ref's output: the setup or beat record, or a chain's second step (the turn after its plan). */
function findOutput(records: CallRecord[], kind: RatingKind, ref: LabelRef): CallRecord | undefined {
  const chain = isChainKey(ref.armKey);
  return records.find(
    (r) =>
      r.caseId === ref.caseId &&
      r.armKey === ref.armKey &&
      r.promptState === ref.promptState &&
      r.sample === ref.sample &&
      (chain ? r.group === "pipeline" && r.step === 2 : r.group === groupOf(kind)) &&
      r.jobFinal &&
      usable(r)
  );
}

/** A chain's plan: its first step's usable final record, beside the turn record. */
function chainPlanOf(records: CallRecord[], turn: CallRecord): CallRecord | undefined {
  return records.find((r) => r.jobKey === turn.jobKey && r.step === 1 && r.final && usable(r));
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
      (!spec.caseIds || spec.caseIds.includes(c.id)) &&
      spec.arms.every((arm) => findOutput(records, spec.kind, { ...arm, sample: 1, caseId: c.id }))
  );
}

/** A chapter plan's cases where both chain arms have a usable sample-1 turn after their plan. */
function qualifyingChains(spec: RatingSpec, records: CallRecord[], cases: EvalCase[]): EvalCase[] {
  const arms = spec.chainArms ?? [];
  return cases.filter((c) => c.role === "thread" && arms.every((arm) => findOutput(records, spec.kind, { ...arm, sample: 1, caseId: c.id })));
}

/** The chain items: the reference chain and the candidate chain per case, the reference at A on every other item. */
function chainDrafts(spec: RatingSpec, records: CallRecord[], cases: EvalCase[], salt: string, notes: string[]): Draft[] {
  const [reference, candidate] = spec.chainArms ?? [];
  if (!reference || !candidate || !spec.chainItems) return [];
  const picked = stratifiedPick(qualifyingChains(spec, records, cases), spec.chainItems, `${salt}|chain`);
  if (picked.length < spec.chainItems) notes.push(`Only ${picked.length} of ${spec.chainItems} requested chapter-opening items qualified.`);
  return [...picked]
    .sort((a, b) => byHash(`${salt}|chain-assign`)(a.id, b.id))
    .map((c, index) => {
      const refs = [reference, candidate].map((arm) => ({ ...arm, sample: 1, caseId: c.id }));
      return { caseId: c.id, refs: index % 2 === 0 ? refs : [refs[1], refs[0]], reference };
    });
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
 * The picked items. Arms and the baseline's label are assigned in stratum
 * order, so a rotation cycle spreads each candidate over the strata; the
 * page then shows the items in salted order. The baseline's position cycles
 * through the labels, so it is balanced; with rotating candidates it is also
 * offset once per rotation cycle, so each candidate subset meets the baseline
 * at different labels.
 */
function itemDrafts(spec: RatingSpec, picked: EvalCase[], salt: string): Draft[] {
  const [baseline, ...candidates] = spec.arms;
  const perItem = spec.perItem !== undefined && spec.perItem < candidates.length ? spec.perItem : candidates.length;
  const rotation = candidateRotation(candidates.length, perItem, picked.length);
  const cycle = combinations(candidates.length, perItem).length;
  const shown = perItem + 1;
  const pageOrder = byHash(`${salt}|order`);
  return [...picked]
    .sort((a, b) => stratum(a).localeCompare(stratum(b)) || byHash(`${salt}|assign`)(a.id, b.id))
    .map((c, index): Draft => {
      const arms = [baseline, ...rotation[index].map((i) => candidates[i])];
      const { baseline: base, others } = refsFor(arms, c.id);
      const position = cycle > 1 ? (index + Math.floor(index / cycle)) % shown : index % shown;
      return { caseId: c.id, refs: orderRefs(base, others, `${salt}|${c.id}`, position) };
    })
    .sort((a, b) => pageOrder(a.caseId, b.caseId));
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
  if (spec.repeat === false) {
    notes.push("No repeated item: switched off.");
  } else if (result.length >= REPEAT_MIN_DISTANCE && result.some((d) => !d.reference)) {
    // The same arms the first item showed, in a fresh order; a pair with its labels swapped (a regular item, not a chain's)
    const first = result.find((d) => !d.reference) as Draft;
    const isBaseline = (ref: LabelRef) => ref.armKey === spec.arms[0].armKey && ref.promptState === spec.arms[0].promptState;
    const baseline = first.refs.find(isBaseline) as LabelRef;
    const others = first.refs.filter((ref) => !isBaseline(ref));
    const position = spec.pairwise
      ? 1 - first.refs.indexOf(baseline)
      : parseInt(sha256(`${salt}|repeat`).slice(0, 8), 16) % first.refs.length;
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
  if (spec.pairwise && spec.arms.length !== 2) {
    throw new Error(`A pairwise page compares exactly two arms: the reference and the candidate (got ${spec.arms.length}).`);
  }
  if (spec.chainArms && (!spec.pairwise || spec.kind !== "turn" || spec.chainArms.length !== 2)) {
    throw new Error("Chapter-opening items (chain arms) go on a pairwise turn page, as exactly two chains: the reference and the candidate.");
  }
  const notes: string[] = [];
  const picked = stratifiedPick(qualifying(spec, records, cases), spec.items, deps.salt);
  if (picked.length < spec.items) {
    notes.push(`Only ${picked.length} of ${spec.items} requested items qualified.`);
  }
  // Chain items join the regular ones in the same salted page order (the regular items keep theirs among themselves)
  const pageOrder = byHash(`${deps.salt}|order`);
  const orderKey = (d: Draft) => (d.reference ? `${d.caseId}|chain` : d.caseId);
  const isolated = itemDrafts(spec, picked, deps.salt);
  const chains = chainDrafts(spec, records, cases, deps.salt, notes);
  const regular = chains.length ? [...isolated, ...chains].sort((a, b) => pageOrder(orderKey(a), orderKey(b))) : isolated;
  const drafts = withControls(spec, regular, records, cases, deps.salt, notes);

  const caseById = new Map(cases.map((c) => [c.id, c]));
  const itemId = (index: number) => `${spec.kind}-${String(index + 1).padStart(2, "0")}`;
  const firstItemId = itemId(drafts.findIndex((d) => !d.repeat && !d.control && !d.reference));
  const baseline = spec.arms[0];
  const labelDistribution: Record<string, number> = {};
  const keyItems: Record<string, KeyItem> = {};

  const items = drafts.map((draft, index): RatingItem => {
    const id = itemId(index);
    keyItems[id] = {
      caseId: draft.caseId,
      labels: Object.fromEntries(draft.refs.map((ref, position) => [LABELS[position], ref])),
      repeatOf: draft.repeat ? firstItemId : undefined,
      control: draft.control,
      ...(draft.reference ? { reference: draft.reference } : {}),
    };
    const reference = draft.reference ?? baseline;
    const baselineAt = draft.refs.findIndex((r) => r.armKey === reference.armKey && r.promptState === reference.promptState);
    if (!draft.control && !draft.repeat && baselineAt >= 0) {
      labelDistribution[LABELS[baselineAt]] = (labelDistribution[LABELS[baselineAt]] ?? 0) + 1;
    }
    return buildItem(spec.kind, id, keyItems[id], caseById, records, deps.loadOutput);
  });

  const setId = `text-${spec.kind}`;
  const pageId = sha256(`${deps.salt}|page`).slice(0, 10);
  const mode: RatingMode = spec.pairwise ? "pairwise" : "ranked";
  return {
    set: pageSet(spec.kind, mode, setId, pageId, items, spec.preview),
    key: {
      setId,
      pageId,
      ...(mode === "pairwise" ? { mode } : {}),
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

/** The page's fixed text, which the blinding word check reads: its own labels, each option card's and a turn's context. */
export function pageFieldLabels(kind: RatingKind, mode: RatingMode = "ranked"): string[] {
  const own = kind === "setup" ? Object.values(SETUP_FIELD_LABELS) : [...Object.values(TURN_FIELD_LABELS), ...Object.values(CONTEXT_LABELS)];
  return [...FIELD_LABELS, ...(mode === "pairwise" ? Object.values(PAIRWISE_LABELS) : []), ...own];
}

function pageSet(kind: RatingKind, mode: RatingMode, setId: string, pageId: string, items: RatingItem[], preview: boolean): RatingSet {
  const pairwise = mode === "pairwise";
  return {
    setId,
    pageId,
    kind,
    ...(pairwise ? { mode } : {}),
    title: TITLES[kind],
    instructions: pairwise ? PAIRWISE_INSTRUCTIONS[kind] : INSTRUCTIONS[kind],
    fieldLabels: pageFieldLabels(kind, mode),
    items,
    preview,
  };
}

/** One item as the rater sees it: the case's context and each keyed output. */
function buildItem(
  kind: RatingKind,
  id: string,
  keyItem: KeyItem,
  caseById: Map<string, EvalCase>,
  records: CallRecord[],
  loadOutput: PlanDeps["loadOutput"]
): RatingItem {
  const evalCase = caseById.get(keyItem.caseId);
  if (!evalCase) throw new Error(`Unknown case ${keyItem.caseId}`);
  const chain = keyItem.reference !== undefined;
  // The state the beat call saw: the frozen state with the fixed analysis (caseStory) and its chapter's frame; a chain
  // item's context stops before the plan, which each option wrote itself
  const context =
    kind === "turn" && evalCase.state
      ? chain
        ? turnContext(evalCase.state, undefined, { chainOpening: true })
        : turnContext(evalCase.state, evalCase.fixedAnalysis, { frames: evalCase.chapterFrames })
      : [];
  return {
    id,
    premise: evalCase.setup?.premise,
    context,
    options: Object.entries(keyItem.labels).map(([label, ref]) => {
      const record = findOutput(records, kind, ref);
      if (!record) throw new Error(`No usable output for ${id} option ${label}`);
      const content = optionContent(kind, loadOutput(record), evalCase.state);
      if (!chain || content.kind !== "turn" || !evalCase.state) return { label, content };
      const plan = chainPlanOf(records, record);
      if (!plan) throw new Error(`No usable chapter plan for ${id} option ${label}`);
      return { label, content: { ...content, plan: chapterPlanLines(evalCase.state, loadOutput(plan)) } };
    }),
  };
}

/**
 * The page an existing key describes, rendered afresh from its outputs:
 * the same page id, items and labels, so ratings already saved in a browser
 * still apply. For re-rendering a page after a rendering fix.
 */
export function ratingSetFromKey(
  key: RatingKey,
  records: CallRecord[],
  cases: EvalCase[],
  loadOutput: PlanDeps["loadOutput"]
): RatingSet {
  const kind: RatingKind = key.setId === "text-setup" ? "setup" : "turn";
  const caseById = new Map(cases.map((c) => [c.id, c]));
  const items = Object.entries(key.items).map(([id, keyItem]) => buildItem(kind, id, keyItem, caseById, records, loadOutput));
  return pageSet(kind, key.mode ?? "ranked", key.setId, key.pageId, items, false);
}

function optionContent(kind: RatingKind, output: unknown, state: StoryState | undefined): OptionContent {
  if (kind === "setup") return setupCard(output);
  if (!state) throw new Error("A turn option needs the case's story state");
  return turnContent(output, state);
}
