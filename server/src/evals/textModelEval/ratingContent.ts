import type { StoryState } from "core/types/index.js";
import { playerParagraphs } from "./playerText.js";

/*
 * What a rater sees of one output: a setup as its whole design (everything
 * the game reads from the reply; the character-selection plan is the model's
 * scratch and is left out), and a turn as each player's visible beat (title,
 * text, options, interludes); the context above a turn is ratingContext.ts.
 * Read defensively, since later schema variants may drop fields: an absent
 * field is undefined (or "") and renders nothing, a list present but empty
 * is [] and renders as empty.
 */

/**
 * Every fixed string a setup card shows. They go into the page's field
 * labels, so the blinding word check reads each one.
 */
export const SETUP_FIELD_LABELS = {
  difficulty: "Difficulty",
  modifier: "modifier",
  teaser: "Teaser",
  characterSelection: "Character selection",
  guidelines: "Guidelines",
  world: "World",
  rules: "World rules",
  tone: "Tone",
  conflicts: "Conflicts",
  decisions: "Decisions",
  typesOfThreads: "Types of threads",
  switchAndThreadInstructions: "Switch and thread instructions",
  sharedOutcomes: "Shared outcomes",
  outcomes: "Outcomes",
  resonance: "Resonance",
  resolutions: "Possible resolutions",
  favorable: "Favorable",
  unfavorable: "Unfavorable",
  mixed: "Mixed",
  sideAWins: "Side A wins",
  sideBWins: "Side B wins",
  resolution1: "Resolution 1",
  resolution2: "Resolution 2",
  resolution3: "Resolution 3",
  intendedMilestones: "Intended milestones",
  milestones: "Milestones",
  stats: "Stats",
  statGroups: "Stat groups",
  sharedStats: "Shared stats",
  playerStats: "Player stats",
  type: "Type",
  group: "Group",
  isVisible: "Visible to players",
  partOfPlayerBackgrounds: "Set by background",
  canBeChangedInBeatResolutions: "Can change in beat resolutions",
  tooltip: "Tooltip",
  initialValue: "Initial value",
  possibleValues: "Possible values",
  effectOnPoints: "Effect on points",
  narrativeImplications: "Narrative implications",
  adjustmentsAfterThreads: "Adjustments after threads",
  optionsToSacrifice: "Can be sacrificed",
  optionsToGainAsReward: "Can be gained as reward",
  storyElements: "Story elements",
  role: "Role",
  instructions: "Instructions",
  appearance: "Appearance",
  facts: "Facts",
  player: "Player",
  identities: "Identities",
  backgrounds: "Backgrounds",
  startingStats: "Starting stats",
  notAPlayerStat: "not a player stat",
  imageInstructions: "Image instructions",
  visualStyle: "Visual style",
  atmosphere: "Atmosphere",
  colorPalette: "Color palette",
  settingDetails: "Setting details",
  characterStyle: "Character style",
  artInfluences: "Art influences",
  coverPrompt: "Cover prompt",
  empty: "(empty)",
  yes: "yes",
  no: "no",
} as const;

/** Every fixed string a turn option shows; they join the page's field labels likewise. */
export const TURN_FIELD_LABELS = {
  forPlayer: "For",
  title: "Title",
  text: "Text",
  options: "Options",
  interludes: "Interludes",
} as const;

export const IMAGE_KEYS = ["visualStyle", "atmosphere", "colorPalette", "settingDetails", "characterStyle", "artInfluences", "coverPrompt"] as const;

export type SetupStat = {
  id: string;
  name: string;
  type: string;
  group: string;
  tooltip: string;
  /** The value's items: one for a number or string, the list for string[] */
  initialValue?: string[];
  possibleValues: string;
  isVisible?: boolean;
  partOfPlayerBackgrounds?: boolean;
  canBeChangedInBeatResolutions?: boolean;
  effectOnPoints?: string[];
  narrativeImplications?: string[];
  adjustmentsAfterThreads?: string[];
  optionsToSacrifice: string;
  optionsToGainAsReward: string;
};

export type SetupOutcome = {
  id: string;
  question: string;
  resonance: string;
  /** In the reply's order; key is favorable, sideAWins, resolution1 and so on */
  resolutions: { key: string; text: string }[];
  intendedNumberOfMilestones: string;
  milestones?: string[];
};

export type SetupElement = { id: string; name: string; role: string; instructions: string; appearance: string; facts?: string[] };

export type SetupBackground = {
  title: string;
  fluffTemplate: string;
  /** stat is the player stat's name, or the reply's id when no player stat has it */
  initialStats?: { stat: string; known: boolean; value?: string[] }[];
};

export type SetupPlayer = {
  slot: string;
  outcomes?: SetupOutcome[];
  identities?: { name: string; pronouns: string; appearance: string }[];
  backgrounds?: SetupBackground[];
};

export type SetupCard = {
  kind: "setup";
  title: string;
  /** Template setups only */
  teaser: string;
  introduction: { title: string; text: string };
  /** One level for a custom story, several for a template */
  difficulty: { title: string; modifier: string }[];
  guidelines: {
    world: string;
    rules?: string[];
    tone?: string[];
    conflicts?: string[];
    decisions?: string[];
    typesOfThreads?: string[];
    switchAndThreadInstructions?: string[];
  };
  sharedOutcomes?: SetupOutcome[];
  statGroups?: string[];
  sharedStats?: SetupStat[];
  playerStats?: SetupStat[];
  storyElements?: SetupElement[];
  players: SetupPlayer[];
  imageInstructions: { key: (typeof IMAGE_KEYS)[number]; text: string }[];
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

/** A key of an object, undefined for anything else. */
export function field(value: unknown, key: string): unknown {
  return value && typeof value === "object" && key in value ? (value as Record<string, unknown>)[key] : undefined;
}

/** A scalar as text, a list joined with commas, "" for anything else. */
export function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(text).join(", ");
  return "";
}

export function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** A list's non-empty items as text. */
export function strings(value: unknown): string[] {
  return list(value).map(text).filter((s) => s.length > 0);
}

/** A list field or stat value: undefined when absent, [] when present but empty; a scalar is one item. */
function items(value: unknown): string[] | undefined {
  if (value === undefined || value === null || (typeof value === "object" && !Array.isArray(value))) return undefined;
  if (Array.isArray(value)) return strings(value);
  const single = text(value);
  return single ? [single] : [];
}

/** An array of objects: undefined when absent. */
function objects(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function flag(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function signed(value: unknown): string {
  return typeof value === "number" && value > 0 ? `+${value}` : text(value);
}

function setupStat(s: unknown): SetupStat {
  return {
    id: text(field(s, "id")),
    name: text(field(s, "name")),
    type: text(field(s, "type")),
    group: text(field(s, "group")),
    tooltip: text(field(s, "tooltip")),
    initialValue: items(field(s, "initialValue")),
    possibleValues: text(field(s, "possibleValues")),
    isVisible: flag(field(s, "isVisible")),
    partOfPlayerBackgrounds: flag(field(s, "partOfPlayerBackgrounds")),
    canBeChangedInBeatResolutions: flag(field(s, "canBeChangedInBeatResolutions")),
    effectOnPoints: items(field(s, "effectOnPoints")),
    narrativeImplications: items(field(s, "narrativeImplications")),
    adjustmentsAfterThreads: items(field(s, "adjustmentsAfterThreads")),
    optionsToSacrifice: text(field(s, "optionsToSacrifice")),
    optionsToGainAsReward: text(field(s, "optionsToGainAsReward")),
  };
}

function setupOutcome(o: unknown): SetupOutcome {
  const resolutions = field(o, "possibleResolutions");
  return {
    id: text(field(o, "id")),
    question: text(field(o, "question")),
    resonance: text(field(o, "resonance")),
    resolutions:
      resolutions && typeof resolutions === "object" && !Array.isArray(resolutions)
        ? Object.entries(resolutions)
            .map(([key, value]) => ({ key, text: text(value) }))
            .filter((r) => r.text.length > 0)
        : [],
    intendedNumberOfMilestones: text(field(o, "intendedNumberOfMilestones")),
    milestones: items(field(o, "milestones")),
  };
}

function setupElement(el: unknown): SetupElement {
  return {
    id: text(field(el, "id")),
    name: text(field(el, "name")),
    role: text(field(el, "role")),
    instructions: text(field(el, "instructions")),
    appearance: text(field(el, "appearance")),
    facts: items(field(el, "facts")),
  };
}

function pronouns(value: unknown): string {
  return ["personal", "object", "possessive", "reflexive"]
    .map((key) => text(field(value, key)))
    .filter(Boolean)
    .join("/");
}

function setupPlayer(slot: string, options: unknown, playerStatNames: Map<string, string>): SetupPlayer {
  return {
    slot,
    outcomes: objects(field(options, "outcomes"))?.map(setupOutcome),
    identities: objects(field(options, "possibleCharacterIdentities"))?.map((i) => ({
      name: text(field(i, "name")),
      pronouns: pronouns(field(i, "pronouns")),
      appearance: text(field(i, "appearance")),
    })),
    backgrounds: objects(field(options, "possibleCharacterBackgrounds"))?.map((b) => ({
      title: text(field(b, "title")),
      fluffTemplate: text(field(b, "fluffTemplate")),
      initialStats: objects(field(b, "initialPlayerStatValues"))?.map((entry) => {
        const id = text(field(entry, "statId"));
        const name = playerStatNames.get(id);
        return { stat: name || id, known: name !== undefined, value: items(field(entry, "value")) };
      }),
    })),
  };
}

function difficultyLevels(output: unknown): SetupCard["difficulty"] {
  const several = objects(field(output, "difficultyLevels"));
  const one = field(output, "difficultyLevel");
  return (several ?? (one === undefined ? [] : [one]))
    .map((level) => ({ title: text(field(level, "title")), modifier: signed(field(level, "modifier")) }))
    .filter((level) => level.title || level.modifier);
}

/** The paragraphs a player sees; image tags become a muted "[picture: desc]". */
export function withPictureNotes(beatText: string): string[] {
  return playerParagraphs(beatText).map((p) =>
    p.replace(/\[image\s+[^\]]*?desc="([^"]*)"[^\]]*\]/g, "[picture: $1]").replace(/\[image\s+[^\]]*\]/g, "[picture]")
  );
}

/** The whole setup design the game reads; the character-selection plan (model scratch) is left out. */
export function setupCard(output: unknown): SetupCard {
  const guidelines = field(output, "guidelines");
  const intro = field(output, "characterSelectionIntroduction");
  const images = field(output, "imageInstructions");
  const playerStats = objects(field(output, "playerStats"));
  const playerStatNames = new Map(
    (playerStats ?? []).map((s) => [text(field(s, "id")), text(field(s, "name"))] as const).filter(([id]) => id.length > 0)
  );
  const players = Object.keys(output && typeof output === "object" ? output : {})
    .filter((key) => /^player\d+$/.test(key))
    .sort((a, b) => Number(a.slice(6)) - Number(b.slice(6)))
    .map((slot) => setupPlayer(slot, field(output, slot), playerStatNames));
  return {
    kind: "setup",
    title: text(field(output, "title")),
    teaser: text(field(output, "teaser")),
    introduction: { title: text(field(intro, "title")), text: text(field(intro, "text")) },
    difficulty: difficultyLevels(output),
    guidelines: {
      world: text(field(guidelines, "world")),
      rules: items(field(guidelines, "rules")),
      tone: items(field(guidelines, "tone")),
      conflicts: items(field(guidelines, "conflicts")),
      decisions: items(field(guidelines, "decisions")),
      typesOfThreads: items(field(guidelines, "typesOfThreads")),
      switchAndThreadInstructions: items(field(guidelines, "switchAndThreadInstructions")),
    },
    sharedOutcomes: objects(field(output, "sharedOutcomes"))?.map(setupOutcome),
    statGroups: items(field(output, "statGroups")),
    sharedStats: objects(field(output, "sharedStats"))?.map(setupStat),
    playerStats: playerStats?.map(setupStat),
    storyElements: objects(field(output, "storyElements"))?.map(setupElement),
    players,
    imageInstructions: IMAGE_KEYS.map((key) => ({ key, text: text(field(images, key)) })).filter((i) => i.text.length > 0),
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
