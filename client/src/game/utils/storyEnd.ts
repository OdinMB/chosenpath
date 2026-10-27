import type {
  ClientStat,
  ClientStoryState,
  StatValue,
  StatValueEntry,
} from "core/types";

/** Where the closing card's buttons lead once the player leaves the story. */
export const STORY_END_EXITS = {
  myStories: "/users/my-stories",
  home: "/",
} as const;

export type EndStat = { id: string; name: string; value: string };
export type EndStatGroup = { group: string; stats: EndStat[] };

/** A share in percent, to one decimal at most. */
function percent(share: number): string {
  return `${Math.round(share * 10) / 10}%`;
}

function sidesOf(stat: Pick<ClientStat, "name">): [string, string] {
  const [first = "", second = ""] = stat.name.split("|").map((side) => side.trim());
  return [first, second];
}

/** A stat's name in words: an opposites stat's two sides with a slash between them. */
function plainStatName(stat: ClientStat): string {
  return stat.type === "opposites" ? sidesOf(stat).join(" / ") : stat.name;
}

/** A stat's value in words, as the closing card shows it. */
export function plainStatValue(
  stat: Pick<ClientStat, "type" | "name">,
  value: StatValue
): string {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : "None";
  }
  const share = numberOf(value);
  if (stat.type === "percentage" && share !== undefined) {
    return percent(share);
  }
  if (stat.type === "opposites" && share !== undefined) {
    const [first, second] = sidesOf(stat);
    return `${percent(share)} ${first}, ${percent(100 - share)} ${second}`;
  }
  const text = String(value).trim();
  return text === "" ? "None" : text;
}

/** A number, or a text that is one ("62"); undefined for anything else. */
function numberOf(value: number | string): number | undefined {
  if (typeof value === "number") return value;
  const text = value.trim();
  return text !== "" && Number.isFinite(Number(text)) ? Number(text) : undefined;
}

/**
 * The stats the player sees, with their values at the story's end: the
 * player's, then the shared ones, grouped as the sidebar groups them. A
 * stat without a value is left out rather than shown with a guessed one.
 */
export function endStatGroups(storyState: ClientStoryState): EndStatGroup[] {
  const ownSlot = Object.keys(storyState.players)[0];
  const ownValues = ownSlot ? storyState.players[ownSlot]?.statValues ?? [] : [];
  const valueOf = (statId: string): StatValue | undefined =>
    [...ownValues, ...storyState.sharedStatValues].find(
      (entry: StatValueEntry) => entry.statId === statId
    )?.value;

  const groups: EndStatGroup[] = [];
  for (const stat of [...storyState.playerStats, ...storyState.sharedStats]) {
    const value = valueOf(stat.id);
    if (stat.isVisible === false || value === undefined) continue;
    const name = stat.group || "Other";
    let group = groups.find((existing) => existing.group === name);
    if (!group) {
      group = { group: name, stats: [] };
      groups.push(group);
    }
    group.stats.push({
      id: stat.id,
      name: plainStatName(stat),
      value: plainStatValue(stat, value),
    });
  }
  return groups;
}
