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
/** The product's log lines, kept to read its "[LLM] repair" lines */
const logged: string[] = [];
const savedBaseUrl = process.env.OPENAI_BASE_URL;

beforeAll(async () => {
  fake = await startFakeOpenAI({ record: (entry) => requests.push(entry), sharpFrom: serverPackage });
  process.env.OPENAI_BASE_URL = fake.baseUrl;
  jest.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  });
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

type Template = Parameters<typeof createStoryStateFromTemplate>[1];
type Difficulty = Parameters<typeof createStoryStateFromTemplate>[6];
type Beat = NonNullable<ReturnType<StoryModel["getCurrentBeat"]>>;
type Seat = "player1" | "player2" | "player3";

/** A World of `maxTurns` turns for these seats, drafted from a premise and saved as TemplateService.generateTemplate saves it. */
async function draftWorld(generator: Generator, seats: Seat[], gameMode: Parameters<Generator["generateTemplateSetup"]>[2], maxTurns: number): Promise<Template> {
  const setup = await generator.generateTemplateSetup("A quiet harbour town", seats.length as Parameters<typeof createStoryStateFromTemplate>[2], gameMode, maxTurns);
  return {
    ...setup,
    id: "harness-ending-template",
    playerCountMin: seats.length,
    playerCountMax: seats.length,
    gameMode,
    maxTurnsMin: maxTurns,
    maxTurnsMax: maxTurns,
    tags: [],
    containsImages: false,
  } as unknown as Template;
}

/** A story started on a World, every seat with its first character. */
function startOn(template: Template, seats: Seat[]) {
  const maxTurns = (template as unknown as { maxTurnsMin: number }).maxTurnsMin;
  const difficulty: Difficulty = template.difficultyLevels?.[0] ?? { title: "Balanced", modifier: 0 };
  const codes = Object.fromEntries(seats.map((seat, i) => [seat, `code-${i + 1}`])) as Parameters<typeof createStoryStateFromTemplate>[7];
  const playerCount = seats.length as Parameters<typeof createStoryStateFromTemplate>[2];
  let story = Story.create(createStoryStateFromTemplate("harness-ending-story", template, playerCount, maxTurns, false, false, difficulty, codes));
  for (const seat of seats) {
    const options = story.getState().characterSelectionOptions[seat];
    story = story.setCharacterSelection(seat, options.possibleCharacterIdentities[0], options.possibleCharacterBackgrounds[0], 0, 0);
  }
  return { story: story.completeCharacterSelection(), difficulty };
}

/** A story of `maxTurns` turns on a World drafted for it. */
async function storyOfLength(generator: Generator, seats: Seat[], gameMode: Parameters<Generator["generateTemplateSetup"]>[2], maxTurns: number) {
  return startOn(await draftWorld(generator, seats, gameMode, maxTurns), seats);
}

type PlayedTurn = { turn: number; type: string; beats: Record<Seat, Beat | undefined>; values: string };

/** Plays turns until the story's ending (or `limit` turns), every seat taking a different option each turn; each turn as the seats saw it. */
async function playToEnding(generator: Generator, start: StoryModel, seats: Seat[], difficulty: Difficulty, limit: number) {
  let story = start;
  const played: PlayedTurn[] = [];
  for (let i = 0; i < limit; i++) {
    story = await nextTurn(generator, story);
    const state = story.getState();
    played.push({
      turn: story.getCurrentTurn(),
      type: story.getCurrentBeatType(),
      beats: Object.fromEntries(seats.map((seat) => [seat, story.getCurrentBeat(seat)])) as Record<Seat, Beat | undefined>,
      values: JSON.stringify([state.sharedStatValues, ...seats.map((seat) => state.players[seat].statValues)]),
    });
    if (story.getCurrentBeatType() === "ending") break;
    for (const [n, seat] of seats.entries()) {
      const choice = (i + n) % (story.getCurrentBeat(seat)?.options.length ?? 1);
      story = BeatResolutionService.resolveChoice(story.updateChoice(seat, choice), seat, choice, difficulty);
    }
  }
  return { story, played };
}

/** The challenge options a turn offered a seat. */
function challengeOptions(beat: Beat | undefined) {
  return (beat?.options ?? []).flatMap((option) => (option.optionType === "challenge" ? [option] : []));
}

/** The kinds of repair and note the product logged (textRepairs.ts's "[LLM] repair" lines) since line `from`. */
function repairKindsLogged(from: number): string[] {
  const kinds = new Set<string>();
  for (const line of logged.slice(from)) {
    const match = line.match(/\[LLM\] repair (\{.*\})/);
    if (!match) continue;
    const counts = JSON.parse(match[1]) as { repairs?: Record<string, number>; notes?: Record<string, number> };
    for (const kind of [...Object.keys(counts.repairs ?? {}), ...Object.keys(counts.notes ?? {})]) kinds.add(kind);
  }
  return [...kinds];
}

/**
 * Repairs that would undo what the fake's story replies are for: a chapter
 * the engine doesn't play at that length (so the story would not end on its
 * turn count), options of the wrong type (flattened to a normal risk with no
 * points or bonuses), stat changes and bonuses on stats or seats the story
 * lacks or under the wrong group. (A switch plan's pacingNotFollowed is the
 * milestone arithmetic, which the fake doesn't follow: the product asks once
 * more and keeps the plan.)
 */
const REPAIRS_THE_FAKE_AVOIDS = [
  "lengthNotAllowed",
  "durationFromSteps",
  "optionType",
  "statChangeUnknown",
  "statChangeAmbiguous",
  "statGroupMoved",
  "statIdSeatForm",
  "bonusStatUnknown",
  "bonusStatAmbiguous",
  "bonusStatIdSeatForm",
];

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

  // The harness's group World (fixture-vars.json's groupTemplate, run.mjs's --group-mode)
  it.each([GameModes.Cooperative, GameModes.CooperativeCompetitive, GameModes.Competitive])(
    "drafts a %s template for three seats that starts stories of two or three, and plays two turns of three players",
    async (gameMode) => {
      const generator = new AIStoryGenerator();
      const setup = await generator.generateTemplateSetup("A quiet harbour town", 3, gameMode, 5);

      // As TemplateService.generateTemplate saves it, published with the range the harness gives it
      const template = {
        ...setup,
        id: "harness-group-template",
        playerCountMin: 2,
        playerCountMax: 3,
        gameMode,
        maxTurnsMin: 5,
        maxTurnsMax: 5,
        tags: [],
        containsImages: false,
      } as unknown as Parameters<typeof createStoryStateFromTemplate>[1];
      expect(templateStartProblem(template, 3)).toBeNull();
      expect(templateStartProblem(template, 2)).toBeNull();

      const difficulty = template.difficultyLevels?.[0] ?? { title: "Balanced", modifier: 0 };
      const seats = ["player1", "player2", "player3"] as const;
      let story = Story.create(
        createStoryStateFromTemplate("harness-group-story", template, 3, 5, false, false, difficulty, {
          player1: "code-1",
          player2: "code-2",
          player3: "code-3",
        })
      );
      for (const seat of seats) {
        const options = story.getState().characterSelectionOptions[seat];
        expect(options.possibleCharacterIdentities.length).toBeGreaterThan(0);
        expect(options.possibleCharacterBackgrounds.length).toBeGreaterThan(0);
        story = story.setCharacterSelection(seat, options.possibleCharacterIdentities[0], options.possibleCharacterBackgrounds[0], 0, 0);
      }

      // The first turn (a switch every player is in), then the first thread, which groups every player
      story = await nextTurn(generator, story.completeCharacterSelection());
      for (const seat of seats) {
        const beat = story.getCurrentBeat(seat);
        expect(beat?.text).toContain(PLACEHOLDER_MARK);
        expect(beat?.options.length).toBeGreaterThanOrEqual(2);
        // The group journey finds each seat's choices by this text (harness/steps/group.mjs)
        for (const option of beat?.options ?? []) expect(option.text).toContain("(placeholder ");
        story = BeatResolutionService.resolveChoice(story.updateChoice(seat, 0), seat, 0, difficulty);
      }
      const firstTexts = Object.fromEntries(seats.map((seat) => [seat, (story.getCurrentBeat(seat)?.options ?? []).map((option) => option.text)]));
      story = await nextTurn(generator, story);
      for (const seat of seats) {
        expect(story.getState().players[seat].beatHistory).toHaveLength(2);
        const options = story.getCurrentBeat(seat)?.options ?? [];
        expect(options.length).toBeGreaterThanOrEqual(2);
        expect(options.some((option) => !firstTexts[seat].includes(option.text))).toBe(true);
      }
      expect(requests.filter((r) => r.kind === "unhandled" || r.kind === "error")).toEqual([]);
    },
    60_000
  );

  // run.mjs's --story-length; 25 is the longest World the editor offers
  it.each([3, 4, 5, 25])(
    "plays a %i-turn single-player story to its ending, on the beat after its last turn, with choices that differ",
    async (maxTurns) => {
      const from = logged.length;
      const generator = new AIStoryGenerator();
      const { story: start, difficulty } = await storyOfLength(generator, ["player1"], GameModes.SinglePlayer, maxTurns);
      const initial = start.getState();
      // Stats start at different values, not all at zero
      const starts = [...initial.sharedStatValues, ...initial.players.player1.statValues].map((stat) => stat.value);
      expect(new Set(starts).size).toBeGreaterThan(1);

      const { story, played } = await playToEnding(generator, start, ["player1"], difficulty, maxTurns + 4);

      // The ending comes as soon as the engine allows: the beat after the last turn, not before
      expect(played).toHaveLength(maxTurns + 1);
      expect(played.slice(0, -1).every((turn) => turn.type !== "ending")).toBe(true);
      expect(played.at(-1)).toMatchObject({ turn: maxTurns + 1, type: "ending" });
      expect(story.getState().players.player1.beatHistory).toHaveLength(maxTurns + 1);
      expect(played.at(-1)?.beats.player1?.title).toBe("The End");
      expect(played.at(-1)?.beats.player1?.text).toContain(PLACEHOLDER_MARK);

      // The turns in chapters offer challenges of every risk, with different points and bonuses on the story's own stats
      const challenges = played.filter((turn) => turn.type === "thread").flatMap((turn) => challengeOptions(turn.beats.player1));
      expect(challenges.length).toBeGreaterThanOrEqual(4);
      expect(new Set(challenges.map((option) => option.riskType))).toEqual(new Set(["safe", "normal", "risky"]));
      expect(new Set(challenges.map((option) => option.basePoints)).size).toBeGreaterThan(1);
      const bonuses = challenges.flatMap((option) => option.modifiersToSuccessRate);
      expect(bonuses.length).toBeGreaterThan(0);
      for (const bonus of bonuses) expect(story.getStatById(bonus.statId)).not.toBeNull();
      expect(new Set(bonuses.map((bonus) => bonus.effect)).size).toBeGreaterThan(1);
      // A switch offers ways to explore
      for (const turn of played.filter((t) => t.type === "switch")) {
        expect(turn.beats.player1?.options.every((option) => option.optionType === "exploration")).toBe(true);
      }

      // Stats move as the story goes
      expect(new Set(played.map((turn) => turn.values)).size).toBeGreaterThan(1);

      expect(repairKindsLogged(from).filter((kind) => REPAIRS_THE_FAKE_AVOIDS.includes(kind))).toEqual([]);
      expect(requests.filter((r) => r.kind === "unhandled" || r.kind === "error")).toEqual([]);
    },
    120_000
  );

  it("gives a story the same choices and stat moves when its requests arrive numbered differently, as pregeneration reorders them", async () => {
    const generator = new AIStoryGenerator();
    const world = await draftWorld(generator, ["player1"], GameModes.SinglePlayer, 5);
    /** Each turn's challenges (risk, points, bonuses) and the stats after it */
    const variety = (played: PlayedTurn[]) =>
      played.map((turn) => ({
        turn: turn.turn,
        type: turn.type,
        challenges: challengeOptions(turn.beats.player1).map((o) => [o.riskType, o.basePoints, o.modifiersToSuccessRate.map((b) => [b.statId, b.effect])]),
        values: turn.values,
      }));

    const first = startOn(world, ["player1"]);
    const once = await playToEnding(generator, first.story, ["player1"], first.difficulty, 9);
    // Requests in between, so every request of the second story arrives at another number than the first's
    const before = requests.length;
    await new ContentFilterService().isAppropriatePrompt("A quiet harbour town");
    expect(requests.length).toBeGreaterThan(before);
    const second = startOn(world, ["player1"]);
    const again = await playToEnding(generator, second.story, ["player1"], second.difficulty, 9);

    expect(again.played.at(-1)?.type).toBe("ending");
    expect(variety(again.played)).toEqual(variety(once.played));
  }, 60_000);

  it("plays a 3-turn cooperative story of three players to its ending, each seat with its own risks and bonuses", async () => {
    const from = logged.length;
    const seats: Seat[] = ["player1", "player2", "player3"];
    const generator = new AIStoryGenerator();
    const { story: start, difficulty } = await storyOfLength(generator, seats, GameModes.Cooperative, 3);

    const { story, played } = await playToEnding(generator, start, seats, difficulty, 7);

    expect(played.at(-1)).toMatchObject({ turn: 4, type: "ending" });
    expect(played.slice(0, -1).every((turn) => turn.type !== "ending")).toBe(true);
    for (const seat of seats) {
      expect(story.getState().players[seat].beatHistory).toHaveLength(4);
      expect(played.at(-1)?.beats[seat]?.title).toBe("The End");
    }

    const sharedIds = new Set(story.getState().sharedStats.map((stat) => stat.id));
    for (const turn of played.filter((t) => t.type === "thread")) {
      // Each seat's options start at a different risk
      expect(new Set(seats.map((seat) => challengeOptions(turn.beats[seat])[0]?.riskType)).size).toBe(seats.length);
      for (const seat of seats) {
        for (const bonus of challengeOptions(turn.beats[seat]).flatMap((option) => option.modifiersToSuccessRate)) {
          expect(story.getStatById(bonus.statId)).not.toBeNull();
          // A bonus on a player stat names the seat's own
          if (!sharedIds.has(bonus.statId)) expect(bonus.statId.startsWith(`${seat}_`)).toBe(true);
        }
      }
    }
    expect(new Set(played.map((turn) => turn.values)).size).toBeGreaterThan(1);

    expect(repairKindsLogged(from).filter((kind) => REPAIRS_THE_FAKE_AVOIDS.includes(kind))).toEqual([]);
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
