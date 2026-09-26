import { jest } from "@jest/globals";
import { GameModes, type Beat, type StoryState } from "core/types/index.js";
import {
  analysisCase,
  caseStory,
  continuationCase,
  endingCase,
  iterationCases,
  pairParentsAndChildren,
  selectSubset15,
  type IterationSource,
  type Snapshot,
} from "../../../../src/evals/textModelEval/cases.js";
import { LEAK_PATTERN } from "../../../../src/evals/textModelEval/blinding.js";
import { SETUP_PREMISES } from "../../../../src/evals/textModelEval/setupPremises.js";
import { createMockStoryState } from "../../../helpers/testHelpers.js";
import { beatGeneration, switchAnalysis, threadAnalysis } from "../../../helpers/textFixtures.js";
import { evalCase, tags } from "./fixtures.js";

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

function beat(text: string, choice = -1, resolution: Beat["resolution"] = null): Beat {
  return { ...beatGeneration({ text }), choice, resolution };
}

function stateWith(beats: Beat[], phases: StoryState["storyPhases"] = []): StoryState {
  const base = createMockStoryState({ maxTurns: 25 });
  return { ...base, storyPhases: phases, players: { player1: { ...base.players.player1, beatHistory: beats } } };
}

/** story.json at turn 1 (played), its pregeneration at turn 1 option 2 (adopted), and a child of that. */
function threeSnapshots(): Snapshot[] {
  const switchPhase = switchAnalysis(["player1"], 0);
  const thread = threadAnalysis("challenge", 2, 1);
  const played = stateWith([beat("First", 2, "resolution3"), beat("Second")], [switchPhase]);
  const adopted: Snapshot = { unit: "story-a", file: "pregeneration_1_player1_2.json", choiceTurn: 1, option: 2, state: stateWith([beat("First", 2, "resolution3"), beat("Second")], [switchPhase]) };
  const unadopted: Snapshot = { unit: "story-a", file: "pregeneration_1_player1_0.json", choiceTurn: 1, option: 0, state: stateWith([beat("First", 0, "resolution1"), beat("Other")], [switchPhase]) };
  const child: Snapshot = {
    unit: "story-a",
    file: "pregeneration_2_player1_1.json",
    choiceTurn: 2,
    option: 1,
    state: stateWith([beat("First", 2, "resolution3"), beat("Second", 1, "resolution2"), beat("Third")], [switchPhase, thread]),
  };
  return [{ unit: "story-a", file: "story.json", state: played }, adopted, unadopted, child];
}

describe("pairParentsAndChildren", () => {
  it("pairs the adopted snapshot with the pregeneration made from it", () => {
    const { units, unadopted } = pairParentsAndChildren(threeSnapshots());
    expect(units.map((u) => [u.parent.file, u.child.file])).toEqual([["pregeneration_1_player1_2.json", "pregeneration_2_player1_1.json"]]);
    // Never played on: the sibling option, and the child itself (nothing was generated after it)
    expect(unadopted.map((s) => s.file).sort()).toEqual(["pregeneration_1_player1_0.json", "pregeneration_2_player1_1.json"]);
  });
});

describe("continuationCase", () => {
  it("carries the child's choice and resolution and fixes its new analysis", () => {
    const [unit] = pairParentsAndChildren(threeSnapshots()).units;
    const c = continuationCase(unit.parent, unit.child);
    const current = c.state?.players.player1.beatHistory[1];
    expect(current).toMatchObject({ choice: 1, resolution: "resolution2" });
    expect(c.fixedAnalysis?.kind).toBe("thread");
    expect(c.tags).toMatchObject({ hasStoredOutput: true, analysisTurn: true });
    expect((c.storedOutput as Record<string, Beat>).player1.text).toBe("Third");
    // The beat input has the thread phase, and the player's previous thread types include it
    const story = caseStory(c);
    expect(story.getCurrentBeatType()).toBe("thread");
    expect(story.getPlayer("player1")?.previousTypesOfThreads).toContain("Chase");
    expect(analysisCase(unit)?.role).toBe("thread");
  });

  it("freezes a synthetic choice on an unplayed snapshot", () => {
    const { unadopted } = pairParentsAndChildren(threeSnapshots());
    const a = continuationCase(unadopted[0]);
    const b = continuationCase(unadopted[0]);
    expect(a.state?.players.player1.beatHistory[1].choice).toBeGreaterThanOrEqual(0);
    expect(a.state?.players.player1.beatHistory[1].choice).toBe(b.state?.players.player1.beatHistory[1].choice);
    expect(a.tags.source).toBe("synthetic");
  });
});

describe("endingCase", () => {
  it("makes the last beat an ending when the choice resolves the thread", () => {
    const thread = threadAnalysis("challenge", 1, 1);
    const resolvedThread = threadAnalysis("challenge", 1, 1);
    resolvedThread.threads[0].progression[0].resolution = "favorable";
    const parent: Snapshot = { unit: "s", file: "story.json", state: stateWith([beat("A", 0, "resolution1"), beat("B")], [switchAnalysis(["player1"]), thread]) };
    const child: Snapshot = { unit: "s", file: "pregeneration_2_player1_0.json", choiceTurn: 2, option: 0, state: stateWith([beat("A", 0, "resolution1"), beat("B", 0, "favorable"), beat("C")], [switchAnalysis(["player1"]), resolvedThread, switchAnalysis(["player1"], 2)]) };
    const ending = endingCase({ parent, child });
    expect(ending?.tags.ending).toBe(true);
    expect(caseStory(ending ?? evalCase("x", "beat")).getCurrentBeatType()).toBe("ending");

    const unresolved: Snapshot = { ...child, state: stateWith(child.state.players.player1.beatHistory, [switchAnalysis(["player1"]), thread]) };
    expect(endingCase({ parent, child: unresolved })).toBeUndefined();
  });
});

describe("selectSubset15", () => {
  it("is deterministic and stratified", () => {
    const cases = [
      ...Array.from({ length: 20 }, (_, i) => evalCase(`sp-${i}`, "beat")),
      ...Array.from({ length: 4 }, (_, i) => evalCase(`first-${i}`, "beat", { tags: tags({ firstBeat: true }) })),
      ...Array.from({ length: 5 }, (_, i) => evalCase(`mp-${i}`, "beat", { tags: tags({ multiplayer: true, players: 2 }) })),
      ...Array.from({ length: 3 }, (_, i) => evalCase(`end-${i}`, "beat", { tags: tags({ ending: true }) })),
    ];
    const subset = selectSubset15(cases);
    expect([...subset].sort()).toEqual([...selectSubset15([...cases].reverse())].sort());
    const count = (prefix: string) => [...subset].filter((id) => id.startsWith(prefix)).length;
    expect([count("sp-"), count("first-"), count("mp-"), count("end-")]).toEqual([9, 2, 3, 1]);
  });
});

describe("iterationCases", () => {
  it("never carries the template creator's id or username", () => {
    const template: IterationSource & { title: string } = {
      id: "t-1",
      title: "A template",
      creatorId: "user-42",
      creatorUsername: "odin",
      playerCountMin: 1,
      gameMode: GameModes.SinglePlayer,
      maxTurnsMin: 25,
      containsImages: true,
      tags: [],
    };
    const [c] = iterationCases([template]);
    expect(c.iteration?.template.title).toBe("A template");
    expect(JSON.stringify(c.iteration?.template)).not.toMatch(/user-42|odin|creator/);
  });
});

describe("setup premises", () => {
  it("never match the blinding pattern", () => {
    expect(SETUP_PREMISES).toHaveLength(18);
    for (const p of SETUP_PREMISES) {
      expect(LEAK_PATTERN.test(p.premise)).toBe(false);
    }
  });
});
