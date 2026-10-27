import type { Beat, ClientStat, OptionRiskType, PaidLever } from "core/types";

/*
 * The player's path through a story, turn by turn, for the recap at its end.
 * It reads only what the player's own beats already hold: the beat a choice
 * was made on, the option chosen, how a challenge's roll came out, and the
 * sacrifice or reward the next turn paid for it (Beat.paidLever).
 */

/** How a challenge's roll came out. */
export type PathResult = "favorable" | "mixed" | "unfavorable";

/** A sacrifice paid or a reward gained for a choice, on a stat the player can see. */
export type PathLever = {
  kind: PaidLever["kind"];
  /** The stat's name, an opposites stat's two sides joined by " / ". */
  stat: string;
  /** The change, signed ("-15", "+10"), where the stat is a number or a percentage. */
  change?: string;
};

export type PathStep = {
  /** The turn, counted from the story's first beat. */
  turn: number;
  /** The title of the beat the choice was made on. */
  beatTitle: string;
  /** The option chosen, as the player saw it. */
  choice: string;
  /** A challenge rolls for its result; an exploration picks a direction, with no roll. */
  kind: "challenge" | "exploration";
  result?: PathResult;
  risk?: OptionRiskType;
  lever?: PathLever;
};

type PathStat = Pick<ClientStat, "id" | "name" | "type">;

/** The stats a client story state carries: the visible ones only. */
export type PathStats = { playerStats: PathStat[]; sharedStats: PathStat[] };

const ROLL_RESULTS: readonly PathResult[] = ["favorable", "mixed", "unfavorable"];

/** Stats whose change reads as a number; a ladder's moves by rungs and a list's by items. */
const COUNTED_STAT_TYPES: ReadonlySet<PathStat["type"]> = new Set(["number", "percentage"]);

function signed(step: number): string {
  return step > 0 ? `+${step}` : String(step);
}

function leverOf(paid: PaidLever | undefined, stats: PathStats): PathLever | undefined {
  if (!paid) return undefined;
  const pool = paid.group === "shared" ? stats.sharedStats : stats.playerStats;
  const stat = pool.find((candidate) => candidate.id === paid.stat);
  if (!stat) return undefined;
  const name = stat.type === "opposites" ? stat.name.split("|").join(" / ") : stat.name;
  return COUNTED_STAT_TYPES.has(stat.type)
    ? { kind: paid.kind, stat: name, change: signed(paid.step) }
    : { kind: paid.kind, stat: name };
}

/**
 * One step per turn the player chose on, in order; the latest beat, without a
 * choice (the ending), adds none, nor does a choice that names no option.
 */
export function storyPath(beats: Beat[], stats: PathStats): PathStep[] {
  return beats.flatMap((beat, index): PathStep[] => {
    const option = beat.choice >= 0 ? beat.options[beat.choice] : undefined;
    if (!option) return [];
    const lever = leverOf(beats[index + 1]?.paidLever, stats);
    const step: PathStep = {
      turn: index + 1,
      beatTitle: beat.title,
      choice: option.text,
      kind: option.optionType === "challenge" ? "challenge" : "exploration",
      ...(lever ? { lever } : {}),
    };
    if (option.optionType !== "challenge") return [step];
    const result = ROLL_RESULTS.find((candidate) => candidate === beat.resolution);
    return [{ ...step, risk: option.riskType, ...(result ? { result } : {}) }];
  });
}
