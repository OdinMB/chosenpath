import {
  IMAGE_KEYS,
  SETUP_FIELD_LABELS,
  TURN_FIELD_LABELS,
  type SetupBackground,
  type SetupCard,
  type SetupElement,
  type SetupOutcome,
  type SetupPlayer,
  type SetupStat,
  type TurnContent,
} from "./ratingContent.js";
import { escapeHtml, fields, listOf, meta, paragraphs, row, textRow } from "./ratingHtml.js";
import type { RatingKind } from "./ratingSets.js";

/*
 * An item's options as one comparison: a row per section, holding every
 * option's cell for it, so each section starts at the same height in every
 * column. A row is one foldable element, so a toggle opens or folds the
 * section in all options at once. Things whose number differs per option
 * (each stat, story element, outcome, identity, background) are entries
 * inside a cell and fold one by one. startsOpen and ENTRY_STARTS_OPEN are the
 * owner's defaults; nothing remembers a fold, so a reload shows them again.
 */

export type Row = {
  /** The same in every option: "guidelines.tone", "player2.backgrounds", "text" */
  key: string;
  /** Fixed text, apart from a turn's player row ("For" and the name) */
  title: string;
  open: boolean;
  /** Per option, in label order: what the header shows at a glance (HTML), "" for nothing */
  gists: string[];
  /** A leaf's body per option; undefined where the option lacks the field */
  cells?: (string | undefined)[];
  children?: Row[];
};

export type EntryKind = "stat" | "element" | "outcome" | "identity" | "background";

export const ENTRY_STARTS_OPEN: Record<EntryKind, boolean> = {
  stat: false,
  element: false,
  outcome: true,
  identity: true,
  background: false,
};

const SETUP_FOLDED = new Set(["guidelines", "guidelines.tone", "guidelines.decisions", "guidelines.typesOfThreads", "storyElements", "imageInstructions"]);

/** A turn's context folds (ratingContext.ts) that start folded: the long background. */
const TURN_FOLDED = new Set(["storySoFar", "story"]);

/**
 * The owner's defaults: on a setup page these sections start folded, every
 * player's backgrounds too; on a turn page only the story so far and the
 * story's world start folded.
 */
export function startsOpen(kind: RatingKind, key: string): boolean {
  if (kind === "turn") return !TURN_FOLDED.has(key);
  return !SETUP_FOLDED.has(key) && !/^player\d+\.backgrounds$/.test(key);
}

const e = escapeHtml;
const L = SETUP_FIELD_LABELS;
const EMPTY = `<p class="muted">${e(L.empty)}</p>`;

const count = (n: number) => `<span class="count">${n}</span>`;
const countGist = (list: unknown[] | undefined) => (list === undefined ? "" : count(list.length));

/** A group of fields (guidelines, image instructions): how many the option filled, nothing for none. */
const filledGist = (values: (string | unknown[] | undefined)[]) => {
  const filled = values.filter((v) => v !== undefined && v.length > 0).length;
  return filled ? count(filled) : "";
};

/** A group of lists (stats, a player): each list the option has, with its count. */
const listsGist = (lists: (Row | undefined)[], options: number) =>
  Array.from({ length: options }, (_, i) =>
    lists
      .filter((r): r is Row => r !== undefined && r.gists[i] !== "")
      .map((r) => `<span class="part">${e(r.title)} ${r.gists[i]}</span>`)
      .join("")
  );

function leaf(kind: RatingKind, key: string, title: string, cells: (string | undefined)[], gists?: string[]): Row | undefined {
  if (cells.every((cell) => cell === undefined)) return undefined;
  return { key, title, open: startsOpen(kind, key), gists: gists ?? cells.map(() => ""), cells };
}

function parent(kind: RatingKind, key: string, title: string, rows: (Row | undefined)[], gists: string[]): Row | undefined {
  const children = rows.filter((r): r is Row => r !== undefined);
  return children.length ? { key, title, open: startsOpen(kind, key), gists, children } : undefined;
}

function entry(kind: EntryKind, summary: string, body: string): string {
  return `<details class="entry" data-entry="${kind}"${ENTRY_STARTS_OPEN[kind] ? " open" : ""}><summary>${summary}</summary>${body}</details>`;
}

const heading = (text: string, fallback = "") => `<strong>${e(text || fallback || "—")}</strong>`;
const idLine = (id: string) => (id ? `<p class="meta"><code class="id">${e(id)}</code></p>` : "");

// Lists, not a joined line: the items often end in their own full stop
const listRow = (label: string, items: string[] | undefined) =>
  row(label, items === undefined ? "" : items.length ? listOf(items) : e(L.empty));

const valueText = (value: string[] | undefined) => (value === undefined ? "" : value.length ? value.join(", ") : L.empty);

const flagText = (value: boolean | undefined) => (value === undefined ? "" : value ? L.yes : L.no);

const RESOLUTION_LABELS: Record<string, string> = {
  favorable: L.favorable,
  unfavorable: L.unfavorable,
  mixed: L.mixed,
  sideAWins: L.sideAWins,
  sideBWins: L.sideBWins,
  resolution1: L.resolution1,
  resolution2: L.resolution2,
  resolution3: L.resolution3,
};

function outcomeEntry(o: SetupOutcome): string {
  const resolutions = o.resolutions.length
    ? `<ul>${o.resolutions.map((r) => `<li><span class="k">${e(RESOLUTION_LABELS[r.key] ?? r.key)}:</span> ${e(r.text)}</li>`).join("")}</ul>`
    : "";
  return entry(
    "outcome",
    heading(o.question, o.id),
    idLine(o.id) +
      fields(
        textRow(L.resonance, o.resonance),
        row(L.resolutions, resolutions),
        textRow(L.intendedMilestones, o.intendedNumberOfMilestones),
        listRow(L.milestones, o.milestones)
      )
  );
}

function statEntry(s: SetupStat): string {
  return entry(
    "stat",
    heading(s.name, s.id) + (s.type ? ` <span class="muted">${e(s.type)}</span>` : ""),
    idLine(s.id) +
      meta([
        [L.type, s.type],
        [L.group, s.group],
        [L.isVisible, flagText(s.isVisible)],
        [L.partOfPlayerBackgrounds, flagText(s.partOfPlayerBackgrounds)],
        [L.canBeChangedInBeatResolutions, flagText(s.canBeChangedInBeatResolutions)],
      ]) +
      fields(
        textRow(L.tooltip, s.tooltip),
        textRow(L.initialValue, valueText(s.initialValue)),
        textRow(L.possibleValues, s.possibleValues),
        listRow(L.effectOnPoints, s.effectOnPoints),
        listRow(L.narrativeImplications, s.narrativeImplications),
        listRow(L.adjustmentsAfterThreads, s.adjustmentsAfterThreads),
        textRow(L.optionsToSacrifice, s.optionsToSacrifice),
        textRow(L.optionsToGainAsReward, s.optionsToGainAsReward)
      )
  );
}

function elementEntry(el: SetupElement): string {
  return entry(
    "element",
    heading(el.name, el.id),
    idLine(el.id) +
      fields(textRow(L.role, el.role), textRow(L.instructions, el.instructions), textRow(L.appearance, el.appearance), listRow(L.facts, el.facts))
  );
}

function identityEntry(i: NonNullable<SetupPlayer["identities"]>[number]): string {
  return entry(
    "identity",
    heading(i.name) + (i.pronouns ? ` <span class="muted">(${e(i.pronouns)})</span>` : ""),
    i.appearance ? paragraphs([i.appearance]) : ""
  );
}

function startingStats(stats: SetupBackground["initialStats"]): string {
  if (stats === undefined) return "";
  if (stats.length === 0) return e(L.empty);
  return `<ul>${stats
    .map((s) => `<li><span class="k">${e(s.stat)}${s.known ? "" : ` (${e(L.notAPlayerStat)})`}:</span> ${e(valueText(s.value))}</li>`)
    .join("")}</ul>`;
}

function backgroundEntry(b: SetupBackground): string {
  return entry(
    "background",
    heading(b.title),
    (b.fluffTemplate ? paragraphs([b.fluffTemplate]) : "") + fields(row(L.startingStats, startingStats(b.initialStats)))
  );
}

/** Every player slot any option has, in number order. */
function slots(cards: SetupCard[]): string[] {
  const all = new Set(cards.flatMap((c) => c.players.map((p) => p.slot)));
  return [...all].sort((a, b) => Number(a.slice(6)) - Number(b.slice(6)));
}

export function setupRows(cards: SetupCard[]): Row[] {
  const K: RatingKind = "setup";
  const list = (key: string, title: string, pick: (c: SetupCard) => string[] | undefined) =>
    leaf(
      K,
      key,
      title,
      cards.map((c) => {
        const items = pick(c);
        return items === undefined ? undefined : items.length ? listOf(items) : EMPTY;
      }),
      cards.map((c) => countGist(pick(c)))
    );
  const entries = <T>(key: string, title: string, pick: (c: SetupCard) => T[] | undefined, render: (item: T) => string) =>
    leaf(
      K,
      key,
      title,
      cards.map((c) => {
        const items = pick(c);
        return items === undefined ? undefined : items.length ? items.map(render).join("") : EMPTY;
      }),
      cards.map((c) => countGist(pick(c)))
    );
  const text = (key: string, title: string, pick: (c: SetupCard) => string) =>
    leaf(
      K,
      key,
      title,
      cards.map((c) => (pick(c) ? paragraphs([pick(c)]) : undefined))
    );
  const player = (c: SetupCard, slot: string) => c.players.find((p) => p.slot === slot);
  const lists = (key: string, title: string, rows: (Row | undefined)[]) => parent(K, key, title, rows, listsGist(rows, cards.length));

  const rows = [
    text("difficulty", L.difficulty, (c) =>
      c.difficulty.map((d) => [d.title, d.modifier ? `(${L.modifier} ${d.modifier})` : ""].filter(Boolean).join(" ")).join(" · ")
    ),
    text("teaser", L.teaser, (c) => c.teaser),
    leaf(
      K,
      "characterSelection",
      L.characterSelection,
      cards.map((c) => {
        const intro =
          (c.introduction.title ? `<p><strong>${e(c.introduction.title)}</strong></p>` : "") +
          (c.introduction.text ? paragraphs(c.introduction.text.split(/\n\s*\n/)) : "");
        return intro || undefined;
      })
    ),
    parent(
      K,
      "guidelines",
      L.guidelines,
      [
        text("guidelines.world", L.world, (c) => c.guidelines.world),
        list("guidelines.rules", L.rules, (c) => c.guidelines.rules),
        list("guidelines.tone", L.tone, (c) => c.guidelines.tone),
        list("guidelines.conflicts", L.conflicts, (c) => c.guidelines.conflicts),
        list("guidelines.decisions", L.decisions, (c) => c.guidelines.decisions),
        list("guidelines.typesOfThreads", L.typesOfThreads, (c) => c.guidelines.typesOfThreads),
        list("guidelines.switchAndThreadInstructions", L.switchAndThreadInstructions, (c) => c.guidelines.switchAndThreadInstructions),
      ],
      cards.map((c) => filledGist(Object.values(c.guidelines)))
    ),
    entries("sharedOutcomes", L.sharedOutcomes, (c) => c.sharedOutcomes, outcomeEntry),
    lists("stats", L.stats, [
      leaf(
        K,
        "stats.statGroups",
        L.statGroups,
        cards.map((c) => (c.statGroups === undefined ? undefined : `<p>${e(valueText(c.statGroups))}</p>`)),
        cards.map((c) => countGist(c.statGroups))
      ),
      entries("stats.sharedStats", L.sharedStats, (c) => c.sharedStats, statEntry),
      entries("stats.playerStats", L.playerStats, (c) => c.playerStats, statEntry),
    ]),
    entries("storyElements", L.storyElements, (c) => c.storyElements, elementEntry),
    ...slots(cards).map((slot) =>
      lists(slot, `${L.player} ${slot.replace(/^player/, "")}`, [
        entries(`${slot}.outcomes`, L.outcomes, (c) => player(c, slot)?.outcomes, outcomeEntry),
        entries(`${slot}.identities`, L.identities, (c) => player(c, slot)?.identities, identityEntry),
        entries(`${slot}.backgrounds`, L.backgrounds, (c) => player(c, slot)?.backgrounds, backgroundEntry),
      ])
    ),
    parent(
      K,
      "imageInstructions",
      L.imageInstructions,
      IMAGE_KEYS.map((key) => text(`imageInstructions.${key}`, L[key], (c) => c.imageInstructions.find((i) => i.key === key)?.text ?? "")),
      cards.map((c) => filledGist(c.imageInstructions.map((i) => i.text)))
    ),
  ];
  return rows.filter((r): r is Row => r !== undefined);
}

const T = TURN_FIELD_LABELS;

/** Per player: title, text, options and interludes; under a player row when the turn has several players. */
export function turnRows(turns: TurnContent[]): Row[] {
  const K: RatingKind = "turn";
  const players = Math.max(0, ...turns.map((t) => t.beats.length));
  return Array.from({ length: players }, (_, index) => {
    const beats = turns.map((t) => t.beats[index]);
    const first = beats.find((b) => b !== undefined);
    const prefix = players > 1 && first ? `${first.slot}.` : "";
    const parts = [
      leaf(K, `${prefix}title`, T.title, beats.map((b) => (b ? `<h3 class="card-title">${e(b.title)}</h3>` : undefined))),
      leaf(K, `${prefix}text`, T.text, beats.map((b) => (b ? paragraphs(b.paragraphs) : undefined))),
      leaf(
        K,
        `${prefix}options`,
        T.options,
        beats.map((b) => (b ? `<ol>${b.options.map((o) => `<li>${e(o)}</li>`).join("")}</ol>` : undefined)),
        beats.map((b) => countGist(b?.options))
      ),
      leaf(
        K,
        `${prefix}interludes`,
        T.interludes,
        beats.map((b) => (b ? listOf(b.interludes) : undefined)),
        beats.map((b) => countGist(b?.interludes))
      ),
    ];
    if (!prefix || !first) return parts;
    return [parent(K, first.slot, `${T.forPlayer} ${first.playerName}`, parts, turns.map(() => ""))];
  })
    .flat()
    .filter((r): r is Row => r !== undefined);
}
