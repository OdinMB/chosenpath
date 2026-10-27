// What the fake model reads in a request beyond its schema, and the variety it
// writes from a seed, so that a story played on it moves and ends:
// - the chapter planner writes the length PACING gives (the last chapter's
//   exact length, else the shortest allowed), so a story ends on its turn
//   count, as soon as the engine allows;
// - a turn's options are three ways of acting with different risks, base
//   points and stat bonuses (challenge options in a chapter, exploration
//   options at a switch), on the stats the request lists;
// - every turn after the first moves one or two of those stats, each under
//   "shared" or a seat as the stat is;
// - stats start at different values;
// - the ending's beats are titled "The End", as the beat schema asks.
// Every value still fits its schema; the text stays placeholder text. The
// variety is drawn from the seed and what the request is (varietyKey: its
// turn, the beat it writes and the kind of reply it asks for), never from the
// order requests arrive in, which pregeneration shuffles: the same seed and
// the same request give the same risks, points, bonuses and stat moves.
// Nothing here reads the story's text, only the request's PACING, stat and
// turn lines.

/** A stat the request lists: its id, its type, and whether it is shared (else every player has one). */
const STAT_LINE = /\(id: ([A-Za-z0-9_-]+), type: (string\[\]|string|percentage|opposites|number)\)/g;
/** Where the request starts listing player stats (StoryStatePromptService's stats section): the stats before it are shared. */
const PLAYER_STATS_HEADING = "PLAYER STAT DEFINITIONS:";
/** The chapter planner's PACING lines (pacing.ts, threadPacingBlock). */
const LAST_CHAPTER = /This is the story's last thread: exactly (\d+) beats/;
const ALLOWED_LENGTHS = /Allowed lengths for this thread: ([^\n.]*?) beats/;
/** The turn request's job line (BeatPromptService): which beat it writes. */
const TURN_JOB = /STORY BEATS TO IMPLEMENT THE (SWITCH|THREAD|ENDING)\b/;
const FIRST_BEAT = /This is the first beat of the story\./;
/** The story's turn: the story state's progress line (StoryStatePromptService), else PACING's (pacing.ts). */
const TURN_NUMBER = [/Current turn: (\d+)\/\d+/, /This thread starts at turn (\d+) of \d+/, /\bTurn (\d+) of \d+;/];

/** The shortest chapter the engine plays: a step and the last step. */
export const SHORTEST_CHAPTER = 2;

/** The ending's beat title, as the beat schema asks for it. */
export const ENDING_TITLE = "The End";

/** What a request with no readable prompt reads as. */
export const EMPTY_REQUEST = Object.freeze({ chapterLength: undefined, stats: [], firstBeat: false, turn: undefined, turnNumber: undefined });

/** A chat completion request's message text, every message's, in order. */
export function requestText(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  return messages
    .map((message) => {
      const content = message?.content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) return content.map((part) => (typeof part?.text === "string" ? part.text : "")).join("\n");
      return "";
    })
    .join("\n\n");
}

/** The chapter length PACING asks for: the last chapter's exact length, else the shortest allowed one; undefined where it names none. */
export function chapterLengthIn(prompt) {
  const text = String(prompt ?? "");
  const last = text.match(LAST_CHAPTER);
  if (last) return Number(last[1]);
  const allowed = text.match(ALLOWED_LENGTHS);
  const lengths = allowed ? (allowed[1].match(/\d+/g) ?? []).map(Number).filter((n) => n >= SHORTEST_CHAPTER && n <= 4) : [];
  return lengths.length > 0 ? Math.min(...lengths) : undefined;
}

/** The stats a request lists, each once: shared where listed before the player stat definitions (or, with no such heading, unless its id starts with "player"). */
export function statsIn(prompt) {
  const text = String(prompt ?? "");
  const playerFrom = text.indexOf(PLAYER_STATS_HEADING);
  const stats = new Map();
  for (const match of text.matchAll(STAT_LINE)) {
    const [, id, type] = match;
    if (stats.has(id)) continue;
    const shared = playerFrom >= 0 ? match.index < playerFrom : !id.startsWith("player");
    stats.set(id, { id, type, shared });
  }
  return [...stats.values()];
}

/** The story's turn a request is for, where it names one. */
export function turnNumberIn(prompt) {
  const text = String(prompt ?? "");
  for (const line of TURN_NUMBER) {
    const match = text.match(line);
    if (match) return Number(match[1]);
  }
  return undefined;
}

/** What the fake reads in a request's text: the chapter length, the stats, whether it writes the story's first beat, which beat a turn writes, and the story's turn. */
export function readRequest(prompt) {
  const text = String(prompt ?? "");
  const job = text.match(TURN_JOB);
  return {
    chapterLength: chapterLengthIn(text),
    stats: statsIn(text),
    firstBeat: FIRST_BEAT.test(text),
    turn: job ? job[1].toLowerCase() : undefined,
    turnNumber: turnNumberIn(text),
  };
}

/**
 * What a request is, the same in every run: the story's turn, the beat it
 * writes, the chapter length PACING gives, and the kind of reply it asks for
 * (its schema's top-level properties). Never its arrival order: requests for
 * pregenerated turns arrive in a different order from run to run.
 */
export function varietyKey(request, schema) {
  const kind = Object.keys(schema?.properties ?? {}).sort().join(",");
  return [request?.turnNumber ?? "", request?.turn ?? "", request?.chapterLength ?? "", request?.firstBeat ? "first" : "", kind].join("|");
}

/** A seeded generator of numbers in [0, 1): mulberry32 on a hash of the seed and a key (a number, or a text such as varietyKey's). */
export function seededRandom(seed, key = 0) {
  let h = 2166136261;
  const mix = (n) => {
    h = Math.imul(h ^ (n & 0xffff), 16777619);
    h = Math.imul(h ^ (n >>> 16), 16777619);
  };
  mix(Number(seed) | 0);
  if (typeof key === "string") for (let i = 0; i < key.length; i++) mix(key.charCodeAt(i));
  else mix(Number(key) | 0);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- the variety

/** Risks in the order a reply's options take them, from a shift the seed draws: every option set holds all three. */
export const RISKS = ["safe", "normal", "risky"];
/** Base points, within what the option schema allows a normal option (+5 to -15). */
export const BASE_POINTS = [5, 0, -5, -10, -15];
/** Stat bonuses, within the schema's -15 to +15. */
export const BONUS_EFFECTS = [15, 10, 5, -5, -10];
/** Where stats start (percentages, or counts). */
export const START_VALUES = [25, 40, 55, 70, 85];
/** How far a turn moves a stat. */
export const CHANGE_STEPS = [5, 10, 15, 20];

const SEAT = /^player\d+$/;
const pick = (state, values) => values[Math.floor(state.random() * values.length) % values.length];

/** Stats a turn can move by a number and bonuses can name. */
function numericStats(state) {
  return state.request.stats.filter((stat) => stat.type === "percentage" || stat.type === "number");
}

/** The seat a beat is written for: the reply's player key the value sits under. */
function seatOf(ctx) {
  return ctx.path.find((key) => SEAT.test(String(key))) ?? "player1";
}

/** A player stat's id as a bonus names it for a seat ("player_nerve" → "player2_nerve"), a shared one's as it is. */
function bonusStatId(stat, seat) {
  return !stat.shared && stat.id.startsWith("player_") ? `${seat}${stat.id.slice("player".length)}` : stat.id;
}

/** The stat the n-th stat change of a reply moves. */
function changedStat(state, index) {
  const stats = numericStats(state);
  return stats.length > 0 ? stats[(index + state.shift) % stats.length] : undefined;
}

/** The values a schema lists (a const, or an enum), read through its $ref. */
function valuesOf(schema, state) {
  const resolved = state.deref ? state.deref(schema) : schema;
  if (!resolved || typeof resolved !== "object") return [];
  if ("const" in resolved) return [resolved.const];
  return Array.isArray(resolved.enum) ? resolved.enum : [];
}

/** The value a variant's discriminator holds (a const, or an enum of one). */
function constOf(property, state) {
  const values = valuesOf(property, state);
  return values.length === 1 ? values[0] : undefined;
}

/**
 * The fake's product hints for a story (fake-openai.mjs merges them into its
 * defaults), keyed by property name. Each gets the value's context (its key,
 * parent key, sibling keys, list positions and path) and the reply's state
 * (the request's reading, a seeded `random`, a `shift` drawn once per reply,
 * the root schema and `deref`, which reads a schema through its $ref, as the
 * product's schemas refer to shared definitions), and returns undefined to
 * leave the value to the generic schema filler. A union hint gets the
 * variants dereferenced, their properties not.
 */
export const STORY_HINTS = {
  length: {
    // A chapter's steps before its last: the length PACING gives, else the shortest
    steps: (schema, ctx, state) => (ctx.siblings?.includes("finalStep") ? (state.request.chapterLength ?? SHORTEST_CHAPTER) - 1 : undefined),
    // One or two bonuses an option, on stats the request lists; none where it lists none
    modifiersToSuccessRate: (schema, ctx, state) => Math.min(numericStats(state).length, 1 + Math.floor(state.random() * 2)),
    // One or two stats move every turn but the story's first, which the schema asks to leave empty
    statChanges: (schema, ctx, state) => (state.request.firstBeat ? 0 : Math.min(numericStats(state).length, 1 + Math.floor(state.random() * 2))),
  },
  number: {
    // A group chapter's length, the same for every thread
    duration: (schema, ctx, state) => (ctx.siblings?.includes("threads") ? (state.request.chapterLength ?? SHORTEST_CHAPTER) : undefined),
    basePoints: (schema, ctx, state) => pick(state, BASE_POINTS),
    effect: (schema, ctx, state) => (ctx.parentKey === "modifiersToSuccessRate" ? pick(state, BONUS_EFFECTS) : undefined),
    initialValue: (schema, ctx, state) => pick(state, START_VALUES),
    value: (schema, ctx, state) => {
      if (ctx.parentKey === "initialPlayerStatValues") return pick(state, START_VALUES);
      if (ctx.parentKey === "statChanges") return pick(state, CHANGE_STEPS);
      return undefined;
    },
  },
  enum: {
    // Each option of a set its own risk
    riskType: (values, ctx, state) => {
      const risk = RISKS[(ctx.index + state.shift + Number(seatOf(ctx).slice("player".length))) % RISKS.length];
      return values.includes(risk) ? risk : undefined;
    },
    group: (values, ctx, state) => {
      if (ctx.parentKey !== "statChanges") return undefined;
      const stat = changedStat(state, ctx.index);
      if (!stat) return undefined;
      if (stat.shared) return values.includes("shared") ? "shared" : undefined;
      const seats = state.seats.filter((seat) => values.includes(seat));
      return seats.length > 0 ? seats[(ctx.index + state.shift) % seats.length] : undefined;
    },
    change: (values, ctx, state) => {
      if (ctx.parentKey !== "statChanges") return undefined;
      const usable = ["addNumber", "subtractNumber"].filter((change) => values.includes(change));
      return usable.length > 0 ? pick(state, usable) : undefined;
    },
  },
  string: {
    stat: (schema, ctx, state) => (ctx.parentKey === "statChanges" ? changedStat(state, ctx.index)?.id : undefined),
    statId: (schema, ctx, state) => {
      if (ctx.parentKey !== "modifiersToSuccessRate") return undefined;
      const stats = numericStats(state);
      if (stats.length === 0) return undefined;
      const [option = 0, bonus = 0] = ctx.indexes ?? [];
      return bonusStatId(stats[(option + bonus + state.shift) % stats.length], seatOf(ctx));
    },
    // The ending's beats, as the beat schema's title asks for them
    title: (schema, ctx, state) => (state.request.turn === "ending" && SEAT.test(String(ctx.parentKey)) ? ENDING_TITLE : undefined),
  },
  union: {
    // Exploration options at a switch, challenge options in a chapter and at the ending (the option-type repair's phases)
    options: (variants, ctx, state) => {
      const wanted = state.request.turn === "switch" ? "exploration" : "challenge";
      return variants.find((variant) => constOf(variant?.properties?.optionType, state) === wanted);
    },
    // A stat change's group, "shared" or a seat, as the stat it moves is (the enum hint then picks the seat)
    group: (variants, ctx, state) => {
      if (ctx.parentKey !== "statChanges") return undefined;
      const stat = changedStat(state, ctx.index);
      if (!stat) return undefined;
      return variants.find((variant) => {
        const values = valuesOf(variant, state);
        return stat.shared ? values.includes("shared") : values.some((value) => SEAT.test(String(value)));
      });
    },
  },
};
