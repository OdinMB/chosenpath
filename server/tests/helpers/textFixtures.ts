// Fixtures for the text roles: beat sets, switch and thread analyses
import type {
  BeatGeneration,
  BeatOption,
  ChallengeOption,
  SetOfBeatGenerationSchema,
  SwitchAnalysis,
  Thread,
  ThreadAnalysis,
} from "core/types/index.js";

export const PARAGRAPH =
  "You step into the hall. The torches flicker. A guard looks up at you.";

/** Six three-sentence paragraphs. */
export const SIX_PARAGRAPHS = Array.from({ length: 6 }, () => PARAGRAPH).join("\n\n");

export function explorationOptions(): BeatOption[] {
  return [1, 2, 3].map((n) => ({
    optionType: "exploration" as const,
    resourceType: "normal" as const,
    text: `Option ${n}`,
  }));
}

export function challengeOptions(): ChallengeOption[] {
  return [1, 2, 3].map((n) => ({
    optionType: "challenge" as const,
    resourceType: "normal" as const,
    riskType: "normal" as const,
    text: `Option ${n}`,
    basePoints: 0,
    modifiersToSuccessRate: [],
  }));
}

export function beatGeneration(overrides: Partial<BeatGeneration> = {}): BeatGeneration {
  return {
    plan: {
      forPlayer: "player1 - Test Player",
      developmentsToNarrate: "",
      beatTypeConsiderations: "",
      otherBeats: "single-player",
      worldBuilding: "",
      newGameElements: [],
      showDontTellPreviousDecision: "",
      showDontTell: [],
      newIntroductionsOfStoryElements: [],
      establishedFacts: [],
      optionConsiderations: "ending",
    },
    title: "A Beat",
    imageRequest: "",
    text: SIX_PARAGRAPHS,
    summary: "Something happens.",
    options: explorationOptions(),
    interludes: [1, 2, 3].map((n) => ({
      imageId: "player1",
      imageSource: "none" as const,
      text: `Interlude ${n}.`,
    })),
    ...overrides,
  };
}

export function beatSet(
  playerCount: number,
  overrides: Partial<SetOfBeatGenerationSchema> = {}
): SetOfBeatGenerationSchema {
  const beats: Record<string, BeatGeneration> = {};
  for (let i = 1; i <= playerCount; i++) {
    beats[`player${i}`] = beatGeneration({ plan: { ...beatGeneration().plan, forPlayer: `player${i}` } });
  }
  return {
    statsAffectingDecisionConsequences: [],
    statChanges: [],
    newMilestones: "",
    ...beats,
    ...overrides,
  };
}

export function switchAnalysis(players: string[], firstBeatIndex = 0): SwitchAnalysis {
  const perPlayer = Object.fromEntries(
    players.map((slot) => [
      slot,
      { continuity: "", priority: "", decision: "", switchType: "topic" as const },
    ])
  );
  return {
    ...perPlayer,
    coordinationPatternAnalysis: "single-player",
    coordinationPatternSummary: "single-player",
    switches: [
      {
        players,
        type: "topic",
        relevantSuggestedThreadTypes: [],
        previousThreadTypesToBeAvoided: [],
        relevantSwitchAndThreadInstructions: "",
        outcomeId: "",
        question: "",
        topicChoices: ["a", "b", "c"],
        relationshipToOtherSwitches: "single-player",
        title: "A Switch",
        id: "a_switch",
      },
    ],
    firstBeatIndex,
    duration: 1,
  };
}

export type ThreadKind = "challenge" | "exploration" | "contest";

function stepResolutions(kind: ThreadKind) {
  if (kind === "challenge") {
    return { favorable: "good", mixed: "so-so", unfavorable: "bad" };
  }
  if (kind === "contest") {
    return { sideAWins: "A", mixed: "draw", sideBWins: "B" };
  }
  return { resolution1: "one", resolution2: "two", resolution3: "three" };
}

export function thread(
  kind: ThreadKind,
  duration: number,
  firstBeatIndex: number,
  sideA: string[] = ["player1"],
  sideB: string[] = []
): Thread {
  return {
    outcomeId: "outcome_1",
    playersSideA: sideA,
    playersSideB: kind === "contest" ? sideB : [],
    previousThreadTypesToBeAvoided: [],
    relevantSuggestedThreadTypes: [],
    typeOfThread: "Chase",
    typeOfMilestone: "",
    possibleMilestones: stepResolutions(kind),
    progression: Array.from({ length: duration }, (_, i) => ({
      title: `Step ${i + 1}`,
      question: "Q",
      possibleResolutions: stepResolutions(kind),
      resolution: null,
    })),
    title: "A Thread",
    id: "a_thread",
    duration,
    firstBeatIndex,
    resolution: null,
    milestone: null,
  };
}

export function threadAnalysis(
  kind: ThreadKind,
  duration: number,
  firstBeatIndex: number,
  sideA: string[] = ["player1"],
  sideB: string[] = []
): ThreadAnalysis {
  return {
    relevantSwitchAndThreadInstructions: "",
    coordinationPatternSummary: "",
    duration,
    firstBeatIndex,
    threads: [thread(kind, duration, firstBeatIndex, sideA, sideB)],
  };
}
