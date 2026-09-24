import { selectBeatCases } from "../../../../src/evals/imageModelEval/cases.js";
import type {
  BeatCandidate,
  EvalReference,
} from "../../../../src/evals/imageModelEval/cases.js";

function ref(id: string, alt = id, subDirectory?: string): EvalReference {
  return {
    reference: {
      id,
      source: "template",
      sourceId: "tpl",
      subDirectory,
      fileType: "jpeg",
    },
    path: `/data/templates/tpl/images/${subDirectory ? `${subDirectory}/` : ""}${id}.jpeg`,
    alt,
  };
}

const player = ref("player1_0", "Player character (Ari)", "players");

let counter = 0;
function candidate(overrides: Partial<BeatCandidate> = {}): BeatCandidate {
  counter++;
  return {
    storyId: "story-a",
    groupKey: "template-a",
    fileName: "story.json",
    fromStoryJson: true,
    requestId: `request-${counter}`,
    beatIndex: counter,
    scene: `Scene ${counter} in a quiet town`,
    prompt: `Full prompt ${counter}`,
    styleNotes: "- Visual style: watercolor",
    references: [ref(`element-${counter}`)],
    ...overrides,
  };
}

const allFilesExist = () => true;

describe("selectBeatCases", () => {
  beforeEach(() => {
    counter = 0;
  });

  it("keeps one candidate per story and request id, preferring story.json", () => {
    const fromPregeneration = candidate({
      requestId: "same",
      fileName: "pregeneration_1_player1_0.json",
      fromStoryJson: false,
      scene: "pregeneration copy",
    });
    const fromStory = candidate({ requestId: "same", scene: "story copy" });

    const { selected } = selectBeatCases([fromPregeneration, fromStory], {
      fileExists: allFilesExist,
    });

    expect(selected).toHaveLength(1);
    expect(selected[0].scene).toBe("story copy");
  });

  it("skips candidates with an unresolvable or missing reference", () => {
    const unresolvable = candidate({ references: null });
    const missingFile = candidate({ references: [ref("gone")] });
    const fine = candidate();

    const { selected } = selectBeatCases([unresolvable, missingFile, fine], {
      fileExists: (p) => !p.includes("gone"),
    });

    expect(selected.map((c) => c.requestId)).toEqual([fine.requestId]);
  });

  it("skips candidates whose rater-visible text would reveal a model", () => {
    const soraReference = candidate({ references: [ref("sora", "Sora")] });
    const flareStyle = candidate({
      styleNotes: "- Visual style: cinematic, soft lens flare",
    });
    const modelInScene = candidate({ scene: "A poster that says gpt-image-2" });
    const egypt = candidate({ scene: "A market street in Egypt at noon" });

    const { selected } = selectBeatCases(
      [soraReference, flareStyle, modelInScene, egypt],
      { fileExists: allFilesExist }
    );

    expect(selected.map((c) => c.requestId)).toEqual([egypt.requestId]);
  });

  it("defers a repeated reference set until the group's other sets are used", () => {
    const first = candidate({ beatIndex: 1, references: [ref("cafe"), ref("lucas")] });
    const sameSet = candidate({ beatIndex: 2, references: [ref("lucas"), ref("cafe")] });
    const other = candidate({ beatIndex: 3, references: [ref("bakery")] });

    const { selected } = selectBeatCases([first, sameSet, other], {
      fileExists: allFilesExist,
    });

    expect(selected.map((c) => c.requestId)).toEqual([
      first.requestId,
      other.requestId,
      sameSet.requestId,
    ]);
  });

  it("puts candidates that reference a player portrait first within a group", () => {
    const withoutPlayer = candidate({ beatIndex: 1 });
    const withPlayer = candidate({ beatIndex: 2, references: [player, ref("cafe")] });

    const { selected } = selectBeatCases([withoutPlayer, withPlayer], {
      fileExists: allFilesExist,
    });

    expect(selected[0].requestId).toBe(withPlayer.requestId);
  });

  it("picks round-robin across groups", () => {
    const a1 = candidate({ groupKey: "template-a" });
    const a2 = candidate({ groupKey: "template-a" });
    const a3 = candidate({ groupKey: "template-a" });
    const b1 = candidate({ groupKey: "template-b", storyId: "story-b" });

    const { selected } = selectBeatCases([a1, a2, a3, b1], {
      fileExists: allFilesExist,
    });

    expect(selected.map((c) => c.requestId)).toEqual([
      a1.requestId,
      b1.requestId,
      a2.requestId,
      a3.requestId,
    ]);
  });

  it("returns the requested count plus reserves, or fewer when the pool is small", () => {
    const pool = Array.from({ length: 20 }, () => candidate());

    const full = selectBeatCases(pool, { fileExists: allFilesExist });
    const small = selectBeatCases(pool.slice(0, 13), { fileExists: allFilesExist });

    expect(full.selected).toHaveLength(12);
    expect(full.reserves).toHaveLength(3);
    expect(small.selected).toHaveLength(12);
    expect(small.reserves).toHaveLength(1);
  });
});
