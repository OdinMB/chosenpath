import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import type { FakeOpenAI, FakeRequestRecord } from "../../../../harness/lib/fake-openai.mjs";

/*
 * The local harness's fake model, read by the product's own code: a template
 * drafted from a premise, a story started from it, two turns with a choice
 * between them, the content filter and an image. Each reply goes through the
 * same LangChain and OpenAI clients, schemas, repairs and checks as in
 * production, over HTTP to the fake on 127.0.0.1. Spend booking is stubbed,
 * so nothing reaches a database.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockModule = (jest as any).unstable_mockModule;
await mockModule("../../../src/spend/spendStore.js", () => ({
  __esModule: true,
  addSpend: jest.fn(async () => undefined),
  bucketTotalOn: jest.fn(async () => 0),
  totalsSince: jest.fn(async () => []),
  utcDay: (date: Date) => date.toISOString().slice(0, 10),
}));
await mockModule("../../../src/stories/storyOrigins.js", () => ({
  __esModule: true,
  storyOrigin: jest.fn(async () => "account"),
  forgetStoriesOfCreator: jest.fn(),
  forgetAllStoryOrigins: jest.fn(),
}));

const { startFakeOpenAI, PLACEHOLDER_MARK } = await import("../../../../harness/lib/fake-openai.mjs");
const { AIStoryGenerator } = await import("../../../src/game/services/AIStoryGenerator.js");
const { ContentFilterService } = await import("../../../src/game/services/ContentFilterService.js");
const { ChangeService } = await import("../../../src/game/services/ChangeService.js");
const { ThreadResolutionService } = await import("../../../src/game/services/ThreadResolutionService.js");
const { BeatResolutionService } = await import("../../../src/game/services/BeatResolutionService.js");
const { createStoryStateFromTemplate } = await import("../../../src/game/services/StoryStateFactory.js");
const { analysisBefore } = await import("../../../src/game/services/storyTextSteps.js");
const { requestImage } = await import("../../../src/images/openaiImageClient.js");
const { Story } = await import("core/models/Story.js");
const { templateStartProblem } = await import("core/utils/outcomeReadiness.js");
const { GameModes } = await import("core/types/index.js");

type StoryModel = InstanceType<typeof Story>;
type Generator = InstanceType<typeof AIStoryGenerator>;

const serverPackage = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../package.json");

let fake: FakeOpenAI;
const requests: FakeRequestRecord[] = [];
const savedBaseUrl = process.env.OPENAI_BASE_URL;

beforeAll(async () => {
  fake = await startFakeOpenAI({ record: (entry) => requests.push(entry), sharpFrom: serverPackage });
  process.env.OPENAI_BASE_URL = fake.baseUrl;
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterAll(async () => {
  jest.restoreAllMocks();
  if (savedBaseUrl === undefined) delete process.env.OPENAI_BASE_URL;
  else process.env.OPENAI_BASE_URL = savedBaseUrl;
  await fake.close();
});

/** What the product's progression does before and during a turn (StoryProgressionService), without the database. */
async function nextTurn(generator: Generator, story: StoryModel): Promise<StoryModel> {
  let current = ThreadResolutionService.resolveCurrentThreads(story.clone());
  const analysis = analysisBefore(current, current.determineNextBeatType());
  if (analysis === "switch") current = await generator.generateSwitches(current);
  if (analysis === "thread") current = await generator.generateThreads(current);
  const [withBeats, changes] = await generator.generateBeats(current, true);
  return new ChangeService().applyChanges(withBeats, changes);
}

describe("the harness's fake model, read by the product", () => {
  it("drafts a startable template and plays two turns of a story from it", async () => {
    const generator = new AIStoryGenerator();
    const setup = await generator.generateTemplateSetup("A quiet harbour town", 1, GameModes.SinglePlayer, 5);

    // As TemplateService.generateTemplate saves it
    const template = {
      ...setup,
      id: "harness-template",
      playerCountMin: 1,
      playerCountMax: 1,
      gameMode: GameModes.SinglePlayer,
      maxTurnsMin: 5,
      maxTurnsMax: 5,
      tags: [],
      containsImages: false,
    } as unknown as Parameters<typeof createStoryStateFromTemplate>[1];
    expect(templateStartProblem(template, 1)).toBeNull();
    expect(template.title.length).toBeGreaterThan(0);

    const difficulty = template.difficultyLevels?.[0] ?? { title: "Balanced", modifier: 0 };
    let story = Story.create(
      createStoryStateFromTemplate("harness-story", template, 1, 5, false, false, difficulty, { player1: "code-1" })
    );
    const options = story.getState().characterSelectionOptions.player1;
    expect(options.possibleCharacterIdentities.length).toBeGreaterThan(0);
    expect(options.possibleCharacterBackgrounds.length).toBeGreaterThan(0);
    story = story
      .setCharacterSelection("player1", options.possibleCharacterIdentities[0], options.possibleCharacterBackgrounds[0], 0, 0)
      .completeCharacterSelection();

    story = await nextTurn(generator, story);
    const first = story.getCurrentBeat("player1");
    expect(first?.text).toContain(PLACEHOLDER_MARK);
    expect(first?.options.length).toBeGreaterThanOrEqual(2);
    // The smoke journey finds the choice buttons by this text (harness/steps/smoke.mjs)
    for (const option of first?.options ?? []) expect(option.text).toContain("(placeholder ");

    story = BeatResolutionService.resolveChoice(story.updateChoice("player1", 0), "player1", 0, difficulty);
    story = await nextTurn(generator, story);
    expect(story.getState().players.player1.beatHistory).toHaveLength(2);
    const second = story.getCurrentBeat("player1");
    expect(second?.options.length).toBeGreaterThanOrEqual(2);
    for (const option of second?.options ?? []) expect(option.text).toContain("(placeholder ");
    // The journey tells the second turn from the first by new choice texts
    const firstTexts = (first?.options ?? []).map((option) => option.text);
    expect((second?.options ?? []).some((option) => !firstTexts.includes(option.text))).toBe(true);

    // Every call was a structured one the fake answered
    expect(requests.filter((r) => r.kind === "unhandled" || r.kind === "error")).toEqual([]);
  }, 60_000);

  it("lets a premise through the content filter", async () => {
    const verdict = await new ContentFilterService().isAppropriatePrompt("A quiet harbour town");
    expect(verdict.isAppropriate).toBe(true);
  });

  it("answers an image request with a JPEG of the requested shape", async () => {
    const result = await requestImage(new OpenAI(), {
      prompt: "A harbour at dusk",
      model: "gpt-image-2.5-flare",
      quality: "low",
      size: "1024x1536",
    } as Parameters<typeof requestImage>[1]);
    expect(result.buffer.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    expect(requests.some((r) => r.kind === "image" && r.path === "/images/generations")).toBe(true);
  });
});
