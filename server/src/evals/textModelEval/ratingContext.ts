import type { StoryState } from "core/types/index.js";
import type { FixedAnalysis } from "./cases.js";
import { field, list, strings, text } from "./ratingContent.js";

/*
 * The background shown above a turn's options, the same for every option of
 * an item: the chapter the turn belongs to (the owner's word for the thread
 * or switch), with the outcome it advances, its plan and the current step
 * marked; every outcome with its milestones; what happened just before; the
 * story so far, chapter by chapter; and the story's world.
 *
 * It reads the state the beat call saw: the frozen case state with the
 * case's fixed analysis appended, as caseStory does. The pages show isolated
 * beat arms, never pipeline chains, so on an analysis turn every option was
 * written from that same fixed plan: the plan is shared context, not part of
 * an option. The turn kind mirrors ThreadManager.getCurrentBeatType.
 *
 * Read defensively: a field the state lacks shows nothing. Every fixed
 * string is in CONTEXT_LABELS, which joins the page's field labels, so the
 * blinding word check reads it; names, plans and outcomes come from the
 * story state and go in a line's text.
 */

export const CONTEXT_LABELS = {
  chapter: "This chapter",
  outcomes: "Outcomes",
  before: "Before this turn",
  player: "player",
  introduction: "Introduction",
  chosenCharacters: "Chosen characters",
  storySoFar: "Story so far",
  story: "The story",
  turn: "Turn",
  chapterLine: "Chapter",
  justEnded: "Just ended",
  result: "Result",
  milestoneDue: "Milestone to add this turn",
  forOutcome: "For outcome",
  type: "Type",
  players: "Players",
  sideA: "Side A",
  sideB: "Side B",
  advances: "Advances outcome",
  whose: "For",
  milestonesSoFar: "Milestones so far",
  kindOfMilestone: "Kind of milestone",
  length: "Length",
  plan: "Plan",
  step: "Step",
  possibleResults: "Possible results",
  question: "Question",
  directions: "Directions offered",
  mustResolve: "Must resolve",
  milestone: "Milestone",
  character: "Character",
  sharedOutcomes: "Shared outcomes",
  previousBeat: "Previous beat",
  chosen: "Chosen",
  outcome: "Outcome",
  title: "Title",
  world: "World",
  rules: "World rules",
  tone: "Tone",
  conflicts: "Conflicts",
  of: "of",
  turns: "turns",
  switch: "switch",
  onFirstTurn: "on the first turn",
  threadStep: "thread, step",
  newThread: "a new thread starts",
  ending: "the ending, the story closes",
  topic: "topic",
  flavor: "flavor",
  topicMeaning: "topic, a choice of direction",
  flavorMeaning: "flavor, a set question and a choice of approach",
  challenge: "challenge",
  exploration: "exploration",
  contest: "contest",
  inProgress: "in progress",
  allPlayers: "all players (shared)",
  notAnOutcome: "not among the story's outcomes",
  samePlan: "Planned for this turn; every version below was written from the same plan.",
  markCurrent: "current step",
  markAdvances: "this chapter advances it",
  favorable: "Favorable",
  mixed: "Mixed",
  unfavorable: "Unfavorable",
  sideAWins: "Side A wins",
  sideBWins: "Side B wins",
  resolution1: "Resolution 1",
  resolution2: "Resolution 2",
  resolution3: "Resolution 3",
  wentWell: "it went well",
  wentPartly: "it went partly well",
  wentBadly: "it went badly",
  sideAWon: "side A won the round",
  sideBWon: "side B won the round",
} as const;

const L = CONTEXT_LABELS;

/** A line to mark: the plan's current step, or an outcome the current chapter advances. */
export type ContextMark = "current" | "advances";

export const MARK_TEXT: Record<ContextMark, string> = { current: L.markCurrent, advances: L.markAdvances };

export type ContextLine = {
  /** Fixed text (from CONTEXT_LABELS, perhaps with a number) */
  label?: string;
  text?: string;
  /** An outcome's id, shown small so a direction's "(id)" can be matched */
  id?: string;
  mark?: ContextMark;
  sub?: ContextLine[];
};

export type ContextSection = {
  /** The fold's key on the page; context-N by position when unset */
  key?: string;
  /** Fixed text */
  heading: string;
  /** Plain lines, one paragraph each */
  lines: string[];
  /** Structured lines, after the plain ones */
  entries?: ContextLine[];
};

type BeatType = "intro" | "switch" | "thread" | "ending";

type OutcomeRef = { outcome: unknown; id: string; question: string; owner: string; /** Undefined for a shared outcome */ slot?: string };

type View = {
  state: StoryState;
  /** The frozen phases, then the fixed analysis */
  phases: unknown[];
  turn: number;
  maxTurns?: number;
  beatType: BeatType;
  players: [string, unknown][];
  multiplayer: boolean;
  /** Shared first, then each player's, as the game looks them up (getOutcomeById) */
  outcomes: OutcomeRef[];
  /** An analysis ran for this turn: the case's fixed analysis */
  planned: boolean;
};

function present<T>(items: (T | undefined | null | false | "")[]): T[] {
  return items.filter((item): item is T => Boolean(item));
}

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
const isSwitchPhase = (phase: unknown) => Boolean(phase) && typeof phase === "object" && "switches" in (phase as object);
const isThreadPhase = (phase: unknown) => Boolean(phase) && typeof phase === "object" && "threads" in (phase as object);
const threadsOf = (phase: unknown) => list(field(phase, "threads"));
const switchesOf = (phase: unknown) => list(field(phase, "switches"));
const nameOf = (player: unknown, slot: string) => text(field(player, "name")) || slot;

/** Steps a thread has resolved, counted as the game does (`resolution !== null`). */
const stepsDone = (thread: unknown) => list(field(thread, "progression")).filter((step) => field(step, "resolution") !== null).length;

function beatTypeOf(phases: unknown[], turn: number, maxTurns: number | undefined): BeatType {
  const current = phases[phases.length - 1];
  if (isSwitchPhase(current)) return "switch";
  if (!isThreadPhase(current)) return "intro";
  // The game counts the first thread's steps, since parallel threads keep pace
  const duration = num(field(current, "duration"));
  const ended = maxTurns !== undefined && turn >= maxTurns && duration !== undefined && stepsDone(threadsOf(current)[0]) >= duration;
  return ended ? "ending" : "thread";
}

function viewOf(state: StoryState, fixed?: FixedAnalysis): View {
  const held = field(state, "players");
  const players = held && typeof held === "object" ? Object.entries(held as Record<string, unknown>) : [];
  const phases = [...list(field(state, "storyPhases")), ...(fixed ? [fixed.phase] : [])];
  const turn = list(field(players[0]?.[1], "beatHistory")).length;
  const maxTurns = num(field(state, "maxTurns"));
  const ref = (outcome: unknown, owner: string, slot?: string): OutcomeRef => ({
    outcome,
    id: text(field(outcome, "id")),
    question: text(field(outcome, "question")),
    owner,
    slot,
  });
  const outcomes = [
    ...list(field(state, "sharedOutcomes")).map((o) => ref(o, L.allPlayers)),
    ...players.flatMap(([slot, player]) => list(field(player, "outcomes")).map((o) => ref(o, nameOf(player, slot), slot))),
  ].filter((r) => r.id || r.question);
  return {
    state,
    phases,
    turn,
    maxTurns,
    beatType: beatTypeOf(phases, turn, maxTurns),
    players,
    multiplayer: players.length > 1,
    outcomes,
    planned: fixed !== undefined,
  };
}

/** The kind of beat the call wrote, as the game decides it on the state with the fixed analysis applied. */
export function contextBeatType(state: StoryState, fixed?: FixedAnalysis): BeatType {
  return viewOf(state, fixed).beatType;
}

const line = (label: string, value: unknown): ContextLine | undefined => {
  const t = text(value);
  return t ? { label, text: t } : undefined;
};

const listLine = (label: string, value: unknown): ContextLine | undefined => {
  const items = strings(value);
  return items.length ? { label, sub: items.map((t) => ({ text: t })) } : undefined;
};

const RESULT_ORDER = ["favorable", "sideAWins", "mixed", "unfavorable", "sideBWins", "resolution1", "resolution2", "resolution3"];

const RESULT_WORDS = new Map<string, string>([
  ["favorable", L.favorable],
  ["mixed", L.mixed],
  ["unfavorable", L.unfavorable],
  ["sideAWins", L.sideAWins],
  ["sideBWins", L.sideBWins],
  ["resolution1", L.resolution1],
  ["resolution2", L.resolution2],
  ["resolution3", L.resolution3],
]);

const resultWord = (key: string) => RESULT_WORDS.get(key) ?? key;

/** What each result means, in the game's order (favorable, mixed, unfavorable; side A, mixed, side B; 1, 2, 3). */
function resultLines(resolutions: unknown): ContextLine[] {
  if (!resolutions || typeof resolutions !== "object" || Array.isArray(resolutions)) return [];
  const rank = (key: string) => (RESULT_ORDER.includes(key) ? RESULT_ORDER.indexOf(key) : RESULT_ORDER.length);
  return Object.entries(resolutions)
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([key, value]) => ({ label: resultWord(key), text: text(value) }))
    .filter((l) => l.text);
}

function milestonesLine(outcome: unknown): ContextLine | undefined {
  const milestones = field(outcome, "milestones");
  if (!Array.isArray(milestones)) return undefined;
  const reached = strings(milestones);
  const intended = num(field(outcome, "intendedNumberOfMilestones"));
  return {
    label: L.milestonesSoFar,
    text: intended === undefined ? `${reached.length}` : `${reached.length} ${L.of} ${intended}`,
    sub: reached.map((t) => ({ text: t })),
  };
}

/** An outcome's question, with its id small when the question is there to show. */
const outcomeName = (ref: OutcomeRef): Pick<ContextLine, "text" | "id"> => (ref.question ? { text: ref.question, id: ref.id || undefined } : { text: ref.id });

function outcomeDetail(view: View, ref: OutcomeRef, show: { milestones: boolean; resolutions?: boolean }): ContextLine[] {
  return present([
    view.multiplayer ? { label: L.whose, text: ref.owner } : undefined,
    show.milestones ? milestonesLine(ref.outcome) : undefined,
    ...(show.resolutions ? resultLines(field(ref.outcome, "possibleResolutions")) : []),
  ]);
}

function advancesLine(view: View, id: string, milestones: boolean): ContextLine | undefined {
  if (!id) return undefined;
  const ref = view.outcomes.find((r) => r.id === id);
  if (!ref) return { label: L.advances, text: id, sub: [{ text: L.notAnOutcome }] };
  return { label: L.advances, ...outcomeName(ref), sub: outcomeDetail(view, ref, { milestones }) };
}

const playerNames = (view: View, slots: unknown) =>
  strings(slots)
    .map((slot) => nameOf(view.players.find(([s]) => s === slot)?.[1], slot))
    .join(", ");

/** challenge, exploration or contest, as the game tells them apart (getThreadType); nothing without steps. */
function threadTypeWord(thread: unknown): string | undefined {
  if (list(field(thread, "playersSideB")).length > 0) return L.contest;
  const first = list(field(thread, "progression"))[0];
  if (first === undefined) return undefined;
  const resolutions = field(first, "possibleResolutions");
  return resolutions && typeof resolutions === "object" && "favorable" in resolutions ? L.challenge : L.exploration;
}

const threadType = (thread: unknown) => present([threadTypeWord(thread), text(field(thread, "typeOfThread"))]).join(" · ");

function stepLine(step: unknown, index: number, current: number | undefined): ContextLine {
  const resolutions = field(step, "possibleResolutions");
  const resolution = text(field(step, "resolution"));
  const base: ContextLine = { label: `${L.step} ${index + 1}`, text: present([text(field(step, "title")), text(field(step, "question"))]).join(" — ") };
  if (resolution) {
    return { ...base, sub: [{ label: L.result, text: present([resultWord(resolution), text(field(resolutions, resolution))]).join(" — ") }] };
  }
  return index === current ? { ...base, mark: "current", sub: resultLines(resolutions) } : base;
}

function threadChapter(view: View, thread: unknown, duration: number | undefined): ContextLine {
  const steps = list(field(thread, "progression"));
  const contest = list(field(thread, "playersSideB")).length > 0;
  const current = view.beatType === "thread" ? stepsDone(thread) : undefined;
  const results = resultLines(field(thread, "possibleMilestones"));
  return {
    label: L.chapterLine,
    text: text(field(thread, "title")),
    sub: present([
      line(L.type, threadType(thread)),
      ...(contest
        ? [line(L.sideA, playerNames(view, field(thread, "playersSideA"))), line(L.sideB, playerNames(view, field(thread, "playersSideB")))]
        : [view.multiplayer ? line(L.players, playerNames(view, field(thread, "playersSideA"))) : undefined]),
      advancesLine(view, text(field(thread, "outcomeId")), true),
      line(L.kindOfMilestone, field(thread, "typeOfMilestone")),
      duration === undefined ? undefined : { label: L.length, text: `${duration} ${L.turns}` },
      steps.length ? { label: L.plan, sub: steps.map((step, i) => stepLine(step, i, current)) } : undefined,
      results.length ? { label: L.possibleResults, sub: results } : undefined,
    ]),
  };
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Outcomes a topic direction names by id, e.g. "… (player1_expose_waste_ring)". */
const named = (view: View, choice: string) =>
  view.outcomes.filter((r) => r.id && new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(r.id)}(?![A-Za-z0-9_])`).test(choice));

function switchChapter(view: View, sw: unknown): ContextLine {
  const type = text(field(sw, "type"));
  const choices = strings(field(sw, "topicChoices"));
  return {
    label: L.chapterLine,
    text: text(field(sw, "title")),
    sub: present([
      line(L.type, type === "topic" ? L.topicMeaning : type === "flavor" ? L.flavorMeaning : type),
      view.multiplayer ? line(L.players, playerNames(view, field(sw, "players"))) : undefined,
      advancesLine(view, text(field(sw, "outcomeId")), true),
      line(L.question, field(sw, "question")),
      choices.length
        ? {
            label: L.directions,
            sub: choices.map((choice) => ({ text: choice, sub: present(named(view, choice).map((ref) => advancesLine(view, ref.id, false))) })),
          }
        : undefined,
    ]),
  };
}

/** Threads whose milestone this beat adds: the one just resolved, on a later switch or the ending. */
function endedThreads(view: View): unknown[] {
  if (view.turn === 0) return [];
  const { phases } = view;
  if (view.beatType === "ending") return threadsOf(phases[phases.length - 1]);
  if (view.beatType !== "switch") return [];
  const before = phases[phases.length - 2];
  return isThreadPhase(before) ? threadsOf(before) : [];
}

function endedLine(view: View, thread: unknown): ContextLine {
  const outcomeId = text(field(thread, "outcomeId"));
  const ref = view.outcomes.find((r) => r.id === outcomeId);
  const resolution = text(field(thread, "resolution"));
  return {
    label: L.justEnded,
    text: text(field(thread, "title")),
    sub: present([
      resolution ? { label: L.result, text: resultWord(resolution) } : undefined,
      line(L.milestoneDue, field(thread, "milestone")),
      outcomeId ? { label: L.forOutcome, ...(ref ? outcomeName(ref) : { text: outcomeId }) } : undefined,
    ]),
  };
}

function turnLine(view: View): ContextLine {
  const n = view.turn + 1;
  if (view.beatType === "ending") return { label: L.turn, text: `${n} · ${L.ending}` };
  const at = view.maxTurns === undefined ? `${n}` : `${n} ${L.of} ${view.maxTurns}`;
  const current = view.phases[view.phases.length - 1];
  let kind = "";
  if (view.beatType === "switch") kind = view.turn === 0 ? `${L.switch}, ${L.onFirstTurn}` : L.switch;
  if (view.beatType === "thread") {
    const done = stepsDone(threadsOf(current)[0]);
    const duration = num(field(current, "duration"));
    kind = `${L.threadStep} ${done + 1}${duration === undefined ? "" : ` ${L.of} ${duration}`}${done === 0 ? `, ${L.newThread}` : ""}`;
  }
  return { label: L.turn, text: kind ? `${at} · ${kind}` : at };
}

function chapterSection(view: View): ContextSection {
  const current = view.phases[view.phases.length - 1];
  const duration = num(field(current, "duration"));
  const chapters =
    view.beatType === "switch"
      ? switchesOf(current).map((sw) => switchChapter(view, sw))
      : view.beatType === "thread"
        ? threadsOf(current).map((t) => threadChapter(view, t, duration ?? num(field(t, "duration"))))
        : [];
  const mustResolve = view.outcomes.map((ref) => ({ ...outcomeName(ref), sub: outcomeDetail(view, ref, { milestones: true, resolutions: true }) }));
  return {
    key: "chapter",
    heading: L.chapter,
    lines: [],
    entries: present([
      turnLine(view),
      ...endedThreads(view).map((t) => endedLine(view, t)),
      ...chapters,
      view.beatType === "ending" && mustResolve.length ? { label: L.mustResolve, sub: mustResolve } : undefined,
      view.planned && chapters.length ? { text: L.samePlan } : undefined,
    ]),
  };
}

/** Outcomes the current chapter works toward: its threads', or a flavor switch's set outcome. */
function advancing(view: View): Set<string> {
  const current = view.phases[view.phases.length - 1];
  const parts = view.beatType === "thread" ? threadsOf(current) : view.beatType === "switch" ? switchesOf(current) : [];
  return new Set(parts.map((part) => text(field(part, "outcomeId"))).filter(Boolean));
}

function outcomesSection(view: View): ContextSection {
  const marked = advancing(view);
  const outcomeLine = (ref: OutcomeRef): ContextLine => ({
    ...outcomeName(ref),
    mark: marked.has(ref.id) ? "advances" : undefined,
    sub: present([milestonesLine(ref.outcome)]),
  });
  const shared = view.outcomes.filter((r) => r.slot === undefined);
  return {
    key: "outcomes",
    heading: L.outcomes,
    lines: [],
    entries: present([
      shared.length ? { label: L.sharedOutcomes, sub: shared.map(outcomeLine) } : undefined,
      ...view.players.map(([slot, player]) => {
        const own = view.outcomes.filter((r) => r.slot === slot);
        return own.length ? { label: L.character, text: nameOf(player, slot), sub: own.map(outcomeLine) } : undefined;
      }),
    ]),
  };
}

const OUTCOME_WORDS = new Map<string, string>([
  ["favorable", L.wentWell],
  ["mixed", L.wentPartly],
  ["unfavorable", L.wentBadly],
  ["sideAWins", L.sideAWon],
  ["sideBWins", L.sideBWon],
]);

function statLines(state: StoryState, player: unknown): string[] {
  const valueOf = (values: unknown, stat: unknown) => text(field(list(values).find((v) => field(v, "statId") === field(stat, "id")), "value"));
  const shared = list(field(state, "sharedStats")).map((stat) => `${text(field(stat, "name"))}: ${valueOf(field(state, "sharedStatValues"), stat)}`);
  const own = list(field(state, "playerStats")).map((stat) => `${text(field(stat, "name"))}: ${valueOf(field(player, "statValues"), stat)}`);
  return [...shared, ...own].filter((l) => !l.endsWith(": ") && !l.startsWith(": "));
}

/** What happened just before, per player: the previous beat, the chosen option and its result, the relevant stats. */
function beforeSections(view: View): ContextSection[] {
  return view.players.map(([slot, player], index) => {
    const beat = list(field(player, "beatHistory"))[view.turn - 1];
    const choice = field(beat, "choice");
    const chosen = typeof choice === "number" && choice >= 0 ? text(field(list(field(beat, "options"))[choice], "text")) : "";
    const result = OUTCOME_WORDS.get(text(field(beat, "resolution")));
    return {
      key: view.multiplayer ? `before.${slot}` : "before",
      // Headings are fixed text: names are narrative and go in the lines
      heading: view.multiplayer ? `${L.before}: ${L.player} ${index + 1}` : L.before,
      lines: present([
        `${L.character}: ${nameOf(player, slot)}`,
        beat ? `${L.previousBeat}: ${text(field(beat, "summary"))}` : "",
        chosen ? `${L.chosen}: ${chosen}` : "",
        result ? `${L.outcome}: ${result}` : "",
        ...statLines(view.state, player),
      ]),
    };
  });
}

function firstTurnSections(view: View): ContextSection[] {
  const intro = field(view.state, "characterSelectionIntroduction");
  return [
    { key: "introduction", heading: L.introduction, lines: present([text(field(intro, "title")), text(field(intro, "text"))]) },
    {
      key: "characters",
      heading: L.chosenCharacters,
      lines: view.players.map(([slot, p]) => `${slot}: ${text(field(p, "name"))}${text(field(p, "fluff")) ? `, ${text(field(p, "fluff"))}` : ""}`),
    },
  ];
}

function chapterTitle(phase: unknown): string {
  const parts = isSwitchPhase(phase) ? switchesOf(phase) : threadsOf(phase);
  return strings(parts.map((part) => field(part, "title"))).join(" / ");
}

function threadFacts(thread: unknown): ContextLine[] {
  const resolution = text(field(thread, "resolution"));
  return present([
    line(L.type, threadType(thread)),
    { label: L.result, text: resolution ? resultWord(resolution) : L.inProgress },
    line(L.milestone, field(thread, "milestone")),
  ]);
}

/** A past chapter's kind and results: a switch's type; each thread's type, result and milestone. */
function chapterFacts(phase: unknown): ContextLine[] {
  if (isSwitchPhase(phase)) {
    const types = [...new Set(strings(switchesOf(phase).map((sw) => field(sw, "type"))))].map((t) => (t === "topic" ? L.topic : t === "flavor" ? L.flavor : t));
    return [{ label: L.type, text: [L.switch, ...types].join(" · ") }];
  }
  if (!isThreadPhase(phase)) return [];
  const threads = threadsOf(phase);
  return threads.length === 1 ? threadFacts(threads[0]) : threads.map((t) => ({ text: text(field(t, "title")), sub: threadFacts(t) }));
}

/** The chapters before this turn in order, each with its results and its beats' titles and summaries. */
function storySoFarSection(view: View): ContextSection {
  const placed = view.phases
    .map((phase) => ({ phase, start: num(field(phase, "firstBeatIndex")) }))
    .filter((p): p is { phase: unknown; start: number } => p.start !== undefined && p.start < view.turn);
  const ownerOf = (index: number) => placed.filter((p) => p.start <= index).pop();
  const beatLines = (index: number): ContextLine[] =>
    present(
      view.players.map(([slot, player]) => {
        const beat = list(field(player, "beatHistory"))[index];
        const body = present([text(field(beat, "title")), text(field(beat, "summary"))]).join(" — ");
        return body ? { label: `${L.turn} ${index + 1}`, text: view.multiplayer ? `${nameOf(player, slot)} · ${body}` : body } : undefined;
      })
    );
  const indices = Array.from({ length: view.turn }, (_, i) => i);
  return {
    key: "storySoFar",
    heading: L.storySoFar,
    lines: [],
    entries: [
      ...indices.filter((i) => ownerOf(i) === undefined).flatMap(beatLines),
      ...placed.map((p, n) => ({
        label: `${L.chapterLine} ${n + 1}`,
        text: chapterTitle(p.phase),
        sub: [...chapterFacts(p.phase), ...indices.filter((i) => ownerOf(i) === p).flatMap(beatLines)],
      })),
    ],
  };
}

function storySection(view: View): ContextSection {
  const guidelines = field(view.state, "guidelines");
  return {
    key: "story",
    heading: L.story,
    lines: [],
    entries: present([
      line(L.title, field(view.state, "title")),
      line(L.world, field(guidelines, "world")),
      listLine(L.rules, field(guidelines, "rules")),
      listLine(L.tone, field(guidelines, "tone")),
      listLine(L.conflicts, field(guidelines, "conflicts")),
    ]),
  };
}

/**
 * The context above a turn's options, from the case state and its fixed
 * analysis: this chapter, the outcomes, what happened just before (on the
 * first turn the introduction and chosen characters), the story so far and
 * the story. A section with nothing to show is left out.
 */
export function turnContext(state: StoryState, fixed?: FixedAnalysis): ContextSection[] {
  const view = viewOf(state, fixed);
  return [
    chapterSection(view),
    outcomesSection(view),
    ...(view.turn === 0 ? firstTurnSections(view) : beforeSections(view)),
    storySoFarSection(view),
    storySection(view),
  ].filter((s) => s.lines.length > 0 || (s.entries?.length ?? 0) > 0);
}
