import type { GameMode, ResolutionType } from "core/types";
import { contestsPlayable } from "core/utils/outcomeReadiness";

/*
 * An outcome's three possible resolutions, by kind, as the template editor
 * shows and edits them: challenge (favorable, unfavorable, mixed), contest
 * (side A wins, mixed, side B wins; side A is player1's side, or player1's
 * camp with three players) and exploration (three paths). The game resolves
 * each kind as core/types/outcome.ts defines it. Contested outcomes are
 * shared, and only competitive and cooperative-competitive stories with two
 * or more players play them: every such setup writes one.
 */

export type ResolutionKind = "challenge" | "contest" | "exploration";

export type ResolutionField = { field: string; label: string; placeholder: string };

export const RESOLUTION_KIND_LABELS: Record<ResolutionKind, string> = {
  challenge: "Challenge",
  contest: "Contest",
  exploration: "Exploration",
};

export const RESOLUTION_FIELDS: Record<ResolutionKind, ResolutionField[]> = {
  challenge: [
    { field: "favorable", label: "Favorable", placeholder: "Resolution that is favorable to the player(s)" },
    { field: "unfavorable", label: "Unfavorable", placeholder: "Resolution that is unfavorable for the player(s)" },
    { field: "mixed", label: "Mixed", placeholder: "Resolution for a mixed outcome" },
  ],
  contest: [
    { field: "sideAWins", label: "Side A wins", placeholder: "Side A (player1's side, or player1's camp) wins" },
    { field: "mixed", label: "Mixed", placeholder: "A draw or a compromise between the sides" },
    { field: "sideBWins", label: "Side B wins", placeholder: "Side B (the other side) wins" },
  ],
  exploration: [
    { field: "resolution1", label: "Resolution 1", placeholder: "First possible resolution" },
    { field: "resolution2", label: "Resolution 2", placeholder: "Second possible resolution" },
    { field: "resolution3", label: "Resolution 3", placeholder: "Third possible resolution" },
  ],
};

const KINDS: ResolutionKind[] = ["challenge", "contest", "exploration"];

/** The kind a set of resolutions belongs to: contest and exploration by their own fields, else challenge. */
export function resolutionKindOf(resolutions: ResolutionType): ResolutionKind {
  if ("sideAWins" in resolutions && "sideBWins" in resolutions) return "contest";
  if ("resolution1" in resolutions) return "exploration";
  return "challenge";
}

/** A kind's resolutions, every field empty. */
export function emptyResolutions(kind: ResolutionKind): ResolutionType {
  return Object.fromEntries(RESOLUTION_FIELDS[kind].map(({ field }) => [field, ""])) as ResolutionType;
}

/** The resolutions with one field set; a field that is not of their kind leaves them as they were. */
export function withResolutionField(resolutions: ResolutionType, field: string, value: string): ResolutionType {
  const kind = resolutionKindOf(resolutions);
  if (!RESOLUTION_FIELDS[kind].some((f) => f.field === field)) return { ...resolutions };
  return { ...resolutions, [field]: value } as ResolutionType;
}

/**
 * Whether a World's stories can play a contest: two or more players in a
 * competitive or cooperative-competitive World (the planners refuse a contest
 * anywhere else). `playerCountMax` decides, since the editor offers kinds for
 * the World as a whole; the validation card names the stories of a smaller
 * count that can't play them.
 */
export function worldPlaysContests(gameMode: GameMode | undefined, playerCountMax: number): boolean {
  return contestsPlayable(gameMode, playerCountMax);
}

/**
 * The kinds the editor offers: the contest kind where it is offered (a shared
 * outcome in a World that plays contests); elsewhere challenge and
 * exploration, the contest kind kept selectable only on an outcome that
 * already holds one.
 */
export function resolutionKindsFor(offerContest: boolean, resolutions: ResolutionType): ResolutionKind[] {
  const current = resolutionKindOf(resolutions);
  return KINDS.filter((kind) => kind !== "contest" || offerContest || current === "contest");
}
