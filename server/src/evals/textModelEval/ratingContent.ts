import type { StoryState } from "core/types/index.js";

/*
 * What a rater sees of one output: a setup as a one-page story card, a turn
 * as each player's visible beat (title, text, options, interludes), and the
 * turn's context (previous beat, chosen option and outcome, relevant stats).
 * Only player-visible fields; read defensively, since later schema variants
 * may drop planning fields.
 */

export type SetupCard = {
  kind: "setup";
  title: string;
  introduction: { title: string; text: string };
  world: { world: string; tone: string[]; conflicts: string[] };
  elements: { name: string; description: string }[];
  sharedStats: { name: string; description: string; initial: string }[];
  playerStats: { name: string; description: string }[];
  players: { slot: string; identities: { name: string; description: string }[]; backgrounds: { title: string; description: string }[] }[];
};

export type TurnBeat = {
  slot: string;
  playerName: string;
  title: string;
  paragraphs: string[];
  options: string[];
  interludes: string[];
};

export type TurnContent = { kind: "turn"; beats: TurnBeat[] };

export type OptionContent = SetupCard | TurnContent;

export type ContextSection = { heading: string; lines: string[] };

function field(value: unknown, key: string): unknown {
  return value && typeof value === "object" && key in value ? (value as Record<string, unknown>)[key] : undefined;
}

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(text).join(", ");
  return "";
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function strings(value: unknown): string[] {
  return list(value).map(text).filter((s) => s.length > 0);
}

/** Image tags become a muted "[picture: desc]"; the paragraph stays. */
export function withPictureNotes(beatText: string): string[] {
  return beatText
    .replace(/\[image\s+[^\]]*?desc="([^"]*)"[^\]]*\]/g, "[picture: $1]")
    .replace(/\[image\s+[^\]]*\]/g, "[picture]")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export function setupCard(output: unknown): SetupCard {
  const guidelines = field(output, "guidelines");
  const intro = field(output, "characterSelectionIntroduction");
  const players = Object.keys(output && typeof output === "object" ? output : {})
    .filter((key) => /^player\d+$/.test(key))
    .sort()
    .map((slot) => {
      const options = field(output, slot);
      return {
        slot,
        identities: list(field(options, "possibleCharacterIdentities")).map((i) => ({
          name: text(field(i, "name")),
          description: text(field(i, "appearance")),
        })),
        backgrounds: list(field(options, "possibleCharacterBackgrounds")).map((b) => ({
          title: text(field(b, "title")),
          description: text(field(b, "fluffTemplate")),
        })),
      };
    });
  return {
    kind: "setup",
    title: text(field(output, "title")),
    introduction: { title: text(field(intro, "title")), text: text(field(intro, "text")) },
    world: {
      world: text(field(guidelines, "world")),
      tone: strings(field(guidelines, "tone")),
      conflicts: strings(field(guidelines, "conflicts")),
    },
    elements: list(field(output, "storyElements")).map((e) => ({
      name: text(field(e, "name")),
      description: text(field(e, "role")),
    })),
    sharedStats: list(field(output, "sharedStats")).map((s) => ({
      name: text(field(s, "name")),
      description: text(field(s, "tooltip")),
      initial: text(field(s, "initialValue")),
    })),
    playerStats: list(field(output, "playerStats")).map((s) => ({
      name: text(field(s, "name")),
      description: text(field(s, "tooltip")),
    })),
    players,
  };
}

export function turnContent(output: unknown, state: StoryState): TurnContent {
  const beats = Object.keys(state.players)
    .sort()
    .map((slot) => {
      const beat = field(output, slot);
      return {
        slot,
        playerName: state.players[slot]?.name ?? slot,
        title: text(field(beat, "title")),
        paragraphs: withPictureNotes(text(field(beat, "text"))),
        options: list(field(beat, "options")).map((o) => text(field(o, "text"))),
        interludes: list(field(beat, "interludes")).map((i) => text(field(i, "text"))),
      };
    });
  return { kind: "turn", beats };
}

const OUTCOME_WORDS: Record<string, string> = {
  favorable: "it went well",
  mixed: "it went partly well",
  unfavorable: "it went badly",
  sideAWins: "side A won the round",
  sideBWins: "side B won the round",
};

function statLines(state: StoryState, slot: string): string[] {
  const shared = state.sharedStats.map((stat) => {
    const value = state.sharedStatValues.find((v) => v.statId === stat.id)?.value;
    return `${stat.name}: ${text(value)}`;
  });
  const player = state.players[slot];
  const own = state.playerStats.map((stat) => {
    const value = player?.statValues.find((v) => v.statId === stat.id)?.value;
    return `${stat.name}: ${text(value)}`;
  });
  return [...shared, ...own].filter((line) => !line.endsWith(": "));
}

/** The context shown above a turn's options: what happened just before, per player. */
export function turnContext(state: StoryState): ContextSection[] {
  const turn = Object.values(state.players)[0]?.beatHistory.length ?? 0;
  if (turn === 0) {
    return [
      { heading: "Introduction", lines: [state.characterSelectionIntroduction?.title ?? "", state.characterSelectionIntroduction?.text ?? ""].filter(Boolean) },
      {
        heading: "Chosen characters",
        lines: Object.entries(state.players).map(([slot, p]) => `${slot}: ${p.name}${p.fluff ? `, ${p.fluff}` : ""}`),
      },
    ];
  }
  const entries = Object.entries(state.players);
  return entries.map(([slot, player], index) => {
    const beat = player.beatHistory[turn - 1];
    const chosen = beat && beat.choice >= 0 ? beat.options[beat.choice]?.text : undefined;
    const outcome = beat?.resolution ? OUTCOME_WORDS[beat.resolution] : undefined;
    return {
      // Headings are fixed text: names are narrative and go in the lines
      heading: entries.length > 1 ? `Before this turn: player ${index + 1}` : "Before this turn",
      lines: [
        `Character: ${player.name || slot}`,
        beat ? `Previous beat: ${beat.summary}` : "",
        chosen ? `Chosen: ${chosen}` : "",
        outcome ? `Outcome: ${outcome}` : "",
        ...statLines(state, slot),
      ].filter(Boolean),
    };
  });
}
