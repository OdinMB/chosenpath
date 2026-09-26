import { Story } from "core/models/Story.js";
import {
  GameModes,
  type PlayerCount,
  type PlayerSlot,
  type SetOfBeatGenerationSchema,
  type StoryPhase,
  type StoryState,
  type StoryTemplate,
  type SwitchAnalysis,
  type ThreadAnalysis,
} from "core/types/index.js";
import { getThreadType } from "core/types/thread.js";
import { BeatResolutionService } from "../../game/services/BeatResolutionService.js";
import { ChangeService } from "../../game/services/ChangeService.js";
import { ThreadResolutionService } from "../../game/services/ThreadResolutionService.js";
import {
  beatStep,
  switchStep,
  threadStep,
  type TextRequest,
} from "../../game/services/storyTextSteps.js";
import type { EvalRole } from "./arms.js";
import {
  analysisCase,
  caseStory,
  continuationCase,
  endingCase,
  hashIndex,
  hashOrder,
  iterationCases,
  pairParentsAndChildren,
  selectSubset15,
  withImagesOff,
  type EvalCase,
  type FixedAnalysis,
  type Snapshot,
} from "./cases.js";
import { SETUP_PREMISES } from "./setupPremises.js";

/*
 * Builds the cases that need the baseline to play forward (first beats with
 * their switch analysis, multiplayer continuations, analysis cases from
 * templates, the analysis for synthetic analysis turns), then assembles and
 * tags every case for freezing. Build calls use the baseline arm and are
 * recorded like any call (Stage 0, prompt state "prefix").
 */

export const TARGETS = {
  synthetic: 5,
  syntheticImagesOff: 2,
  endings: 3,
  singlePlayerFirstBeats: 3,
  multiplayerTemplates: 6,
  singlePlayerTemplates: 9,
  switchCases: 20,
  threadCases: 15,
} as const;

export type BuildDeps = {
  snapshots: Snapshot[];
  templates: StoryTemplate[];
  /** A story from a template before character selection (createStoryStateFromTemplate) */
  newStory: (template: StoryTemplate, playerCount: PlayerCount, caseId: string) => StoryState;
  /** One baseline call; undefined when it produced no usable output */
  callBaseline: (
    role: EvalRole,
    caseId: string,
    request: TextRequest,
    players: number
  ) => Promise<unknown | undefined>;
  log: (line: string) => void;
};

export type BuildReport = {
  storedUnits: number;
  storedUnitsByStory: Record<string, number>;
  counts: Record<string, number>;
  threadTypes: Record<string, number>;
  skipped: string[];
};

function selectCharacters(story: Story, caseId: string): Story {
  let updated = story;
  for (const slot of story.getPlayerSlots()) {
    const options = story.getState().characterSelectionOptions[slot];
    const identity = hashIndex(`${caseId}|${slot}|identity`, options.possibleCharacterIdentities.length);
    const background = hashIndex(`${caseId}|${slot}|background`, options.possibleCharacterBackgrounds.length);
    updated = updated.setCharacterSelection(
      slot,
      options.possibleCharacterIdentities[identity],
      options.possibleCharacterBackgrounds[background],
      identity,
      background
    );
  }
  return updated.completeCharacterSelection();
}

function chooseAndResolve(story: Story, caseId: string): Story {
  let updated = story;
  const difficulty = story.getState().difficultyLevel || { title: "Balanced", modifier: -10 };
  for (const slot of story.getPlayerSlots() as PlayerSlot[]) {
    const options = updated.getCurrentBeat(slot)?.options.length ?? 3;
    const option = hashIndex(`${caseId}|${slot}|choice`, options);
    updated = BeatResolutionService.resolveChoice(updated.updateChoice(slot, option), slot, option, difficulty);
  }
  return updated;
}

function builtTags(state: StoryState): EvalCase["tags"] {
  const players = Object.keys(state.players).length;
  return {
    players,
    gameMode: state.gameMode,
    images: state.generateImages,
    multiplayer: players > 1,
    kids: state.category === "read-with-kids",
    dark: false,
    subset15: false,
    hasStoredOutput: false,
    firstBeat: false,
    ending: false,
    analysisTurn: false,
    source: "built",
  };
}

function playerCountFor(template: StoryTemplate, multiplayer: boolean): PlayerCount {
  if (!multiplayer) return 1;
  const min = Math.max(2, template.playerCountMin);
  const max = Math.min(3, template.playerCountMax);
  return (min + hashIndex(template.id, max - min + 1)) as PlayerCount;
}

/** Every slot up to the player count has characters and backgrounds to choose (some templates lack them). */
function playable(template: StoryTemplate, playerCount: number): boolean {
  return Array.from({ length: playerCount }, (_, i) => `player${i + 1}`).every((slot) => {
    const options = Object.entries(template).find(([key]) => key === slot)?.[1];
    return (
      !!options &&
      typeof options === "object" &&
      "possibleCharacterIdentities" in options &&
      "possibleCharacterBackgrounds" in options &&
      Array.isArray(options.possibleCharacterIdentities) &&
      Array.isArray(options.possibleCharacterBackgrounds) &&
      options.possibleCharacterIdentities.length > 0 &&
      options.possibleCharacterBackgrounds.length > 0
    );
  });
}

/** Playable multiplayer templates, contest-friendly modes first; single-player templates by hash. */
function pickTemplates(templates: StoryTemplate[]) {
  const contest = (t: StoryTemplate) =>
    t.gameMode === GameModes.Competitive || t.gameMode === GameModes.CooperativeCompetitive ? 0 : 1;
  const multiplayer = hashOrder(
    templates.filter((t) => t.playerCountMax >= 2),
    (t) => t.id
  )
    .sort((a, b) => contest(a) - contest(b))
    .map((template) => ({ template, playerCount: playerCountFor(template, true) }))
    .filter(({ template, playerCount }) => playable(template, playerCount));
  const single = hashOrder(
    templates.filter((t) => t.playerCountMax < 2 && playable(t, 1)),
    (t) => t.id
  );
  return {
    multiplayer: multiplayer.slice(0, TARGETS.multiplayerTemplates),
    single: single.slice(0, TARGETS.singlePlayerTemplates),
  };
}

type PlayedTemplate = { switchCase: EvalCase; firstBeat?: EvalCase; threadCase?: EvalCase; continuation?: EvalCase };

/** One template played forward with the baseline: switch analysis, first beat, choices, thread analysis. */
async function playTemplate(
  deps: BuildDeps,
  template: StoryTemplate,
  playerCount: PlayerCount,
  wants: { firstBeat: boolean; continuation: boolean },
  skipped: string[]
): Promise<PlayedTemplate | undefined> {
  const prefix = `tpl-${template.id.slice(0, 8)}-p${playerCount}`;
  const start = selectCharacters(Story.create(deps.newStory(template, playerCount, prefix)), prefix);
  const switchCase: EvalCase = { id: `switch-${prefix}-t0`, role: "switch", state: start.getState(), tags: builtTags(start.getState()) };
  const result: PlayedTemplate = { switchCase };
  const skip = (reason: string, partial?: PlayedTemplate) => {
    skipped.push(reason);
    return partial;
  };

  const switchOut = await deps.callBaseline("switch", switchCase.id, switchStep.request(start), playerCount);
  if (!switchOut) return skip(`${prefix}: baseline switch analysis failed`);
  const beatInput = switchStep.apply(start, switchOut as SwitchAnalysis);
  if (wants.firstBeat) {
    result.firstBeat = {
      id: `first-${prefix}`,
      role: "beat",
      state: start.getState(),
      fixedAnalysis: { kind: "switch", phase: lastPhase(beatInput) as SwitchAnalysis },
      tags: { ...builtTags(start.getState()), firstBeat: true, analysisTurn: true },
    };
  }

  // A first-beat case's baseline sample 1 is this very call (same id, same prompt), so it is reused
  const beatCallId = wants.firstBeat ? `first-${prefix}` : `build-beat-${prefix}-t0`;
  const beatOut = await deps.callBaseline("beat", beatCallId, beatStep.request(beatInput), playerCount);
  if (!beatOut) return skip(`${prefix}: baseline first beat failed`, result);
  const [withBeat, changes] = beatStep.apply(beatInput, beatOut as SetOfBeatGenerationSchema, true);
  const chosen = chooseAndResolve(new ChangeService().applyChanges(withBeat, changes), prefix);
  // Frozen past thread resolution, as every case is (it rolls dice)
  const threadState = ThreadResolutionService.resolveCurrentThreads(chosen).getState();
  result.threadCase = { id: `thread-${prefix}-t1`, role: "thread", state: threadState, tags: builtTags(threadState) };

  if (wants.continuation) {
    const threadInput = caseStory(result.threadCase, false);
    const threadOut = await deps.callBaseline("thread", result.threadCase.id, threadStep.request(threadInput), playerCount);
    if (!threadOut) return skip(`${prefix}: baseline thread analysis failed`, result);
    const threadPhase = lastPhase(threadStep.apply(threadInput, threadOut as ThreadAnalysis)) as ThreadAnalysis;
    result.continuation = {
      id: `cont-${prefix}-t1`,
      role: "beat",
      state: threadState,
      fixedAnalysis: { kind: "thread", phase: threadPhase },
      tags: { ...builtTags(threadState), analysisTurn: true },
    };
  }
  return result;
}

/** The phase an analysis step just added. */
function lastPhase(story: Story): StoryPhase {
  const phase = story.getCurrentPhase();
  if (!phase) throw new Error("The analysis step added no phase");
  return phase;
}

/** The baseline analysis for a synthetic analysis turn, fixed for isolated mode. */
async function withBuiltAnalysis(deps: BuildDeps, evalCase: EvalCase, skipped: string[]): Promise<EvalCase | undefined> {
  if (!evalCase.tags.analysisTurn) return evalCase;
  const story = caseStory(evalCase, false);
  const kind = story.determineNextBeatType() === "switch" ? "switch" : "thread";
  const request = kind === "switch" ? switchStep.request(story) : threadStep.request(story);
  const output = await deps.callBaseline(kind, `${kind}-${evalCase.id}`, request, evalCase.tags.players);
  if (!output) {
    skipped.push(`${evalCase.id}: baseline ${kind} analysis failed`);
    return undefined;
  }
  const fixedAnalysis: FixedAnalysis =
    kind === "switch"
      ? { kind, phase: lastPhase(switchStep.apply(story, output as SwitchAnalysis)) as SwitchAnalysis }
      : { kind, phase: lastPhase(threadStep.apply(story, output as ThreadAnalysis)) as ThreadAnalysis };
  return { ...evalCase, fixedAnalysis };
}

function setupCases(): EvalCase[] {
  return SETUP_PREMISES.map((p) => ({
    id: p.id,
    role: "setup" as const,
    setup: { premise: p.premise, playerCount: p.playerCount, gameMode: p.gameMode, maxTurns: p.maxTurns },
    tags: {
      players: p.playerCount,
      gameMode: p.gameMode,
      images: false,
      multiplayer: p.playerCount > 1,
      kids: p.tags.kids,
      dark: p.tags.dark,
      subset15: false,
      hasStoredOutput: false,
      firstBeat: false,
      ending: false,
      analysisTurn: false,
      source: "premise" as const,
      category: p.category,
    },
  }));
}

/** Which thread types the cases' fixed analyses contain (stored play has only challenges). */
function threadTypesOf(cases: EvalCase[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of cases) {
    if (c.fixedAnalysis?.kind !== "thread") continue;
    for (const thread of c.fixedAnalysis.phase.threads) {
      const type = getThreadType(thread);
      counts[type] = (counts[type] ?? 0) + 1;
    }
  }
  return counts;
}

export async function buildCases(deps: BuildDeps): Promise<{ cases: EvalCase[]; report: BuildReport }> {
  const skipped: string[] = [];
  const { units, unadopted } = pairParentsAndChildren(deps.snapshots);
  const storedUnitsByStory: Record<string, number> = {};
  units.forEach((u) => (storedUnitsByStory[u.parent.unit] = (storedUnitsByStory[u.parent.unit] ?? 0) + 1));

  const continuations = units.map((u) => continuationCase(u.parent, u.child));
  const storedAnalysis = units.map(analysisCase).filter((c): c is EvalCase => c !== undefined);

  const synthetic: EvalCase[] = [];
  for (const [index, snapshot] of hashOrder(unadopted, (s) => `${s.unit}/${s.file}`).entries()) {
    if (synthetic.length >= TARGETS.synthetic) break;
    const base = continuationCase(snapshot);
    const built = await withBuiltAnalysis(deps, index < TARGETS.syntheticImagesOff ? withImagesOff(base) : base, skipped);
    if (built) synthetic.push(built);
  }

  const endings = hashOrder(units, (u) => `${u.parent.unit}/${u.child.file}`)
    .map(endingCase)
    .filter((c): c is EvalCase => c !== undefined)
    .slice(0, TARGETS.endings);

  const picked = pickTemplates(deps.templates);
  const played: PlayedTemplate[] = [];
  for (const { template, playerCount } of picked.multiplayer) {
    const result = await playTemplate(deps, template, playerCount, { firstBeat: true, continuation: true }, skipped);
    if (result) played.push(result);
  }
  for (const [index, template] of picked.single.entries()) {
    const firstBeat = index < TARGETS.singlePlayerFirstBeats;
    const result = await playTemplate(deps, template, 1, { firstBeat, continuation: false }, skipped);
    if (result) played.push(result);
  }

  const switchCases = [
    ...storedAnalysis.filter((c) => c.role === "switch"),
    ...played.map((p) => p.switchCase),
  ].slice(0, TARGETS.switchCases);
  const threadCases = [
    ...storedAnalysis.filter((c) => c.role === "thread"),
    ...played.flatMap((p) => (p.threadCase ? [p.threadCase] : [])),
  ].slice(0, TARGETS.threadCases);

  const beatCases = [
    ...continuations,
    ...synthetic,
    ...played.flatMap((p) => [p.firstBeat, p.continuation].filter((c): c is EvalCase => c !== undefined)),
    ...endings,
  ];
  const subset = selectSubset15(beatCases);
  const cases = [
    ...setupCases(),
    ...beatCases.map((c) => ({ ...c, tags: { ...c.tags, subset15: subset.has(c.id) } })),
    ...switchCases,
    ...threadCases,
    ...iterationCases(deps.templates),
  ];
  const counts: Record<string, number> = {
    setup: cases.filter((c) => c.role === "setup").length,
    beat: beatCases.length,
    storedContinuations: continuations.length,
    synthetic: synthetic.length,
    firstBeats: beatCases.filter((c) => c.tags.firstBeat).length,
    multiplayer: beatCases.filter((c) => c.tags.multiplayer).length,
    endings: endings.length,
    imagesOff: beatCases.filter((c) => !c.tags.images).length,
    switch: switchCases.length,
    thread: threadCases.length,
    iteration: cases.filter((c) => c.role === "iteration").length,
    subset15: subset.size,
  };
  deps.log(`Built cases: ${JSON.stringify(counts)}`);
  return {
    cases,
    report: { storedUnits: units.length, storedUnitsByStory, counts, threadTypes: threadTypesOf(cases), skipped },
  };
}
