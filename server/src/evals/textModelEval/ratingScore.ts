import type { KeyItem, RatingKey } from "./ratingSets.js";

/*
 * Scores an exported rating file against its answer key: per arm the
 * acceptable rate, mean rank and wins/ties/losses against the baseline;
 * agreement on the repeated item; the baseline-against-baseline result;
 * rank-1 picks by label (position bias); and every note with its arm.
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
  rated: number;
  acceptableRate: number;
  meanRank: number;
  equalOrBetterThanBaseline: number;
  wins: number;
  ties: number;
  losses: number;
};

export type Scores = {
  setId: string;
  pageId: string;
  exportedAt: string;
  baseline: string;
  arms: ArmScore[];
  repeat?: { item: string; of: string; acceptableAgreement: number; sameRankOrder: boolean };
  control?: { item: string; samples: { sample: number; acceptable?: string; rank?: number }[] };
  rank1ByLabel: Record<string, number>;
  notes: { item: string; label: string; arm: string; note: string }[];
  unrated: string[];
};

const armOf = (ref: KeyItem["labels"][string]) => `${ref.promptState}:${ref.armKey}`;

/** Arm -> rating for one item. */
function byArm(item: KeyItem, ratings: Record<string, OptionRating> | undefined): Map<string, OptionRating> {
  return new Map(Object.entries(item.labels).map(([label, ref]) => [armOf(ref), ratings?.[label] ?? {}]));
}

/** Pairwise rank order: for every pair of arms, which ranks better (or equal). */
function rankOrder(ratings: Map<string, OptionRating>): string[] {
  const arms = [...ratings.keys()].sort();
  const pairs: string[] = [];
  for (let i = 0; i < arms.length; i++) {
    for (let j = i + 1; j < arms.length; j++) {
      const a = ratings.get(arms[i])?.rank ?? 0;
      const b = ratings.get(arms[j])?.rank ?? 0;
      pairs.push(`${arms[i]}${a < b ? "<" : a > b ? ">" : "="}${arms[j]}`);
    }
  }
  return pairs;
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

  const totals = new Map<string, { rated: number; acceptable: number; rankSum: number; wins: number; ties: number; losses: number }>();
  const rank1ByLabel: Record<string, number> = {};
  const unrated: string[] = [];
  for (const [itemId, item] of regular) {
    const ratings = exported.ratings[itemId];
    if (!ratings) {
      unrated.push(itemId);
      continue;
    }
    const arms = byArm(item, ratings);
    const baseRank = arms.get(baselineArm)?.rank;
    for (const [arm, rating] of arms) {
      if (rating.rank === undefined || rating.acceptable === undefined) continue;
      const t = totals.get(arm) ?? { rated: 0, acceptable: 0, rankSum: 0, wins: 0, ties: 0, losses: 0 };
      t.rated++;
      if (rating.acceptable === "yes") t.acceptable++;
      t.rankSum += rating.rank;
      if (arm !== baselineArm && baseRank !== undefined) {
        if (rating.rank < baseRank) t.wins++;
        else if (rating.rank === baseRank) t.ties++;
        else t.losses++;
      }
      totals.set(arm, t);
    }
    for (const [label, rating] of Object.entries(ratings)) {
      if (rating.rank === 1) rank1ByLabel[label] = (rank1ByLabel[label] ?? 0) + 1;
    }
  }

  const arms: ArmScore[] = [...totals.entries()].map(([arm, t]) => ({
    arm,
    rated: t.rated,
    acceptableRate: t.rated ? t.acceptable / t.rated : 0,
    meanRank: t.rated ? t.rankSum / t.rated : 0,
    equalOrBetterThanBaseline: arm === baselineArm ? 1 : t.wins + t.ties + t.losses ? (t.wins + t.ties) / (t.wins + t.ties + t.losses) : 0,
    wins: t.wins,
    ties: t.ties,
    losses: t.losses,
  }));

  const repeatEntry = entries.find(([, item]) => item.repeatOf);
  let repeat: Scores["repeat"];
  if (repeatEntry?.[1].repeatOf) {
    const [itemId, item] = repeatEntry;
    const of = item.repeatOf as string;
    const again = byArm(item, exported.ratings[itemId]);
    const first = byArm(key.items[of], exported.ratings[of]);
    const armsBoth = [...again.keys()];
    const agree = armsBoth.filter((arm) => again.get(arm)?.acceptable === first.get(arm)?.acceptable).length;
    repeat = {
      item: itemId,
      of,
      acceptableAgreement: armsBoth.length ? agree / armsBoth.length : 0,
      sameRankOrder: rankOrder(again).join() === rankOrder(first).join(),
    };
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
        arm: item.labels[label] ? `${armOf(item.labels[label])} s${item.labels[label].sample}` : "unknown label",
        note: rating.note as string,
      }))
  );

  return { setId: key.setId, pageId: key.pageId, exportedAt: exported.exportedAt, baseline: baselineArm, arms, repeat, control, rank1ByLabel, notes, unrated };
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

export function renderScores(scores: Scores): string {
  const lines = [
    `# Rating scores: ${scores.setId} (${scores.pageId})`,
    "",
    `Exported ${scores.exportedAt}. Baseline: ${scores.baseline}.`,
    "",
    "| Arm | Rated | Acceptable | Mean rank | Equal or better than baseline | Wins / ties / losses |",
    "|---|---|---|---|---|---|",
    ...scores.arms.map(
      (a) =>
        `| ${a.arm}${a.arm === scores.baseline ? " (baseline)" : ""} | ${a.rated} | ${pct(a.acceptableRate)} | ${a.meanRank.toFixed(2)} | ${pct(a.equalOrBetterThanBaseline)} | ${a.wins} / ${a.ties} / ${a.losses} |`
    ),
    "",
    "## Controls",
    "",
    scores.repeat
      ? `- Repeated item ${scores.repeat.item} (of ${scores.repeat.of}): acceptable verdicts agree on ${pct(scores.repeat.acceptableAgreement)} of options; rank order ${scores.repeat.sameRankOrder ? "identical" : "differs"}.`
      : "- No repeated item on this page.",
    scores.control
      ? `- Baseline against baseline (${scores.control.item}): ${scores.control.samples.map((s) => `sample ${s.sample} acceptable ${s.acceptable ?? "–"}, rank ${s.rank ?? "–"}`).join("; ")}.`
      : "- No baseline-against-baseline item on this page.",
    `- Rank-1 picks by label: ${Object.entries(scores.rank1ByLabel).map(([label, n]) => `${label} ${n}`).join(", ") || "none"}.`,
    scores.unrated.length ? `- Unrated items: ${scores.unrated.join(", ")}.` : "- Every item was rated.",
    "",
    "## Notes",
    "",
    ...(scores.notes.length ? scores.notes.map((n) => `- ${n.item} ${n.label} (${n.arm}): ${n.note}`) : ["None."]),
  ];
  return `${lines.join("\n")}\n`;
}
