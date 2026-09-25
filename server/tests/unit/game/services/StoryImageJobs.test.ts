import { jest } from "@jest/globals";
import type { Beat, ImageRequest, PlayerState } from "core/types/index.js";
import type { Story } from "core/models/Story.js";
import {
  applyImageOutcome,
  collectLatestBeatImageRequests,
  mergeImageRecords,
  startBackgroundImageGeneration,
} from "../../../../src/game/services/StoryImageJobs.js";
import type {
  ImageOutcomeOperation,
  StoryImageJobDeps,
} from "../../../../src/game/services/StoryImageJobs.js";
import { createMockStory } from "../../../helpers/testHelpers.js";

const GAME_ID = "game-under-test";

function request(id: string): ImageRequest {
  return { id, caption: `caption of ${id}`, prompt: id, referenceImageIds: [] };
}

function beat(imageRequest?: ImageRequest | string): Beat {
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
      optionConsiderations: "",
    },
    title: "A beat",
    text: "Some text",
    summary: "A summary",
    options: [],
    interludes: [],
    choice: -1,
    resolution: null,
    ...(imageRequest === undefined ? {} : { imageRequest }),
  };
}

function player(beatHistory: Beat[]): PlayerState {
  return {
    name: "Test Player",
    pronouns: {
      personal: "they",
      object: "them",
      possessive: "their",
      reflexive: "themselves",
    },
    appearance: "",
    fluff: "",
    outcomes: [],
    statValues: [],
    knownStoryElements: [],
    beatHistory,
    previousTypesOfThreads: [],
    identityChoice: 0,
    backgroundChoice: 0,
  };
}

/** A generator that fails every request whose id mentions "refused". */
function makeDeps() {
  const enqueued: ImageOutcomeOperation[] = [];
  const generate = jest.fn<StoryImageJobDeps["generate"]>(
    async (_story: Story, req: ImageRequest) => {
      if (req.id.includes("refused")) {
        throw new Error("moderation_blocked");
      }
    }
  );
  const deps: StoryImageJobDeps = {
    generate,
    enqueue: async (operation) => {
      enqueued.push(operation);
    },
  };
  return { deps, enqueued, generate };
}

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("collectLatestBeatImageRequests", () => {
  it("collects the latest beat's request of each player that is neither written nor failed", () => {
    const story = createMockStory({
      players: {
        player1: player([beat(request("old_beat")), beat(request("new_one"))]),
        player2: player([beat(request("in_library"))]),
        player3: player([beat(request("already_failed"))]),
        player4: player([beat("none")]),
      },
      images: [{ id: "in_library", source: "story" }],
      failedImageIds: ["already_failed"],
    });

    expect(collectLatestBeatImageRequests(story).map((r) => r.id)).toEqual([
      "new_one",
    ]);
  });
});

describe("startBackgroundImageGeneration", () => {
  it("attaches written beat images and records failed ones", async () => {
    const { deps, enqueued } = makeDeps();
    const story = createMockStory();

    await startBackgroundImageGeneration(
      deps,
      GAME_ID,
      story,
      [request("harbour"), request("refused_harbour")],
      { attachToLibrary: true }
    );

    expect(enqueued).toEqual([
      {
        type: "attachImageToStory",
        gameId: GAME_ID,
        input: { imageId: "harbour", caption: "caption of harbour" },
      },
      {
        type: "recordImageFailure",
        gameId: GAME_ID,
        input: { imageId: "refused_harbour" },
      },
    ]);
  });

  it("records failures but attaches nothing for images kept out of the library", async () => {
    const { deps, enqueued } = makeDeps();
    const story = createMockStory();

    await startBackgroundImageGeneration(
      deps,
      GAME_ID,
      story,
      [request("player1_0"), request("refused_cover")],
      { attachToLibrary: false }
    );

    expect(enqueued).toEqual([
      {
        type: "recordImageFailure",
        gameId: GAME_ID,
        input: { imageId: "refused_cover" },
      },
    ]);
  });
});

describe("mergeImageRecords", () => {
  it("carries written images and recorded failures from the latest story into an older copy", () => {
    const latest = createMockStory({
      images: [
        { id: "harbour", source: "story" },
        { id: "mill", source: "story" },
      ],
      failedImageIds: ["refused_market"],
    });
    const olderCopy = createMockStory({
      images: [{ id: "harbour", source: "story" }],
    });

    const merged = mergeImageRecords(latest, olderCopy);

    expect(merged.getImages().map((image) => image.id)).toEqual([
      "harbour",
      "mill",
    ]);
    expect(merged.getFailedImageIds()).toEqual(["refused_market"]);
  });

  it("lets an image the older copy already holds outrank a failure of the same id", () => {
    const latest = createMockStory({ failedImageIds: ["harbour"] });
    const withImage = createMockStory({
      images: [{ id: "harbour", source: "story" }],
    });

    expect(mergeImageRecords(latest, withImage).getFailedImageIds()).toEqual(
      []
    );
  });
});

describe("applyImageOutcome", () => {
  it("adds an attached image to the library and clears an earlier failure of the same id", () => {
    const story = createMockStory({ failedImageIds: ["harbour"] });

    const updated = applyImageOutcome(story, {
      type: "attachImageToStory",
      gameId: GAME_ID,
      input: { imageId: "harbour", caption: "The harbour" },
    });

    expect(updated.getImages()).toEqual([
      { id: "harbour", source: "story", description: "The harbour" },
    ]);
    expect(updated.getFailedImageIds()).toEqual([]);
  });

  it("attaches an image once when two generations of the same request both succeed", () => {
    const attach: ImageOutcomeOperation = {
      type: "attachImageToStory",
      gameId: GAME_ID,
      input: { imageId: "harbour", caption: "The harbour" },
    };

    const twice = applyImageOutcome(
      applyImageOutcome(createMockStory(), attach),
      attach
    );

    expect(twice.getImages().map((image) => image.id)).toEqual(["harbour"]);
  });

  it("records a failure once", () => {
    const failure: ImageOutcomeOperation = {
      type: "recordImageFailure",
      gameId: GAME_ID,
      input: { imageId: "harbour" },
    };

    const once = applyImageOutcome(createMockStory(), failure);
    const twice = applyImageOutcome(once, failure);

    expect(twice.getFailedImageIds()).toEqual(["harbour"]);
  });

  it("ignores a failure for an image that was written after all", () => {
    const story = createMockStory({
      images: [{ id: "harbour", source: "story" }],
    });

    const updated = applyImageOutcome(story, {
      type: "recordImageFailure",
      gameId: GAME_ID,
      input: { imageId: "harbour" },
    });

    expect(updated.getFailedImageIds()).toEqual([]);
  });
});
