import { jest } from "@jest/globals";
import type { Story } from "core/models/Story.js";
import type { PlayerSlot, StoryState } from "core/types/index.js";
import { StoryStatePromptService } from "../../../../../src/game/services/prompts/StoryStatePromptService.js";
import { BeatPromptService } from "../../../../../src/game/services/prompts/BeatPromptService.js";
import { SwitchPromptService } from "../../../../../src/game/services/prompts/SwitchPromptService.js";
import { createMockStory, createMockStoryState } from "../../../../helpers/testHelpers.js";
import { laterSwitchBeat, switchAnalysisAfterThread, threadBeat } from "../../../../helpers/promptStories.js";
import { outcome, stat } from "../../../../helpers/textFixtures.js";

type PlayerState = StoryState["players"][PlayerSlot];

beforeEach(() => {
  // The story-state section logs that the mock story has no elements
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** A single-player story whose player1 carries the given fields. */
function storyWithPlayer(player: Partial<PlayerState>, overrides: Partial<StoryState> = {}): Story {
  const base = createMockStoryState(overrides);
  return createMockStory({ ...overrides, players: { player1: { ...base.players.player1, ...player } } });
}

const ladder = stat("reputation", {
  type: "string",
  name: "Reputation",
  possibleValues: "Unknown, Respected, Revered",
  initialValue: "Unknown",
});

describe("StoryStatePromptService: stat values", () => {
  it("shows a shared opposites stat as both sides of its split", () => {
    const story = createMockStory({
      sharedStats: [stat("order_chaos", { type: "opposites", name: "Order|Chaos" })],
      sharedStatValues: [{ statId: "order_chaos", value: 60 }],
    });

    const prompt = StoryStatePromptService.createStoryStatePrompt(story, { stats: true, detailedStats: true });

    expect(prompt).toContain("- ORDER|CHAOS (id: order_chaos, type: opposites): 60|40");
  });

  it("shows a player's opposites value as both sides of its split", () => {
    const story = storyWithPlayer(
      { statValues: [{ statId: "resolve_doubt", value: 70 }] },
      { playerStats: [stat("resolve_doubt", { type: "opposites", name: "Resolve|Doubt" })] }
    );

    const prompt = StoryStatePromptService.createStoryStatePrompt(story, { players: true, stats: true });

    expect(prompt).toContain("CHARACTER STAT VALUES:\n- RESOLVE|DOUBT (resolve_doubt): 70|30");
  });

  it("labels a stat's narrative implications in the planners' view", () => {
    const story = createMockStory({
      sharedStats: [stat("morale", { narrativeImplications: ["High morale emboldens the crew"] })],
      sharedStatValues: [{ statId: "morale", value: 50 }],
    });

    const prompt = SwitchPromptService.createSwitchAnalysisPrompt(story);

    expect(prompt).toContain(
      "- MORALE (id: morale, type: percentage): 50%\n  - Narrative: High morale emboldens the crew"
    );
  });

  it("shows a stat's possible values in a beat's detailed stat view", () => {
    const story = threadBeat(1, { sharedStats: [ladder], sharedStatValues: [{ statId: "reputation", value: "Unknown" }] });

    expect(BeatPromptService.createBeatPrompt(story)).toContain(
      "- REPUTATION (id: reputation, type: string): Unknown\n  - Possible values: Unknown, Respected, Revered"
    );
  });

  it("shows no possible-values line for a stat whose possible values are blank", () => {
    const story = threadBeat(1, {
      sharedStats: [{ ...ladder, possibleValues: "  " }],
      sharedStatValues: [{ statId: "reputation", value: "Unknown" }],
    });

    expect(BeatPromptService.createBeatPrompt(story)).not.toContain("Possible values");
  });

  it("leaves possible values out of the planners' view", () => {
    const story = createMockStory({ sharedStats: [ladder], sharedStatValues: [{ statId: "reputation", value: "Unknown" }] });

    expect(SwitchPromptService.createSwitchAnalysisPrompt(story)).not.toContain("Possible values");
  });
});

describe("StoryStatePromptService: the resolved thread's type", () => {
  const HEADER = "==== CHALLENGE THREAD: A Thread (a_thread) ====";

  it("names the thread type of the thread a later switch beat narrates", () => {
    expect(BeatPromptService.createBeatPrompt(laterSwitchBeat(1))).toContain(`${HEADER}\nThread type: Chase\n`);
  });

  it("names the thread type of the thread the switch analysis follows", () => {
    expect(SwitchPromptService.createSwitchAnalysisPrompt(switchAnalysisAfterThread(1))).toContain(
      `${HEADER}\nThread type: Chase\n`
    );
  });

  it("leaves an ongoing thread's header as it is", () => {
    const prompt = BeatPromptService.createBeatPrompt(threadBeat(1));

    expect(prompt).toContain(`${HEADER}\nPlayers: player1`);
    expect(prompt).not.toContain("Thread type:");
  });
});

describe("StoryStatePromptService: lists", () => {
  const guidelines = createMockStoryState().guidelines;

  it("prints each guideline item on its own line", () => {
    const story = createMockStory({
      guidelines: { ...guidelines, rules: ["Magic has a price, always", "The dead stay dead"] },
    });

    const prompt = StoryStatePromptService.createStoryStatePrompt(story, { guidelines: true });

    expect(prompt).toContain("- Rules:\n  - Magic has a price, always\n  - The dead stay dead\n");
  });

  it("prints no line for an empty guideline list", () => {
    const story = createMockStory({ guidelines: { ...guidelines, tone: [] } });

    const prompt = StoryStatePromptService.createStoryStatePrompt(story, { guidelines: true });

    expect(prompt).not.toContain("- Tone:");
    expect(prompt).toContain("- Core conflicts:\n  - Test conflict\n");
  });

  it("prints each suggested thread type on its own line", () => {
    const story = createMockStory({ guidelines: { ...guidelines, typesOfThreads: ["Chase", "Heist"] } });

    const prompt = StoryStatePromptService.createStoryStatePrompt(story, { switchAndThreadInstructions: true });

    expect(prompt).toContain(
      "- Types of threads that are a good fit for the story (if and when appropriate):\n  - Chase\n  - Heist"
    );
  });

  it("prints no stray bullet when there are no switch and thread instructions", () => {
    const story = createMockStory({ guidelines: { ...guidelines, typesOfThreads: [], switchAndThreadInstructions: [] } });

    const prompt = StoryStatePromptService.createStoryStatePrompt(story, { switchAndThreadInstructions: true });

    expect(prompt.trim()).toBe("SPECIAL SWITCH/THREAD INSTRUCTIONS:");
  });

  it("gives every previous thread type its own bullet", () => {
    const story = storyWithPlayer({ previousTypesOfThreads: ["Chase", "Heist"] });

    const prompt = StoryStatePromptService.createStoryStatePrompt(story, { players: true, previousThreads: true });

    expect(prompt).toContain("PREVIOUS THREAD TYPES (to be avoided for upcoming threads):\n- Chase\n- Heist\n");
  });

  it("says None when there are no previous thread types", () => {
    const prompt = StoryStatePromptService.createStoryStatePrompt(storyWithPlayer({}), {
      players: true,
      previousThreads: true,
    });

    expect(prompt).toContain("PREVIOUS THREAD TYPES (to be avoided for upcoming threads):\n- None\n");
  });
});

describe("StoryStatePromptService: shared outcomes", () => {
  const HEADER = "SHARED OUTCOMES that will affect all players:";

  it("prints no shared-outcomes header when the story has no shared outcomes", () => {
    const prompt = StoryStatePromptService.createStoryStatePrompt(createMockStory(), { outcomes: true });

    expect(prompt).not.toContain(HEADER);
  });

  it("prints the header above the story's shared outcomes", () => {
    const story = createMockStory({ sharedOutcomes: [outcome("shared_goal")] });

    const prompt = StoryStatePromptService.createStoryStatePrompt(story, { outcomes: true });

    expect(prompt).toContain(`${HEADER}\nID: shared_goal\n`);
  });
});
