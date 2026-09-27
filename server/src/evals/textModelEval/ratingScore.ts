import type { KeyItem, RatingKey } from "./ratingSets.js";

/*
 * Scores an exported rating file against its answer key: per arm the
 * options ranked, mean rank, rank-1 count and wins/ties/losses against the
 * baseline, and the acceptable rate over the options that carry a verdict;
 * agreement on the repeated item; the baseline-against-baseline result;
 * rank-1 picks by label (position bias); what is left unrated; and every
 * note with its arm. Ranks and verdicts count independently, so a
 * rank-only export scores in full, with its acceptable columns "not marked".
 */

export type OptionRating = { acceptable?: string; rank?: number; note?: string };

export type ExportedRatings = {
  pageId: string;
  setId: string;
  exportedAt: string;
  ratings: Record<string, Record<string, OptionRating>>;
};

export type ArmScore = {
  arm: string;
  /** Options of this arm with a rank */
  ranked: number;
  /** Null when none is ranked */
  meanRank: number | null;
  rank1: number;
  /** Options of this arm with an Acceptable? verdict */
  acceptableMarked: number;
  acceptableYes: number;
  /** Yes over the marked options; null when none is marked */
  acceptableRate: number | null;
  /** Wins and ties over the items where this arm and the baseline were both ranked; null for the baseline, or with no such item */
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
  /** Rated items' options without a rank */
  unranked: { item: string; options: OptionRef[] }[];
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
  control?: { item: string; samples: { sample: number; acceptable?: string; rank?: number }[] };
  rank1ByLabel: Record<string, number>;
  notes: { item: string; label: string; arm: string; note: string }[];
  completeness: Completeness;
};

type LabelRef = KeyItem["labels"][string];

const armOf = (ref: LabelRef) => `${ref.promptState}:${ref.armKey}`;
const describeRef = (ref: LabelRef) => `${armOf(ref)} s${ref.sample}`;
const hasRank = (rating: OptionRating | undefined): rating is OptionRating & { rank: number } => typeof rating?.rank === "number";
const hasVerdict = (rating: OptionRating | undefined) => rating?.acceptable === "yes" || rating?.acceptable === "no";

/** Arm -> rating for one item. */
function byArm(item: KeyItem, ratings: Record<string, OptionRating> | undefined): Map<string, OptionRating> {
  return new Map(Object.entries(item.labels).map(([label, ref]) => [armOf(ref), ratings?.[label] ?? {}]));
}

/** Pairwise rank order over the given arms: for every pair, which ranks better (or equal). */
function rankOrder(ratings: Map<string, OptionRating>, arms: string[]): string[] {
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
    for (const [arm, rating] of arms) {
      const t = at(arm);
      if (hasVerdict(rating)) {
        t.marked++;
        if (rating.acceptable === "yes") t.yes++;
      }
      if (!hasRank(rating)) continue;
      t.ranked++;
      t.rankSum += rating.rank;
      if (rating.rank === 1) t.rank1++;
      if (arm !== baselineArm && hasRank(base)) {
        if (rating.rank < base.rank) t.wins++;
        else if (rating.rank === base.rank) t.ties++;
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
    const options = Object.entries(item.labels).map(([label, ref]) => ({ label, ref, rating: exported.ratings[itemId]?.[label] }));
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
    if (unranked.length) result.unranked.push({ item: itemId, options: unranked });
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
  const marked = arms.filter((arm) => hasVerdict(again.get(arm)) && hasVerdict(first.get(arm)));
  const ranked = arms.filter((arm) => hasRank(again.get(arm)) && hasRank(first.get(arm)));
  const agree = marked.filter((arm) => again.get(arm)?.acceptable === first.get(arm)?.acceptable).length;
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
        samples: Object.entries(controlEntry[1].labels).map(([label, ref]) => ({
          sample: ref.sample,
          acceptable: exported.ratings[controlEntry[0]]?.[label]?.acceptable,
          rank: exported.ratings[controlEntry[0]]?.[label]?.rank,
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
  const samples = c.samples.map((s) => `sample ${s.sample} rank ${s.rank ?? "unranked"}, acceptable ${s.acceptable ?? NOT_MARKED}`);
  return `- Baseline against baseline (${c.item}): ${samples.join("; ")}.`;
}

function completenessLines(scores: Scores): string[] {
  const c = scores.completeness;
  const role = (id: string) =>
    id === scores.repeat?.item ? ` (repeat of ${scores.repeat.of})` : id === scores.control?.item ? " (baseline against baseline)" : "";
  const options = (refs: OptionRef[]) => refs.map((o) => `${o.label} (${o.arm})`).join(", ");
  const lines = [`- ${c.rankedOptions} of ${c.options} options ranked.`];
  if (c.unratedItems.length) lines.push(`- Not rated at all: ${c.unratedItems.map((id) => `${id}${role(id)}`).join(", ")}.`);
  lines.push(...c.unranked.map((u) => `- ${u.item}${role(u.item)}: ${options(u.options)} unranked.`));
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
    "Regular items only (the repeat and the baseline-against-baseline item are read under Controls). Wins, ties and losses count the items where the arm and the baseline were both ranked; the acceptable columns count the options with a verdict.",
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
