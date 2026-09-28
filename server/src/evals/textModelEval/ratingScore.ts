import type { KeyItem, RatingKey } from "./ratingSets.js";

/*
 * Scores an exported rating file against its answer key: per arm the
 * options ranked, mean rank, rank-1 count and wins/ties/losses against the
 * baseline, and the acceptable rate over the options that carry a verdict;
 * agreement on the repeated item; the baseline-against-baseline result;
 * rank-1 picks by label (position bias); what is left unrated; and every
 * note with its arm. Ranks and verdicts count independently, so a
 * rank-only export scores in full, with its acceptable columns "not marked".
 * On an item with at least one rank, the options left unranked read as
 * worse than every ranked one and tied with each other (the owner ranks the
 * best and leaves the rest); an item with no rank stays unrated.
 *
 * A pairwise page (key mode "pairwise") scores with scorePairwise instead: a
 * win, tie or loss per item for the candidate against the reference, the
 * sign test over the decided items, the acceptable rate per arm, the repeat
 * read in arm terms (its labels are swapped), which control sample was
 * preferred, and the picks by label.
 */

export type OptionRating = { acceptable?: string; rank?: number; note?: string };

export type ExportedRatings = {
  pageId: string;
  setId: string;
  exportedAt: string;
  ratings: Record<string, Record<string, OptionRating>>;
  /** A pairwise page's export */
  mode?: "pairwise";
  /** Item -> the label picked as better, or "same" (pairwise pages) */
  preferences?: Record<string, string>;
};

export type ArmScore = {
  arm: string;
  /** Options of this arm with a rank, given or read as worse */
  ranked: number;
  /** Null when none is ranked */
  meanRank: number | null;
  rank1: number;
  /** Options of this arm with an Acceptable? verdict */
  acceptableMarked: number;
  acceptableYes: number;
  /** Yes over the marked options; null when none is marked */
  acceptableRate: number | null;
  /** Wins and ties over the items that carry a rank and show both this arm and the baseline; null for the baseline, or with no such item */
  equalOrBetterThanBaseline: number | null;
  wins: number;
  ties: number;
  losses: number;
};

export type OptionRef = { label: string; arm: string };

export type Completeness = {
  options: number;
  rankedOptions: number;
  /** Items with no rank or verdict on any option, items absent from the export included */
  unratedItems: string[];
  /** Rated items' options without a rank; readAsWorse when the item carries a rank, so they score as worse, unordered */
  unranked: { item: string; options: OptionRef[]; readAsWorse: boolean }[];
  /** Whether any option on the page carries an Acceptable? verdict */
  acceptableMarked: boolean;
  /** With verdicts in use, rated items' options without one */
  unmarked: { item: string; options: OptionRef[] }[];
};

export type Scores = {
  setId: string;
  pageId: string;
  exportedAt: string;
  baseline: string;
  arms: ArmScore[];
  repeat?: {
    item: string;
    of: string;
    /** Arms with a verdict in both showings, and the share that agree; null when none */
    acceptableCompared: number;
    acceptableAgreement: number | null;
    /** Arms ranked in both showings, and whether their pairwise order held; null below two */
    rankCompared: number;
    sameRankOrder: boolean | null;
  };
  /** Each sample's rank as read: readAsWorse when it was left unranked beside a ranked one */
  control?: { item: string; samples: { sample: number; acceptable?: string; rank?: number; readAsWorse: boolean }[] };
  rank1ByLabel: Record<string, number>;
  notes: { item: string; label: string; arm: string; note: string }[];
  completeness: Completeness;
};

type LabelRef = KeyItem["labels"][string];

const armOf = (ref: LabelRef) => `${ref.promptState}:${ref.armKey}`;
const describeRef = (ref: LabelRef) => `${armOf(ref)} s${ref.sample}`;
const hasRank = (rating: OptionRating | undefined): rating is OptionRating & { rank: number } => typeof rating?.rank === "number";
const hasVerdict = (rating: OptionRating | undefined) => rating?.acceptable === "yes" || rating?.acceptable === "no";

/** An option as scored: its rating as exported, and its rank as read (undefined on an item with no rank). */
type ReadOption = { label: string; ref: LabelRef; rating: OptionRating; rank?: number; readAsWorse: boolean };

/**
 * An item's options as scored. On an item with at least one rank, an option
 * left unranked reads as worse than every ranked one and tied with the other
 * unranked ones: it takes the rank one below the worst given there (only a 1
 * given, so it counts as 2). An item with no rank leaves every option unranked.
 */
function readItem(item: KeyItem, ratings: Record<string, OptionRating> | undefined): ReadOption[] {
  const options = Object.entries(item.labels).map(([label, ref]) => ({ label, ref, rating: ratings?.[label] ?? {} }));
  const given = options.flatMap((o) => (hasRank(o.rating) ? [o.rating.rank] : []));
  const worse = given.length ? Math.max(...given) + 1 : undefined;
  return options.map((o) =>
    hasRank(o.rating) ? { ...o, rank: o.rating.rank, readAsWorse: false } : { ...o, rank: worse, readAsWorse: worse !== undefined }
  );
}

/** An item's options with their ranks as the scorer reads them (unranked beside a rank: one below the worst). */
export function readRanks(item: KeyItem, ratings: Record<string, OptionRating> | undefined): { label: string; ref: LabelRef; rank?: number }[] {
  return readItem(item, ratings).map(({ label, ref, rank }) => ({ label, ref, rank }));
}

/** Arm -> option as scored, for one item. */
function byArm(item: KeyItem, ratings: Record<string, OptionRating> | undefined): Map<string, ReadOption> {
  return new Map(readItem(item, ratings).map((option) => [armOf(option.ref), option]));
}

/** Pairwise rank order over the given arms: for every pair, which ranks better (or equal). */
function rankOrder(ratings: Map<string, ReadOption>, arms: string[]): string[] {
  const sorted = [...arms].sort();
  const pairs: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = ratings.get(sorted[i])?.rank ?? 0;
      const b = ratings.get(sorted[j])?.rank ?? 0;
      pairs.push(`${sorted[i]}${a < b ? "<" : a > b ? ">" : "="}${sorted[j]}`);
    }
  }
  return pairs;
}

type Totals = { ranked: number; rankSum: number; rank1: number; marked: number; yes: number; wins: number; ties: number; losses: number };

function armTotals(regular: [string, KeyItem][], exported: ExportedRatings, baselineArm: string) {
  const totals = new Map<string, Totals>();
  const at = (arm: string) => {
    const t = totals.get(arm) ?? { ranked: 0, rankSum: 0, rank1: 0, marked: 0, yes: 0, wins: 0, ties: 0, losses: 0 };
    totals.set(arm, t);
    return t;
  };
  at(baselineArm);
  for (const [itemId, item] of regular) {
    const arms = byArm(item, exported.ratings[itemId]);
    const base = arms.get(baselineArm);
    for (const [arm, { rating, rank }] of arms) {
      const t = at(arm);
      if (hasVerdict(rating)) {
        t.marked++;
        if (rating.acceptable === "yes") t.yes++;
      }
      if (rank === undefined) continue;
      t.ranked++;
      t.rankSum += rank;
      if (rank === 1) t.rank1++;
      if (arm !== baselineArm && base?.rank !== undefined) {
        if (rank < base.rank) t.wins++;
        else if (rank === base.rank) t.ties++;
        else t.losses++;
      }
    }
  }
  return totals;
}

function armScore(arm: string, t: Totals, baselineArm: string): ArmScore {
  const compared = t.wins + t.ties + t.losses;
  return {
    arm,
    ranked: t.ranked,
    meanRank: t.ranked ? t.rankSum / t.ranked : null,
    rank1: t.rank1,
    acceptableMarked: t.marked,
    acceptableYes: t.yes,
    acceptableRate: t.marked ? t.yes / t.marked : null,
    equalOrBetterThanBaseline: arm === baselineArm || !compared ? null : (t.wins + t.ties) / compared,
    wins: t.wins,
    ties: t.ties,
    losses: t.losses,
  };
}

function completenessOf(entries: [string, KeyItem][], exported: ExportedRatings): Completeness {
  const result: Completeness = { options: 0, rankedOptions: 0, unratedItems: [], unranked: [], acceptableMarked: false, unmarked: [] };
  const missing: Completeness["unmarked"] = [];
  for (const [itemId, item] of entries) {
    const options = readItem(item, exported.ratings[itemId]);
    result.options += options.length;
    result.rankedOptions += options.filter((o) => hasRank(o.rating)).length;
    if (options.some((o) => hasVerdict(o.rating))) result.acceptableMarked = true;
    if (!options.some((o) => hasRank(o.rating) || hasVerdict(o.rating))) {
      result.unratedItems.push(itemId);
      continue;
    }
    const refs = (keep: (rating: OptionRating | undefined) => boolean) =>
      options.filter((o) => !keep(o.rating)).map((o) => ({ label: o.label, arm: describeRef(o.ref) }));
    const unranked = refs(hasRank);
    if (unranked.length) result.unranked.push({ item: itemId, options: unranked, readAsWorse: options.some((o) => o.readAsWorse) });
    const unmarked = refs(hasVerdict);
    if (unmarked.length) missing.push({ item: itemId, options: unmarked });
  }
  result.unmarked = result.acceptableMarked ? missing : [];
  return result;
}

function repeatOf(entries: [string, KeyItem][], key: RatingKey, exported: ExportedRatings): Scores["repeat"] {
  const repeatEntry = entries.find(([, item]) => item.repeatOf);
  if (!repeatEntry?.[1].repeatOf) return undefined;
  const [itemId, item] = repeatEntry;
  const of = item.repeatOf as string;
  const again = byArm(item, exported.ratings[itemId]);
  const first = byArm(key.items[of], exported.ratings[of]);
  const arms = [...again.keys()];
  const marked = arms.filter((arm) => hasVerdict(again.get(arm)?.rating) && hasVerdict(first.get(arm)?.rating));
  const ranked = arms.filter((arm) => again.get(arm)?.rank !== undefined && first.get(arm)?.rank !== undefined);
  const agree = marked.filter((arm) => again.get(arm)?.rating.acceptable === first.get(arm)?.rating.acceptable).length;
  return {
    item: itemId,
    of,
    acceptableCompared: marked.length,
    acceptableAgreement: marked.length ? agree / marked.length : null,
    rankCompared: ranked.length,
    sameRankOrder: ranked.length >= 2 ? rankOrder(again, ranked).join() === rankOrder(first, ranked).join() : null,
  };
}

export function scoreRatings(exported: ExportedRatings, key: RatingKey): Scores {
  if (exported.pageId !== key.pageId || exported.setId !== key.setId) {
    throw new Error(
      `The export is for ${exported.setId}/${exported.pageId}, the key for ${key.setId}/${key.pageId}.`
    );
  }
  const entries = Object.entries(key.items);
  const regular = entries.filter(([, item]) => !item.control && !item.repeatOf);
  const baselineArm = `${key.baseline.promptState}:${key.baseline.armKey}`;

  const totals = armTotals(regular, exported, baselineArm);
  const others = [...totals.keys()].filter((arm) => arm !== baselineArm).sort();
  const arms = [baselineArm, ...others].map((arm) => armScore(arm, totals.get(arm) as Totals, baselineArm));

  const rank1ByLabel: Record<string, number> = {};
  for (const [itemId] of regular) {
    for (const [label, rating] of Object.entries(exported.ratings[itemId] ?? {})) {
      if (rating.rank === 1) rank1ByLabel[label] = (rank1ByLabel[label] ?? 0) + 1;
    }
  }

  const controlEntry = entries.find(([, item]) => item.control);
  const control = controlEntry
    ? {
        item: controlEntry[0],
        samples: readItem(controlEntry[1], exported.ratings[controlEntry[0]]).map((o) => ({
          sample: o.ref.sample,
          acceptable: o.rating.acceptable,
          rank: o.rank,
          readAsWorse: o.readAsWorse,
        })),
      }
    : undefined;

  const notes = entries.flatMap(([itemId, item]) =>
    Object.entries(exported.ratings[itemId] ?? {})
      .filter(([, rating]) => rating.note && rating.note.trim())
      .map(([label, rating]) => ({
        item: itemId,
        label,
        arm: item.labels[label] ? describeRef(item.labels[label]) : "unknown label",
        note: rating.note as string,
      }))
  );

  return {
    setId: key.setId,
    pageId: key.pageId,
    exportedAt: exported.exportedAt,
    baseline: baselineArm,
    arms,
    repeat: repeatOf(entries, key, exported),
    control,
    rank1ByLabel,
    notes,
    completeness: completenessOf(entries, exported),
  };
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const NOT_MARKED = "not marked";

function armRow(a: ArmScore, baseline: string): string {
  const isBaseline = a.arm === baseline;
  return [
    `${a.arm}${isBaseline ? " (baseline)" : ""}`,
    a.ranked,
    a.meanRank === null ? "–" : a.meanRank.toFixed(2),
    a.rank1,
    isBaseline ? "–" : `${a.wins} / ${a.ties} / ${a.losses}`,
    a.equalOrBetterThanBaseline === null ? "–" : pct(a.equalOrBetterThanBaseline),
    a.acceptableMarked ? `${a.acceptableYes} of ${a.acceptableMarked}` : NOT_MARKED,
    a.acceptableRate === null ? NOT_MARKED : pct(a.acceptableRate),
  ].reduce<string>((row, cell) => `${row} ${cell} |`, "|");
}

function repeatLine(scores: Scores): string {
  const r = scores.repeat;
  if (!r) return "- No repeated item on this page.";
  const head = `- Repeated item ${r.item} (of ${r.of})`;
  const unrated = [r.item, r.of].filter((id) => scores.completeness.unratedItems.includes(id));
  if (unrated.length) return `${head}: unavailable, ${unrated.join(" and ")} ${unrated.length > 1 ? "have" : "has"} no ratings.`;
  const acceptable =
    r.acceptableAgreement === null
      ? "acceptable agreement unavailable (no option carries a verdict in both)"
      : `acceptable verdicts agree on ${pct(r.acceptableAgreement)} of the ${r.acceptableCompared} options marked in both`;
  const rank =
    r.sameRankOrder === null
      ? "rank order unavailable (fewer than two options ranked in both)"
      : `rank order ${r.sameRankOrder ? "identical" : "differs"} over the ${r.rankCompared} options ranked in both`;
  return `${head}: ${acceptable}; ${rank}.`;
}

function controlLine(scores: Scores): string {
  const c = scores.control;
  if (!c) return "- No baseline-against-baseline item on this page.";
  if (scores.completeness.unratedItems.includes(c.item)) return `- Baseline against baseline (${c.item}): unavailable, ${c.item} has no ratings.`;
  const rank = (s: (typeof c.samples)[number]) =>
    s.rank === undefined ? "unranked" : s.readAsWorse ? `${s.rank} (unranked, read as worse)` : `${s.rank}`;
  const samples = c.samples.map((s) => `sample ${s.sample} rank ${rank(s)}, acceptable ${s.acceptable ?? NOT_MARKED}`);
  return `- Baseline against baseline (${c.item}): ${samples.join("; ")}.`;
}

function completenessLines(scores: Scores): string[] {
  const c = scores.completeness;
  const role = (id: string) =>
    id === scores.repeat?.item ? ` (repeat of ${scores.repeat.of})` : id === scores.control?.item ? " (baseline against baseline)" : "";
  const options = (refs: OptionRef[]) => refs.map((o) => `${o.label} (${o.arm})`).join(", ");
  const lines = [`- ${c.rankedOptions} of ${c.options} options ranked.`];
  if (c.unratedItems.length) lines.push(`- Not rated at all: ${c.unratedItems.map((id) => `${id}${role(id)}`).join(", ")}.`);
  lines.push(
    ...c.unranked.map((u) => `- ${u.item}${role(u.item)}: ${options(u.options)} unranked${u.readAsWorse ? " (read as worse, unordered)" : ""}.`)
  );
  if (!c.unratedItems.length && !c.unranked.length) lines.push("- Every option of every item was ranked.");
  if (!c.acceptableMarked) {
    lines.push(`- No option carries an Acceptable? verdict, so the acceptable columns read "${NOT_MARKED}".`);
  } else {
    lines.push(...c.unmarked.map((u) => `- ${u.item}${role(u.item)}: ${options(u.options)} without an Acceptable? verdict.`));
  }
  return lines;
}

export function renderScores(scores: Scores): string {
  const lines = [
    `# Rating scores: ${scores.setId} (${scores.pageId})`,
    "",
    `Exported ${scores.exportedAt}. Baseline: ${scores.baseline}.`,
    "",
    "| Arm | Ranked | Mean rank | Rank 1 | Wins / ties / losses vs baseline | Equal or better than baseline | Acceptable | Acceptable rate |",
    "|---|---|---|---|---|---|---|---|",
    ...scores.arms.map((a) => armRow(a, scores.baseline)),
    "",
    "Regular items only (the repeat and the baseline-against-baseline item are read under Controls, the same way). On an item with at least one rank, the options left unranked are read as worse than every ranked option and tied with each other: they count under Ranked, take the rank one below the worst rank given on that item for the mean (only a 1 given, so they count as 2), lose to any ranked option and tie with another unranked one. Items without any rank stay unrated. Wins, ties and losses count the items that carry a rank; the acceptable columns count the options with a verdict.",
    "",
    "## Completeness",
    "",
    ...completenessLines(scores),
    "",
    "## Controls",
    "",
    repeatLine(scores),
    controlLine(scores),
    `- Rank-1 picks by label: ${Object.entries(scores.rank1ByLabel).map(([label, n]) => `${label} ${n}`).join(", ") || "none"}.`,
    "",
    "## Notes",
    "",
    ...(scores.notes.length ? scores.notes.map((n) => `- ${n.item} ${n.label} (${n.arm}): ${n.note}`) : ["None."]),
  ];
  return `${lines.join("\n")}\n`;
}

// --- Pairwise pages ---

/** A pairwise item as read for the candidate: it was preferred (win), the reference was (loss), or neither (tie). */
export type PairwiseResult = "win" | "tie" | "loss";

export type PairwiseItem = {
  item: string;
  caseId: string;
  /** Undefined when the item carries no preference */
  result?: PairwiseResult;
  referenceAcceptable?: string;
  candidateAcceptable?: string;
};

type AcceptableCount = { marked: number; yes: number; rate: number | null };

export type PairwiseScores = {
  mode: "pairwise";
  setId: string;
  pageId: string;
  exportedAt: string;
  reference: string;
  candidate: string;
  /** Regular items, in page order */
  items: PairwiseItem[];
  wins: number;
  ties: number;
  losses: number;
  /** (wins + half the ties) over the items with a preference; null with none */
  candidateShare: number | null;
  /** Two-sided exact sign test of wins against losses (ties left out); null with no decided item */
  signTestP: number | null;
  acceptable: {
    reference: AcceptableCount;
    candidate: AcceptableCount;
    /** Items where both carry a verdict and only one side is acceptable */
    onlyReference: number;
    onlyCandidate: number;
  };
  repeat?: {
    item: string;
    of: string;
    /** Whether both showings give the same result for the candidate; null unless both carry a preference */
    samePreference: boolean | null;
    acceptableCompared: number;
    acceptableAgreement: number | null;
  };
  /** The reference against itself: which sample was preferred */
  control?: { item: string; preferred?: string; samples: { sample: number; acceptable?: string }[] };
  /** Regular items: how often each label (and "same") was picked */
  picksByLabel: Record<string, number>;
  notes: { item: string; label: string; arm: string; note: string }[];
  completeness: {
    /** No preference and no verdict on any option (absent from the export included) */
    unratedItems: string[];
    /** Rated items without a preference */
    withoutPreference: string[];
    /** Rated items with an option lacking a verdict */
    withoutVerdict: { item: string; options: OptionRef[] }[];
  };
};

const SAME = "same";

/** Two-sided exact sign test: the chance of a split at least this uneven among wins + losses decided items, at even odds. */
export function signTestP(wins: number, losses: number): number | null {
  const n = wins + losses;
  if (n === 0) return null;
  const k = Math.min(wins, losses);
  let tail = 0;
  let binomial = 1; // C(n, 0)
  for (let i = 0; i <= k; i++) {
    tail += binomial;
    binomial = (binomial * (n - i)) / (i + 1);
  }
  return Math.min(1, (2 * tail) / 2 ** n);
}

function acceptableCount(verdicts: (string | undefined)[]): AcceptableCount {
  const marked = verdicts.filter((v) => v === "yes" || v === "no");
  const yes = marked.filter((v) => v === "yes").length;
  return { marked: marked.length, yes, rate: marked.length ? yes / marked.length : null };
}

/** The candidate's result on an item, from the label picked; the reference is the key's baseline arm. */
function pairwiseResult(item: KeyItem, picked: string | undefined, referenceArm: string): PairwiseResult | undefined {
  if (picked === SAME) return "tie";
  const ref = picked ? item.labels[picked] : undefined;
  if (!ref) return undefined;
  return armOf(ref) === referenceArm ? "loss" : "win";
}

function verdictOf(item: KeyItem, ratings: Record<string, OptionRating> | undefined, isReference: boolean, referenceArm: string): string | undefined {
  const label = Object.keys(item.labels).find((l) => (armOf(item.labels[l]) === referenceArm) === isReference);
  return label ? ratings?.[label]?.acceptable : undefined;
}

export function scorePairwise(exported: ExportedRatings, key: RatingKey): PairwiseScores {
  if (exported.pageId !== key.pageId || exported.setId !== key.setId) {
    throw new Error(`The export is for ${exported.setId}/${exported.pageId}, the key for ${key.setId}/${key.pageId}.`);
  }
  if (key.mode !== "pairwise") throw new Error(`Page ${key.pageId} is not a pairwise page: score it with --score as a ranked page.`);
  const reference = `${key.baseline.promptState}:${key.baseline.armKey}`;
  const entries = Object.entries(key.items);
  const regular = entries.filter(([, item]) => !item.control && !item.repeatOf);
  const candidateRef = regular.flatMap(([, item]) => (item.reference ? [] : Object.values(item.labels))).find((ref) => armOf(ref) !== reference);
  const preferences = exported.preferences ?? {};
  // A chain item (a chapter plan, then its first turn) names its own reference arm
  const referenceOf = (item: KeyItem) => (item.reference ? `${item.reference.promptState}:${item.reference.armKey}` : reference);

  const items: PairwiseItem[] = regular.map(([itemId, item]) => ({
    item: itemId,
    caseId: item.caseId,
    result: pairwiseResult(item, preferences[itemId], referenceOf(item)),
    referenceAcceptable: verdictOf(item, exported.ratings[itemId], true, referenceOf(item)),
    candidateAcceptable: verdictOf(item, exported.ratings[itemId], false, referenceOf(item)),
  }));
  const count = (result: PairwiseResult) => items.filter((i) => i.result === result).length;
  const [wins, ties, losses] = [count("win"), count("tie"), count("loss")];
  const withPreference = wins + ties + losses;
  const bothMarked = items.filter((i) => [i.referenceAcceptable, i.candidateAcceptable].every((v) => v === "yes" || v === "no"));

  const picksByLabel: Record<string, number> = {};
  for (const [itemId] of regular) {
    const picked = preferences[itemId];
    if (picked) picksByLabel[picked] = (picksByLabel[picked] ?? 0) + 1;
  }

  const repeatEntry = entries.find(([, item]) => item.repeatOf);
  const repeat = repeatEntry
    ? (() => {
        const [itemId, item] = repeatEntry;
        const of = item.repeatOf as string;
        const again = pairwiseResult(item, preferences[itemId], reference);
        const first = pairwiseResult(key.items[of], preferences[of], reference);
        const verdicts = (id: string, entry: KeyItem) =>
          [true, false].map((isReference) => verdictOf(entry, exported.ratings[id], isReference, reference));
        const [a, b] = [verdicts(itemId, item), verdicts(of, key.items[of])];
        const compared = [0, 1].filter((i) => [a[i], b[i]].every((v) => v === "yes" || v === "no"));
        return {
          item: itemId,
          of,
          samePreference: again && first ? again === first : null,
          acceptableCompared: compared.length,
          acceptableAgreement: compared.length ? compared.filter((i) => a[i] === b[i]).length / compared.length : null,
        };
      })()
    : undefined;

  const controlEntry = entries.find(([, item]) => item.control);
  const control = controlEntry
    ? (() => {
        const [itemId, item] = controlEntry;
        const picked = preferences[itemId];
        const preferred = picked === SAME ? SAME : picked && item.labels[picked] ? `sample ${item.labels[picked].sample}` : undefined;
        const samples = Object.entries(item.labels).map(([label, ref]) => ({ sample: ref.sample, acceptable: exported.ratings[itemId]?.[label]?.acceptable }));
        return { item: itemId, preferred, samples };
      })()
    : undefined;

  const notes = entries.flatMap(([itemId, item]) =>
    Object.entries(exported.ratings[itemId] ?? {})
      .filter(([, rating]) => rating.note && rating.note.trim())
      .map(([label, rating]) => ({
        item: itemId,
        label,
        arm: item.labels[label] ? describeRef(item.labels[label]) : "unknown label",
        note: rating.note as string,
      }))
  );

  const completeness: PairwiseScores["completeness"] = { unratedItems: [], withoutPreference: [], withoutVerdict: [] };
  for (const [itemId, item] of entries) {
    const ratings = exported.ratings[itemId] ?? {};
    const labels = Object.entries(item.labels);
    const verdictLess = labels.filter(([label]) => !hasVerdict(ratings[label])).map(([label, ref]) => ({ label, arm: describeRef(ref) }));
    if (!preferences[itemId] && verdictLess.length === labels.length) {
      completeness.unratedItems.push(itemId);
      continue;
    }
    if (!preferences[itemId]) completeness.withoutPreference.push(itemId);
    if (verdictLess.length) completeness.withoutVerdict.push({ item: itemId, options: verdictLess });
  }

  return {
    mode: "pairwise",
    setId: key.setId,
    pageId: key.pageId,
    exportedAt: exported.exportedAt,
    reference,
    candidate: candidateRef ? armOf(candidateRef) : "none",
    items,
    wins,
    ties,
    losses,
    candidateShare: withPreference ? (wins + ties / 2) / withPreference : null,
    signTestP: signTestP(wins, losses),
    acceptable: {
      reference: acceptableCount(items.map((i) => i.referenceAcceptable)),
      candidate: acceptableCount(items.map((i) => i.candidateAcceptable)),
      onlyReference: bothMarked.filter((i) => i.referenceAcceptable === "yes" && i.candidateAcceptable === "no").length,
      onlyCandidate: bothMarked.filter((i) => i.candidateAcceptable === "yes" && i.referenceAcceptable === "no").length,
    },
    repeat,
    control,
    picksByLabel,
    notes,
    completeness,
  };
}

const RESULT_TEXT: Record<PairwiseResult, string> = { win: "candidate better", tie: "about the same", loss: "reference better" };

export function renderPairwiseScores(scores: PairwiseScores): string {
  const rate = (a: AcceptableCount) => (a.rate === null ? NOT_MARKED : `${a.yes} of ${a.marked} (${pct(a.rate)})`);
  const r = scores.repeat;
  const repeatLineText = !r
    ? "- No repeated item on this page."
    : r.samePreference === null
      ? `- Repeated item ${r.item} (of ${r.of}, labels swapped): unavailable, both showings need a preference.`
      : `- Repeated item ${r.item} (of ${r.of}, labels swapped): ${r.samePreference ? "the same result" : "a different result"} for the candidate${
          r.acceptableAgreement === null ? "" : `; acceptable verdicts agree on ${pct(r.acceptableAgreement)} of the ${r.acceptableCompared} options marked in both`
        }.`;
  const c = scores.control;
  const controlLineText = !c
    ? "- No reference-against-reference item on this page."
    : `- Reference against itself (${c.item}): ${c.preferred === undefined ? "no preference" : c.preferred === SAME ? "about the same" : `${c.preferred} preferred`}; ${c.samples
        .map((s) => `sample ${s.sample} acceptable ${s.acceptable ?? NOT_MARKED}`)
        .join(", ")}.`;
  const done = scores.completeness;
  const lines = [
    `# Pairwise scores: ${scores.setId} (${scores.pageId})`,
    "",
    `Exported ${scores.exportedAt}.`,
    "",
    "| | Arm | Acceptable |",
    "|---|---|---|",
    `| Reference | ${scores.reference} | ${rate(scores.acceptable.reference)} |`,
    `| Candidate | ${scores.candidate} | ${rate(scores.acceptable.candidate)} |`,
    "",
    `- Candidate against reference: ${scores.wins} better, ${scores.ties} about the same, ${scores.losses} worse, over ${scores.wins + scores.ties + scores.losses} of ${scores.items.length} regular items.`,
    `- Candidate share (a tie counts half): ${scores.candidateShare === null ? "unavailable" : pct(scores.candidateShare)}. Sign test over the decided items: ${
      scores.signTestP === null ? "unavailable (no decided item)" : `p = ${scores.signTestP.toFixed(3)} (two-sided)`
    }.`,
    `- Acceptable on one side only: the reference on ${scores.acceptable.onlyReference} items, the candidate on ${scores.acceptable.onlyCandidate}.`,
    "",
    "Regular items only; the repeat and the reference-against-reference item are read under Controls.",
    "",
    "## Items",
    "",
    "| Item | Case | Result | Reference acceptable | Candidate acceptable |",
    "|---|---|---|---|---|",
    ...scores.items.map(
      (i) => `| ${i.item} | ${i.caseId} | ${i.result ? RESULT_TEXT[i.result] : "no preference"} | ${i.referenceAcceptable ?? NOT_MARKED} | ${i.candidateAcceptable ?? NOT_MARKED} |`
    ),
    "",
    "## Completeness",
    "",
    ...(done.unratedItems.length ? [`- Not rated at all: ${done.unratedItems.join(", ")}.`] : []),
    ...(done.withoutPreference.length ? [`- Without a preference: ${done.withoutPreference.join(", ")}.`] : []),
    ...done.withoutVerdict.map((u) => `- ${u.item}: ${u.options.map((o) => `${o.label} (${o.arm})`).join(", ")} without an Acceptable? verdict.`),
    ...(!done.unratedItems.length && !done.withoutPreference.length && !done.withoutVerdict.length ? ["- Every item carries a preference and both verdicts."] : []),
    "",
    "## Controls",
    "",
    repeatLineText,
    controlLineText,
    `- Picks by label: ${Object.entries(scores.picksByLabel).map(([label, n]) => `${label === SAME ? "about the same" : label} ${n}`).join(", ") || "none"}.`,
    "",
    "## Notes",
    "",
    ...(scores.notes.length ? scores.notes.map((n) => `- ${n.item} ${n.label} (${n.arm}): ${n.note}`) : ["None."]),
  ];
  return `${lines.join("\n")}\n`;
}
