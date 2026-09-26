import type { StoryState } from "core/types/index.js";
import type { EvalCase } from "./cases.js";
import type { ArmRef, RatingKind } from "./ratingSets.js";
import type { CallRecord } from "./runner.js";

/*
 * Material for a layout-only preview page before any eval output exists: turn
 * items from the stored beats of stored continuations, setup items from the
 * setups of stored custom stories. Preview pages are never rated.
 */

export const STORED_ARM: ArmRef = { promptState: "stored", armKey: "stored" };

function storedRecord(caseId: string, kind: RatingKind): CallRecord {
  return {
    jobKey: `${caseId}|stored`,
    stage: "0",
    promptState: STORED_ARM.promptState,
    role: kind === "setup" ? "setup" : "beat",
    group: kind === "setup" ? "setup" : "beat",
    caseId,
    armKey: STORED_ARM.armKey,
    callArmKey: STORED_ARM.armKey,
    model: "stored",
    baseline: true,
    sample: 1,
    players: 1,
    step: 1,
    attempt: 1,
    final: true,
    jobFinal: true,
    startedAt: new Date(0).toISOString(),
    outcome: "valid",
    latencyMs: 0,
    junkChars: 0,
    inputTokens: 0,
    cachedTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    costUsd: 0,
    costSource: "none",
    estimateUsd: 0,
    outputFile: `stored:${caseId}`,
  };
}

/** A stored story's setup in the shape of a setup reply (its character options per slot). */
function setupFromState(state: StoryState): Record<string, unknown> {
  return {
    title: state.title,
    characterSelectionIntroduction: state.characterSelectionIntroduction,
    guidelines: state.guidelines,
    storyElements: state.storyElements,
    sharedStats: state.sharedStats,
    playerStats: state.playerStats,
    ...state.characterSelectionOptions,
  };
}

export function previewSource(
  kind: RatingKind,
  cases: EvalCase[],
  customStories: StoryState[]
): { cases: EvalCase[]; records: CallRecord[]; loadOutput: (record: CallRecord) => unknown } {
  const outputs = new Map<string, unknown>();
  let previewCases: EvalCase[];
  if (kind === "turn") {
    previewCases = cases.filter((c) => c.role === "beat" && c.storedOutput !== undefined);
    previewCases.forEach((c) => outputs.set(`stored:${c.id}`, c.storedOutput));
  } else {
    previewCases = customStories.map((state) => {
      const id = `stored-setup-${state.id.slice(0, 8)}`;
      outputs.set(`stored:${id}`, setupFromState(state));
      const players = Object.keys(state.players).length;
      return {
        id,
        role: "setup" as const,
        setup: { premise: state.guidelines.world, playerCount: 1, gameMode: state.gameMode, maxTurns: state.maxTurns },
        tags: {
          players,
          gameMode: state.gameMode,
          images: state.generateImages,
          multiplayer: players > 1,
          kids: false,
          dark: false,
          subset15: false,
          hasStoredOutput: true,
          firstBeat: false,
          ending: false,
          analysisTurn: false,
          source: "stored" as const,
        },
      };
    });
  }
  return {
    cases: previewCases,
    records: previewCases.map((c) => storedRecord(c.id, kind)),
    loadOutput: (record) => outputs.get(record.outputFile ?? ""),
  };
}
