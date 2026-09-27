import type { Story } from "core/models/Story.js";
import { Logger } from "shared/logger.js";

/*
 * What code changed in a model reply before the game kept it. The records
 * may name ids (for tests and the eval); the log line carries only counts,
 * because model-written ids carry story words.
 */

export type Repair = {
  /** What kind of repair, e.g. "statIdSeatForm"; the eval counts these as repair:<kind> */
  kind: string;
  /** Kept as written, only noted (e.g. a value its stat doesn't list): not a repair of the reply */
  note?: boolean;
  /** What was repaired, with ids: for tests and the eval, never logged */
  detail?: string;
};

/** The number of repairs and of notes per kind. */
export function repairCounts(repairs: Repair[]): {
  repairs: Record<string, number>;
  notes: Record<string, number>;
} {
  const counts = { repairs: {} as Record<string, number>, notes: {} as Record<string, number> };
  for (const repair of repairs) {
    const bucket = repair.note ? counts.notes : counts.repairs;
    bucket[repair.kind] = (bucket[repair.kind] ?? 0) + 1;
  }
  return counts;
}

/** One "[LLM] repair" line per reply: role, story, turn and the counts per kind. */
export function logRepairs(
  role: string,
  story: Story,
  repairs: Repair[],
  log: (line: string) => void = (line) => Logger.forService("LLM").log(line)
): void {
  if (repairs.length === 0) return;
  log(
    `repair ${JSON.stringify({
      role,
      storyId: story.getId(),
      turn: story.getCurrentTurn() + 1,
      ...repairCounts(repairs),
    })}`
  );
}
