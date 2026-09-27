import type { Stat, StatValue, StatValueEntry } from "../types/stat.js";
import type { PlayerOptionsGeneration } from "../types/player.js";
import type { StoryState } from "../types/story.js";

/*
 * Whether a stat value fits its stat's type. Backgrounds carry the starting
 * values of player stats, written by an author or a model, and nothing else
 * checks them: a percentage written as "5" or a list written as one string
 * reaches play as is, and a value for a stat the story doesn't have is kept.
 *
 * The rule: a value of the right type is kept. A value of the wrong type is
 * converted when the reading is unambiguous: a numeric string for a number,
 * percentage or opposites stat (percentages and opposites also as "75%",
 * within 0 to 100), "a|b" for opposites when a + b = 100 (the stored value is
 * the first side), a single string for a string[] stat ("" is the empty list),
 * a one-item list for a string stat. Anything else, including a number or
 * percentage outside 0 to 100, is replaced by the stat's own initial value (read
 * the same way), or the template editor's default for its type when that
 * doesn't fit either. A value for a stat id that isn't a player stat is dropped.
 *
 * Applied where a background's values enter a story or a template: character
 * selection (PlayerManager), story start from a template (StoryStateFactory),
 * a generated setup before it is stored and a template before it is saved.
 * The template editor shows the same reading as a validation warning.
 */

export type StatValueFixKind = "converted" | "replaced" | "dropped";

export type StatValueFix = { statId: string; kind: StatValueFixKind };

/** How a value fits its stat. */
export type StatValueFit = "fits" | "converts" | "wrongType";

/** Every fix made to one background's values, by seat and background index. */
export type BackgroundValueFixes = {
  slot: string;
  background: number;
  fixes: StatValueFix[];
};

const NUMERIC = /^[+-]?\d+(?:\.\d+)?$/;
const PERCENT = /^[+-]?\d+(?:\.\d+)?%?$/;
const OPPOSITES = /^(\d+(?:\.\d+)?)%?\s*\|\s*(\d+(?:\.\d+)?)%?$/;

const inPercentRange = (value: number): boolean =>
  Number.isFinite(value) && value >= 0 && value <= 100;

/** The template editor's default for a stat of this type: "", [] or 50. */
export function defaultStatValue(type: Stat["type"]): StatValue {
  if (type === "string") return "";
  if (type === "string[]") return [];
  return 50;
}

type Reading = { value: StatValue; converted: boolean } | null;

const kept = (value: StatValue): Reading => ({ value, converted: false });
const converted = (value: StatValue): Reading => ({ value, converted: true });

function readPercentage(value: unknown, opposites: boolean): Reading {
  if (typeof value === "number") {
    return inPercentRange(value) ? kept(value) : null;
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (PERCENT.test(text)) {
    const number = parseFloat(text);
    return inPercentRange(number) ? converted(number) : null;
  }
  const sides = opposites ? text.match(OPPOSITES) : null;
  if (sides) {
    const first = parseFloat(sides[1] ?? "");
    const second = parseFloat(sides[2] ?? "");
    return inPercentRange(first) && Math.abs(first + second - 100) < 1e-9
      ? converted(first)
      : null;
  }
  return null;
}

function readNumber(value: unknown): Reading {
  if (typeof value === "number") {
    return Number.isFinite(value) ? kept(value) : null;
  }
  if (typeof value === "string" && NUMERIC.test(value.trim())) {
    return converted(parseFloat(value.trim()));
  }
  return null;
}

function readString(value: unknown): Reading {
  if (typeof value === "string") return kept(value);
  if (
    Array.isArray(value) &&
    value.length === 1 &&
    typeof value[0] === "string"
  ) {
    return converted(value[0]);
  }
  return null;
}

function readStringList(value: unknown): Reading {
  if (Array.isArray(value)) {
    return value.every((item) => typeof item === "string")
      ? kept(value as string[])
      : null;
  }
  if (typeof value === "string") {
    return converted(value === "" ? [] : [value]);
  }
  return null;
}

/** The value read as its stat's type, or null when no reading is unambiguous. */
function readStatValue(stat: Pick<Stat, "type">, value: unknown): Reading {
  switch (stat.type) {
    case "percentage":
      return readPercentage(value, false);
    case "opposites":
      return readPercentage(value, true);
    case "number":
      return readNumber(value);
    case "string":
      return readString(value);
    case "string[]":
      return readStringList(value);
    default:
      // A stat type this check doesn't know: the editor flags the type itself
      return kept(value as StatValue);
  }
}

/** Whether a value fits its stat, converts unambiguously, or is of the wrong type. */
export function statValueFit(
  stat: Pick<Stat, "type">,
  value: unknown
): StatValueFit {
  const reading = readStatValue(stat, value);
  if (!reading) return "wrongType";
  return reading.converted ? "converts" : "fits";
}

/** The value to use when a value doesn't fit: the stat's initial value read by type, else the editor's default. */
export function fallbackStatValue(
  stat: Pick<Stat, "type" | "initialValue">
): StatValue {
  return readStatValue(stat, stat.initialValue)?.value ?? defaultStatValue(stat.type);
}

/** A value checked against its stat: kept, converted, or replaced (see the rule above). */
export function checkStatValue(
  stat: Pick<Stat, "type" | "initialValue">,
  value: unknown
): { value: StatValue; kind?: "converted" | "replaced" } {
  const reading = readStatValue(stat, value);
  if (!reading) return { value: fallbackStatValue(stat), kind: "replaced" };
  return reading.converted
    ? { value: reading.value, kind: "converted" }
    : { value: reading.value };
}

/** One background's starting values checked against the story's player stats. */
export function checkBackgroundStatValues(
  playerStats: readonly Stat[],
  values: readonly StatValueEntry[] | undefined
): { values: StatValueEntry[]; fixes: StatValueFix[] } {
  const statsById = new Map(playerStats.map((stat) => [stat.id, stat]));
  const checked: StatValueEntry[] = [];
  const fixes: StatValueFix[] = [];
  (values ?? []).forEach((entry) => {
    const stat = statsById.get(entry.statId);
    if (!stat) {
      fixes.push({ statId: entry.statId, kind: "dropped" });
      return;
    }
    const result = checkStatValue(stat, entry.value);
    if (result.kind) {
      fixes.push({ statId: entry.statId, kind: result.kind });
      checked.push({ ...entry, value: result.value });
    } else {
      checked.push(entry);
    }
  });
  return { values: checked, fixes };
}

/** "1 converted, 1 dropped": the fixes counted by kind, for logs (no stat ids, which carry story words). */
export function countStatValueFixes(fixes: readonly StatValueFix[]): string {
  const kinds: StatValueFixKind[] = ["converted", "replaced", "dropped"];
  return kinds
    .map((kind) => [kind, fixes.filter((fix) => fix.kind === kind).length] as const)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${count} ${kind}`)
    .join(", ");
}

/**
 * Every background of the given seats checked against the player stats. A
 * seat or background with nothing to fix comes back as the same object.
 */
export function checkSeatBackgrounds<
  Seats extends Readonly<Record<string, PlayerOptionsGeneration | undefined>>
>(
  playerStats: readonly Stat[],
  seats: Seats
): { seats: Seats; fixed: BackgroundValueFixes[] } {
  const fixed: BackgroundValueFixes[] = [];
  const checkedSeats: Record<string, PlayerOptionsGeneration | undefined> = {};
  Object.entries(seats).forEach(([slot, options]) => {
    const backgrounds = options?.possibleCharacterBackgrounds;
    if (!options || !Array.isArray(backgrounds)) {
      checkedSeats[slot] = options;
      return;
    }
    let seatChanged = false;
    const checkedBackgrounds = backgrounds.map((background, index) => {
      const { values, fixes } = checkBackgroundStatValues(
        playerStats,
        background.initialPlayerStatValues
      );
      if (fixes.length === 0) return background;
      seatChanged = true;
      fixed.push({ slot, background: index, fixes });
      return { ...background, initialPlayerStatValues: values };
    });
    checkedSeats[slot] = seatChanged
      ? { ...options, possibleCharacterBackgrounds: checkedBackgrounds }
      : options;
  });
  return { seats: checkedSeats as Seats, fixed };
}

const SEAT_KEY = /^player\d+$/;

/**
 * A template's (or setup reply's) backgrounds checked against its player
 * stats: every seat stored under a `player<N>` key. Comes back as the same
 * object when nothing needs fixing.
 */
export function checkTemplateBackgrounds<
  Template extends { playerStats?: readonly Stat[] }
>(template: Template): { template: Template; fixed: BackgroundValueFixes[] } {
  const seats: Record<string, PlayerOptionsGeneration | undefined> =
    Object.fromEntries(
      Object.entries(template as Record<string, unknown>).filter(
        ([key, value]) => SEAT_KEY.test(key) && typeof value === "object"
      )
    ) as Record<string, PlayerOptionsGeneration | undefined>;
  const checked = checkSeatBackgrounds(template.playerStats ?? [], seats);
  return checked.fixed.length === 0
    ? { template, fixed: [] }
    : { template: { ...template, ...checked.seats }, fixed: checked.fixed };
}

/** A story state's character selection options checked against its player stats. */
export function checkStoryStateBackgrounds(
  state: StoryState
): { state: StoryState; fixed: BackgroundValueFixes[] } {
  const checked = checkSeatBackgrounds(
    state.playerStats ?? [],
    state.characterSelectionOptions ?? {}
  );
  return checked.fixed.length === 0
    ? { state, fixed: [] }
    : {
        state: { ...state, characterSelectionOptions: checked.seats },
        fixed: checked.fixed,
      };
}

/** "player2 background 1: 1 converted, 1 dropped; ...", for one log line (no stat ids or values). */
export function describeBackgroundFixes(
  fixed: readonly BackgroundValueFixes[]
): string {
  return fixed
    .map(
      ({ slot, background, fixes }) =>
        `${slot} background ${background}: ${countStatValueFixes(fixes)}`
    )
    .join("; ");
}
