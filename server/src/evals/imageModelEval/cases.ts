import fs from "fs";
import path from "path";
import { Story } from "core/models/Story.js";
import type {
  CharacterIdentity,
  ImageInstructions,
  ImageReference,
  ImageRequest,
  StoryState,
  StoryTemplate,
} from "core/types/index.js";
import { getReferenceImagePath } from "../../images/openaiImageClient.js";
import {
  getImagePrompt,
  getStoryPlayerPortraitDescription,
  getTemplateCoverPrompt,
  getTemplatePlayerPortraitPrompt,
} from "../../images/imagePrompts.js";
import { containsLeak } from "./blinding.js";

/*
 * Reads local story and template files (read-only) and builds the eval cases
 * with the app's own prompt builders. Never touches a database.
 */

export type CallSite =
  | "beat"
  | "story-cover"
  | "story-portrait"
  | "template-cover"
  | "template-portrait";

export type EvalReference = {
  reference: ImageReference;
  /** Absolute path of the stored reference file */
  path: string;
  /** What the rater is told the reference shows */
  alt: string;
};

export type EvalCase = {
  id: string;
  callSite: CallSite;
  /** The full prompt sent to the image model, built exactly as production does */
  prompt: string;
  references: EvalReference[];
  /** The scene, cover or character text shown to the rater */
  description: string;
  /** The story's style notes shown to the rater (markdown list) */
  styleNotes: string;
};

export type BeatCandidate = {
  storyId: string;
  /** Template id, or "story:<id>" for custom stories */
  groupKey: string;
  fileName: string;
  fromStoryJson: boolean;
  requestId: string;
  beatIndex: number;
  scene: string;
  prompt: string;
  styleNotes: string;
  /** null when a reference could not be resolved from the story state */
  references: EvalReference[] | null;
};

export const BEAT_ITEM_COUNT = 12;
export const BEAT_RESERVE_COUNT = 3;

const STORY_FILE = "story.json";

function formatStyleNotes(instructions: ImageInstructions | undefined): string {
  if (!instructions) {
    return "- none given";
  }
  const lines = [
    ["Visual style", instructions.visualStyle],
    ["Atmosphere", instructions.atmosphere],
    ["Color palette", instructions.colorPalette],
    ["Character style", instructions.characterStyle],
  ]
    .filter(([, value]) => Boolean(value))
    .map(([label, value]) => `- ${label}: ${value}`);
  return lines.length > 0 ? lines.join("\n") : "- none given";
}

function referenceAlt(state: StoryState, imageId: string): string {
  if (imageId.startsWith("player")) {
    const player = Object.entries(state.players).find(
      ([slot]) => slot === imageId
    )?.[1];
    return `Player character (${player?.name || imageId})`;
  }
  const element = state.storyElements?.find((e) => e.id === imageId);
  if (element?.name) {
    return element.name;
  }
  const image = state.images?.find((i) => i.id === imageId);
  return image?.description || imageId;
}

function resolveReferences(
  story: Story,
  state: StoryState,
  imageIds: string[]
): EvalReference[] | null {
  try {
    return imageIds.map((imageId) => {
      const reference = story.getImageReferenceFromImageId(imageId);
      if (!reference) {
        throw new Error(`Image ${imageId} is not in the story's library`);
      }
      return {
        reference,
        path: getReferenceImagePath(reference),
        alt: referenceAlt(state, imageId),
      };
    });
  } catch {
    return null;
  }
}

function listStoryFiles(storyDir: string): string[] {
  const files = fs.readdirSync(storyDir);
  const pregenerations = files
    .filter((f) => f.startsWith("pregeneration_") && f.endsWith(".json"))
    .sort();
  return files.includes(STORY_FILE)
    ? [STORY_FILE, ...pregenerations]
    : pregenerations;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function isImageRequest(value: unknown): value is ImageRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "prompt" in value &&
    typeof value.prompt === "string" &&
    value.prompt.length > 0
  );
}

function candidatesFromState(
  state: StoryState,
  fileName: string
): BeatCandidate[] {
  const story = new Story(state);
  const styleNotes = formatStyleNotes(state.imageInstructions);
  const candidates: BeatCandidate[] = [];

  for (const player of Object.values(state.players ?? {})) {
    (player?.beatHistory ?? []).forEach((beat, beatIndex) => {
      const request: unknown = beat.imageRequest;
      if (!isImageRequest(request)) {
        return;
      }
      candidates.push({
        storyId: state.id,
        groupKey: state.templateId ?? `story:${state.id}`,
        fileName,
        fromStoryJson: fileName === STORY_FILE,
        requestId: request.id,
        beatIndex,
        scene: request.prompt,
        prompt: getImagePrompt(request.prompt, story.getImageInstructions()),
        styleNotes,
        references: resolveReferences(
          story,
          state,
          request.referenceImageIds ?? []
        ),
      });
    });
  }
  return candidates;
}

/**
 * Every stored beat image request in story.json and pregeneration_*.json files.
 */
export function loadBeatCandidates(storiesDir: string): BeatCandidate[] {
  const candidates: BeatCandidate[] = [];
  for (const storyId of fs.readdirSync(storiesDir).sort()) {
    const storyDir = path.join(storiesDir, storyId);
    if (!fs.statSync(storyDir).isDirectory()) {
      continue;
    }
    for (const fileName of listStoryFiles(storyDir)) {
      const state = readJson<StoryState>(path.join(storyDir, fileName));
      candidates.push(...candidatesFromState(state, fileName));
    }
  }
  return candidates;
}

/** story.json of every story (pregenerations excluded). */
export function loadStoryStates(storiesDir: string): StoryState[] {
  return fs
    .readdirSync(storiesDir)
    .sort()
    .map((storyId) => path.join(storiesDir, storyId, STORY_FILE))
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => readJson<StoryState>(filePath));
}

export function loadTemplates(templatesDir: string): StoryTemplate[] {
  return fs
    .readdirSync(templatesDir)
    .sort()
    .map((templateId) => path.join(templatesDir, templateId, "template.json"))
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => readJson<StoryTemplate>(filePath));
}

function isRaterSafe(candidate: BeatCandidate): boolean {
  const visible = [
    candidate.scene,
    candidate.styleNotes,
    ...(candidate.references ?? []).map((r) => r.alt),
  ];
  return !visible.some((text) => containsLeak(text));
}

function referenceSetKey(candidate: BeatCandidate): string {
  return (candidate.references ?? [])
    .map((r) => r.path)
    .sort()
    .join("|");
}

function compareWithinGroup(a: BeatCandidate, b: BeatCandidate): number {
  const aPlayer = (a.references ?? []).some((r) => r.reference.subDirectory === "players");
  const bPlayer = (b.references ?? []).some((r) => r.reference.subDirectory === "players");
  return (
    Number(bPlayer) - Number(aPlayer) ||
    Number(b.fromStoryJson) - Number(a.fromStoryJson) ||
    a.storyId.localeCompare(b.storyId) ||
    a.fileName.localeCompare(b.fileName) ||
    a.beatIndex - b.beatIndex ||
    a.requestId.localeCompare(b.requestId)
  );
}

function dedupe(candidates: BeatCandidate[]): BeatCandidate[] {
  const byKey = new Map<string, BeatCandidate>();
  const ordered = [...candidates].sort(
    (a, b) =>
      Number(b.fromStoryJson) - Number(a.fromStoryJson) ||
      a.fileName.localeCompare(b.fileName)
  );
  for (const candidate of ordered) {
    const key = `${candidate.storyId}|${candidate.requestId}`;
    if (!byKey.has(key)) {
      byKey.set(key, candidate);
    }
  }
  return [...byKey.values()];
}

/**
 * Orders a group so that no reference set repeats before every distinct
 * reference set in the group has been used once.
 */
function spreadReferenceSets(group: BeatCandidate[]): BeatCandidate[] {
  const seen = new Map<string, number>();
  const ranked = [...group].sort(compareWithinGroup).map((candidate, order) => {
    const key = referenceSetKey(candidate);
    const rank = seen.get(key) ?? 0;
    seen.set(key, rank + 1);
    return { candidate, rank, order };
  });
  return ranked
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .map((entry) => entry.candidate);
}

/**
 * Picks beat cases round-robin across templates (or custom stories), after
 * dropping duplicates, cases with a missing reference and cases whose
 * rater-visible text would reveal a model. Pure: file checks go through
 * the fileExists predicate.
 */
export function selectBeatCases(
  candidates: BeatCandidate[],
  options: {
    fileExists: (filePath: string) => boolean;
    count?: number;
    reserveCount?: number;
  }
): { selected: BeatCandidate[]; reserves: BeatCandidate[] } {
  const count = options.count ?? BEAT_ITEM_COUNT;
  const reserveCount = options.reserveCount ?? BEAT_RESERVE_COUNT;

  const usable = dedupe(candidates).filter(
    (c) =>
      c.references !== null &&
      c.references.every((r) => options.fileExists(r.path)) &&
      isRaterSafe(c)
  );

  const groups = new Map<string, BeatCandidate[]>();
  for (const candidate of usable) {
    groups.set(candidate.groupKey, [
      ...(groups.get(candidate.groupKey) ?? []),
      candidate,
    ]);
  }
  const queues = [...groups.keys()]
    .sort()
    .map((key) => spreadReferenceSets(groups.get(key) ?? []));

  const picked: BeatCandidate[] = [];
  for (let round = 0; picked.length < count + reserveCount; round++) {
    const roundPicks = queues
      .map((queue) => queue[round])
      .filter((c): c is BeatCandidate => c !== undefined);
    if (roundPicks.length === 0) {
      break;
    }
    picked.push(...roundPicks);
  }
  const limited = picked.slice(0, count + reserveCount);
  return { selected: limited.slice(0, count), reserves: limited.slice(count) };
}

export function beatCaseFrom(candidate: BeatCandidate): EvalCase {
  return {
    id: `beat:${candidate.storyId.slice(0, 8)}:${candidate.requestId}`,
    callSite: "beat",
    prompt: candidate.prompt,
    references: candidate.references ?? [],
    description: candidate.scene,
    styleNotes: candidate.styleNotes,
  };
}

function firstIdentity(
  identities: CharacterIdentity[] | undefined
): CharacterIdentity | undefined {
  return identities?.[0];
}

/**
 * Mirrors how the template editor builds the portrait appearance string
 * (client/src/resources/templates/hooks/useImageGeneration.ts:231-237).
 */
function templatePortraitAppearance(identity: CharacterIdentity): string {
  return identity.name
    ? `${identity.name}${
        identity.pronouns.personal
          ? ` (${identity.pronouns.personal}/${identity.pronouns.object})`
          : ""
      }: ${identity.appearance}`
    : identity.appearance;
}

function storyCoverCase(story: StoryState): EvalCase | undefined {
  const coverPrompt = story.imageInstructions.coverPrompt;
  const styleNotes = formatStyleNotes(story.imageInstructions);
  if (containsLeak(coverPrompt) || containsLeak(styleNotes)) {
    return undefined;
  }
  return {
    id: `story-cover:${story.id.slice(0, 8)}`,
    callSite: "story-cover",
    prompt: getImagePrompt(coverPrompt, story.imageInstructions),
    references: [],
    description: coverPrompt,
    styleNotes,
  };
}

function storyPortraitCase(story: StoryState): EvalCase | undefined {
  const identity = firstIdentity(
    story.characterSelectionOptions?.player1?.possibleCharacterIdentities
  );
  if (!identity) {
    return undefined;
  }
  const description = getStoryPlayerPortraitDescription(identity);
  const styleNotes = formatStyleNotes(story.imageInstructions);
  if (containsLeak(description) || containsLeak(styleNotes)) {
    return undefined;
  }
  return {
    id: `story-portrait:${story.id.slice(0, 8)}`,
    callSite: "story-portrait",
    prompt: getImagePrompt(description, story.imageInstructions),
    references: [],
    description,
    styleNotes,
  };
}

function templateCoverCase(template: StoryTemplate): EvalCase | undefined {
  const coverPrompt = template.imageInstructions?.coverPrompt;
  const styleNotes = formatStyleNotes(template.imageInstructions);
  if (!coverPrompt || containsLeak(coverPrompt) || containsLeak(styleNotes)) {
    return undefined;
  }
  return {
    id: `template-cover:${template.id.slice(0, 8)}`,
    callSite: "template-cover",
    prompt: getTemplateCoverPrompt(coverPrompt, template.imageInstructions),
    references: [],
    description: coverPrompt,
    styleNotes,
  };
}

function templatePortraitCase(template: StoryTemplate): EvalCase | undefined {
  const identity = firstIdentity(template.player1?.possibleCharacterIdentities);
  if (!identity) {
    return undefined;
  }
  const appearance = templatePortraitAppearance(identity);
  const styleNotes = formatStyleNotes(template.imageInstructions);
  if (containsLeak(appearance) || containsLeak(styleNotes)) {
    return undefined;
  }
  return {
    id: `template-portrait:${template.id.slice(0, 8)}`,
    callSite: "template-portrait",
    prompt: getTemplatePlayerPortraitPrompt(
      appearance,
      template.imageInstructions
    ),
    references: [],
    description: appearance,
    styleNotes,
  };
}

/** The first `count` cases the builder accepts, walking sources in order. */
function takeCases<T>(
  sources: T[],
  build: (source: T) => EvalCase | undefined,
  count: number
): { cases: EvalCase[]; nextIndex: number } {
  const cases: EvalCase[] = [];
  let index = 0;
  for (; index < sources.length && cases.length < count; index++) {
    const evalCase = build(sources[index]);
    if (evalCase) {
      cases.push(evalCase);
    }
  }
  return { cases, nextIndex: index };
}

/**
 * Two custom-story covers, then one custom-story player portrait from the
 * next such story; one template cover, then one template player portrait from
 * the next template. Stories and templates are walked in sorted-id order and
 * skipped when their rater-visible text would leak.
 */
export function buildCoverPortraitCases(
  stories: StoryState[],
  templates: StoryTemplate[]
): EvalCase[] {
  const customStories = stories
    .filter((s) => !s.templateId && Boolean(s.imageInstructions?.coverPrompt))
    .sort((a, b) => a.id.localeCompare(b.id));
  const covers = takeCases(customStories, storyCoverCase, 2);
  const portrait = takeCases(
    customStories.slice(covers.nextIndex),
    storyPortraitCase,
    1
  );

  const sortedTemplates = [...templates].sort((a, b) =>
    a.id.localeCompare(b.id)
  );
  const templateCover = takeCases(sortedTemplates, templateCoverCase, 1);
  const templatePortrait = takeCases(
    sortedTemplates.slice(templateCover.nextIndex),
    templatePortraitCase,
    1
  );

  const cases = [
    ...covers.cases,
    ...portrait.cases,
    ...templateCover.cases,
    ...templatePortrait.cases,
  ];
  if (cases.length < 5) {
    throw new Error(
      `Only ${cases.length} of 5 cover/portrait cases could be built from local data`
    );
  }
  return cases;
}
