import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Story } from "core/models/Story.js";
import { GameModes, type PlayerCount } from "core/types/index.js";
import {
  CHAIN_ARMS,
  SETUP_CHAIN_PREMISES,
  chainFile,
  chainRunsFrom,
  chainSetupInput,
  mergeChainRuns,
  playSetupChain,
  renderChainReport,
  storyFromSetup,
  triggerEdit,
  withTriggerEdit,
  type ChainCall,
} from "../../../../src/evals/textModelEval/setupChain.js";
import { SETUP_PREMISES } from "../../../../src/evals/textModelEval/setupPremises.js";
import { requestFor, requestText, type SetupInput } from "../../../../src/evals/textModelEval/variants.js";
import { beatSet, challengeOptions, outcome, stat, switchAnalysis, threadAnalysis } from "../../../helpers/textFixtures.js";

/*
 * Setup round 3's setup-to-play chain: a new setup on the final setup form,
 * then play as the game plays it (planner v2 with two-sided contests, today's
 * turn form with B6 for one player and today's form for groups) through the
 * first chapter to the switch turn after it, with one extra switch plan on
 * the state a stat trigger names (the trigger probe).
 */

const slots = (players: number) => Array.from({ length: players }, (_, i) => `player${i + 1}`);

/** A setup reply as the game saves it (the generation order assembled). */
function setupReply(players: number) {
  const seat = (slot: string) => ({
    outcomes: [outcome(`${slot}_main`, { intendedNumberOfMilestones: 2 }), outcome(`${slot}_side`, { intendedNumberOfMilestones: 1 })],
    possibleCharacterIdentities: ["Ada", "Bram", "Cato"].map((name) => ({
      name: `${name} ${slot}`,
      pronouns: { personal: "they", object: "them", possessive: "their", reflexive: "themselves" },
      appearance: "tall",
    })),
    possibleCharacterBackgrounds: [1, 2, 3].map((i) => ({ title: `B${i}`, fluffTemplate: "{name} sails.", initialPlayerStatValues: [{ statId: "player_courage", value: 40 + i }] })),
  });
  return {
    guidelines: {
      world: "A harbour.",
      rules: ["The tide rules."],
      tone: ["Salty."],
      conflicts: ["Stay or sail."],
      decisions: ["Who to trust."],
      typesOfThreads: ["Harbour chase (challenge, 2): outrun the tide"],
      switchAndThreadInstructions: ["The first thread is about the missing ferry.", "When Supplies falls below 30%, the next thread is about finding food."],
    },
    difficultyLevel: { modifier: 7, title: "Odd" },
    storyElements: [{ id: "ferry", name: "The Ferry", role: "A prize.", instructions: "Slow.", appearance: "Old.", facts: ["Leaks.", "Owed money.", "Blue."] }],
    ...(players > 1 ? { sharedOutcomes: [outcome("shared_harbour", { intendedNumberOfMilestones: 3 })] } : {}),
    statGroups: ["Crew"],
    sharedStats: [stat("shared_supplies", { name: "Supplies", initialValue: 60 })],
    playerStats: [stat("player_courage", { name: "Courage", partOfPlayerBackgrounds: true })],
    characterSelectionPlan: { multiplayerCoordination: [], playerStatConversionRates: [], backgroundArchetypes: [] },
    ...Object.fromEntries(slots(players).map((slot) => [slot, seat(slot)])),
    title: "The Harbour",
    characterSelectionIntroduction: { title: "Who sails?", text: "Pick." },
    imageInstructions: { visualStyle: "", atmosphere: "", colorPalette: "", settingDetails: "", characterStyle: "", artInfluences: "", coverPrompt: "" },
  };
}

const input = (players: PlayerCount, maxTurns = 25): SetupInput => ({
  premise: "Sailors in a harbour town.",
  playerCount: players,
  gameMode: players > 1 ? GameModes.Cooperative : GameModes.SinglePlayer,
  maxTurns,
});

/** Replies by role, in the stored shape; a chapter of two beats on the first player's main outcome, grouping every player. */
function fakeCall(players: number, overrides: Partial<Record<string, unknown>> = {}): { call: ChainCall; calls: Parameters<ChainCall>[0][] } {
  const calls: Parameters<ChainCall>[0][] = [];
  const call: ChainCall = async (spec) => {
    calls.push(spec);
    if (spec.role in overrides) return overrides[spec.role] === undefined ? undefined : { parsed: overrides[spec.role], outputFile: "outputs/x.json", latencyMs: 1_000, costUsd: 0.001 };
    const outcomeId = players > 1 ? "shared_harbour" : "player1_main";
    const parsed =
      spec.role === "setup"
        ? setupReply(players)
        : spec.role === "switch"
          ? { ...switchAnalysis(slots(players)), switches: [{ ...switchAnalysis(slots(players)).switches[0], type: "flavor", outcomeId, question: "Will the harbour hold?", topicChoices: [] }] }
          : spec.role === "thread"
            ? { ...threadAnalysis("challenge", 2, 1, slots(players)), threads: [{ ...threadAnalysis("challenge", 2, 1, slots(players)).threads[0], outcomeId }] }
            : beatSet(players, Object.fromEntries(slots(players).map((slot) => [slot, { ...beatSet(1).player1, options: challengeOptions() }])));
    return { parsed, outputFile: `outputs/${spec.caseId}.json`, latencyMs: 1_000, costUsd: 0.001 };
  };
  return { call, calls };
}

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  // The dice: a steady roll
  jest.spyOn(Math, "random").mockReturnValue(0.5);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("the chain's premises and arms", () => {
  it("runs four new setups: a short story, a kids story, a two-player contest and three players in two camps", () => {
    expect(SETUP_CHAIN_PREMISES.map((p) => [p.id, p.premiseId, p.maxTurns])).toEqual([
      ["chain-short-subscription", "setup-vent-subscription", 10],
      ["chain-kids-animal-rescue", "setup-kids-animal-rescue", 25],
      ["chain-bounty-hunters", "setup-fiction-bounty-hunters", 25],
      ["chain-cofounders", "setup-pretend-cofounders", 25],
    ]);
    for (const premise of SETUP_CHAIN_PREMISES) expect(SETUP_PREMISES.some((p) => p.id === premise.premiseId)).toBe(true);
  });

  it("reads each premise's frozen text with the chain's story length and the kids tag", () => {
    const [short, kids] = SETUP_CHAIN_PREMISES.map((p) => chainSetupInput(p));
    expect(short).toMatchObject({ playerCount: 1, maxTurns: 10 });
    expect(short.kids).toBeUndefined();
    expect(kids).toMatchObject({ playerCount: 2, gameMode: GameModes.Cooperative, kids: true, maxTurns: 25 });
    expect(kids.premise).toBe(SETUP_PREMISES.find((p) => p.id === "setup-kids-animal-rescue")?.premise);
  });

  it("plays on the final setup form, planner v2 with two-sided contests, B6 alone for one player and today's form for groups", () => {
    expect(CHAIN_ARMS.setup.key).toBe("gpt-6-luna@low/setupR3");
    expect(CHAIN_ARMS.planner.key).toBe("gpt-6-luna@low/planV2b");
    expect(CHAIN_ARMS.turn(1).key).toBe("gpt-6-luna@medium/turnB6");
    expect(CHAIN_ARMS.turn(2).key).toBe("gpt-6-luna@low/prod");
    expect(CHAIN_ARMS.turn(3).key).toBe("gpt-6-luna@low/prod");
  });
});

describe("storyFromSetup: the story a custom setup starts (AIStoryGenerator.createInitialState's state)", () => {
  it("starts every outcome, stat and seat as production does, with no shared list for one player", () => {
    const state = storyFromSetup(setupReply(1), input(1, 10), "chain-x");
    expect(state).toMatchObject({ id: "chain-x", title: "The Harbour", gameMode: GameModes.SinglePlayer, maxTurns: 10, sharedOutcomes: [], storyPhases: [], characterSelectionCompleted: false });
    expect(state.sharedStatValues).toEqual([{ statId: "shared_supplies", value: 60 }]);
    expect(state.players.player1.outcomes.map((o) => o.id)).toEqual(["player1_main", "player1_side"]);
    expect(state.characterSelectionOptions.player1.possibleCharacterIdentities).toHaveLength(3);
    // An out-of-range difficulty falls back to production's Balanced (0)
    expect(state.difficultyLevel).toEqual({ modifier: 0, title: "Balanced" });
    expect(state.category).toBeUndefined();
  });

  it("marks a kids story as read with kids", () => {
    expect(storyFromSetup(setupReply(2), { ...input(2), kids: true }, "chain-k").category).toBe("read-with-kids");
  });

  it("records the camps three seats' roles name, as production keeps them since 2026-10-01, and none where they name none", () => {
    const roles = ["player1: the captain (side A)", "player2: the quartermaster (side B)", "player3: the scout (side B)"];
    const reply = { ...setupReply(3), characterSelectionPlan: { ...setupReply(3).characterSelectionPlan, multiplayerCoordination: roles } };
    const three = { ...input(3 as PlayerCount), gameMode: GameModes.CooperativeCompetitive };
    expect(storyFromSetup(reply, three, "chain-c").camps).toEqual({ player1: "sideA", player2: "sideB", player3: "sideB" });
    expect(storyFromSetup(setupReply(3), three, "chain-c")).not.toHaveProperty("camps");
  });
});

describe("the trigger probe: a stat set to the value a switch rule names", () => {
  const story = (rules: string[], extra: Record<string, unknown> = {}) =>
    Story.create({ ...storyFromSetup({ ...setupReply(1), ...extra, guidelines: { ...setupReply(1).guidelines, switchAndThreadInstructions: rules } }, input(1), "p") });

  it.each([
    ["When Supplies falls below 30%, the next thread is about finding food.", 25],
    ["If Supplies drops under 20, force a thread about rationing.", 15],
    ["At Supplies 10% or below, the crew mutinies.", 10],
    ["When Supplies rises above 80%, a rival guild notices.", 85],
    ["Once Supplies reaches 100%, the ferry can sail.", 100],
  ])("%s", (rule, value) => {
    expect(triggerEdit(story([rule]))).toMatchObject({ rule, statId: "shared_supplies", shared: true, value });
  });

  it("reads an opposites stat's second side as 100 minus its value, and a player stat for every player", () => {
    const tug = story(["When Guild's Voice rises above 70, the harbour master strikes back."], {
      sharedStats: [stat("shared_voice", { type: "opposites", name: "Harbour's Voice|Guild's Voice", initialValue: 50 })],
    });
    expect(triggerEdit(tug)).toMatchObject({ statId: "shared_voice", value: 25 });
    const brave = story(["When Courage falls below 30%, the next thread is about fear."]);
    const edit = triggerEdit(brave);
    expect(edit).toMatchObject({ statId: "player_courage", shared: false, value: 25 });
    const edited = withTriggerEdit(brave, edit as NonNullable<typeof edit>);
    expect(edited.getState().players.player1.statValues).toContainEqual({ statId: "player_courage", value: 25 });
  });

  it("finds no probe where no rule names a stat's threshold", () => {
    expect(triggerEdit(story(["The first thread is about the missing ferry.", "Around the middle, a storm hits."]))).toBeUndefined();
  });
});

describe("playSetupChain", () => {
  const premise = SETUP_CHAIN_PREMISES[0];

  it("plays setup, first switch, first turn, the first chapter and the switch turn after it, as the game does", async () => {
    const { call, calls } = fakeCall(1);
    const run = await playSetupChain(premise, input(1), call, { sample: 1 });
    expect(run.steps.map((s) => s.kind)).toEqual(["setup", "switch plan", "first turn", "chapter plan", "chapter opening", "chapter step", "trigger probe", "switch plan", "switch turn"]);
    expect(run.stopped).toBe("the switch turn after the first chapter");
    // Every call on the chain's arms, the setup request as the final form builds it
    expect(calls.map((c) => c.arm.key)).toEqual([
      "gpt-6-luna@low/setupR3",
      "gpt-6-luna@low/planV2b",
      "gpt-6-luna@medium/turnB6",
      "gpt-6-luna@low/planV2b",
      "gpt-6-luna@medium/turnB6",
      "gpt-6-luna@medium/turnB6",
      "gpt-6-luna@low/planV2b",
      "gpt-6-luna@low/planV2b",
      "gpt-6-luna@medium/turnB6",
    ]);
    expect(requestText(calls[0].request)).toBe(requestText(requestFor("setupR3", { role: "setup", setup: input(1) })));
    // Each call has its own case id, in order
    expect(new Set(calls.map((c) => c.caseId)).size).toBe(calls.length);
    expect(calls[0].caseId).toBe("chain-short-subscription-s1-00-setup");
    // The probe edits a copy: the chain's own state keeps the stat's value
    const probe = run.steps.find((s) => s.kind === "trigger probe");
    expect(probe?.edit).toMatchObject({ statId: "shared_supplies", value: 25 });
    expect(run.end?.sharedStatValues.find((v) => v.statId === "shared_supplies")?.value).not.toBe(25);
    // Choices are recorded on the turns, by hash, with their results
    const opening = run.steps.find((s) => s.kind === "chapter opening");
    expect(opening?.choices?.[0]).toMatchObject({ slot: "player1" });
    expect(run.start?.characterSelectionCompleted).toBe(true);
  });

  it("uses today's form on Luna low for group turns", async () => {
    const { call, calls } = fakeCall(2);
    const run = await playSetupChain(SETUP_CHAIN_PREMISES[1], { ...input(2), kids: true }, call, { sample: 1 });
    expect(run.steps.map((s) => s.kind).slice(0, 5)).toEqual(["setup", "switch plan", "first turn", "chapter plan", "chapter opening"]);
    expect(calls.filter((c) => c.role === "beat").every((c) => c.arm.key === "gpt-6-luna@low/prod")).toBe(true);
    expect(requestText(calls[0].request)).toContain("A child reads this story along with an adult");
  });

  it("stops where a call brings nothing back, and says where", async () => {
    const { call } = fakeCall(1, { thread: undefined });
    const run = await playSetupChain(premise, input(1), call, { sample: 1 });
    expect(run.steps.map((s) => s.kind)).toEqual(["setup", "switch plan", "first turn", "chapter plan"]);
    expect(run.stopped).toMatch(/chapter plan.*no usable reply/);
    const { call: noSetup } = fakeCall(1, { setup: undefined });
    expect((await playSetupChain(premise, input(1), noSetup, { sample: 1 })).steps).toHaveLength(1);
  });

  it("merges a new run into the chain file's runs, a chain and sample replaced, the others kept in the chains' order", async () => {
    const { call } = fakeCall(1);
    const [short, kids] = [SETUP_CHAIN_PREMISES[0], SETUP_CHAIN_PREMISES[1]];
    const shortRun = await playSetupChain(short, input(1), call, { sample: 1 });
    const kidsRun = { ...shortRun, premise: kids };
    const again = { ...shortRun, stopped: "again" };
    expect(mergeChainRuns([kidsRun], [shortRun]).map((r) => r.premise.id)).toEqual([short.id, kids.id]);
    expect(mergeChainRuns([shortRun, kidsRun], [again]).map((r) => [r.premise.id, r.stopped])).toEqual([
      [short.id, "again"],
      [kids.id, shortRun.stopped],
    ]);
    expect(mergeChainRuns([shortRun], [{ ...shortRun, sample: 2 }]).map((r) => r.sample)).toEqual([1, 2]);
  });

  it("reads a chain file back as it was written, and loads a step's output from its output file where the file lacks it", async () => {
    const { call } = fakeCall(1);
    const run = await playSetupChain(premise, input(1), call, { sample: 1 });
    const file = JSON.parse(JSON.stringify(chainFile([run], new Date(0))));
    const load = jest.fn((outputFile: string) => ({ loaded: outputFile.length > 0 }));
    const [back] = chainRunsFrom(file, load);
    expect(renderChainReport([back], new Date(0))).toBe(renderChainReport([run], new Date(0)));
    expect(load).not.toHaveBeenCalled();
    // A file written before outputs were kept
    file.runs[0].steps[0].output = undefined;
    const [older] = chainRunsFrom(file, load);
    expect(older.steps[0].output).toEqual({ loaded: true });
    expect(load).toHaveBeenCalledWith(String(run.steps[0].outputFile));
  });

  it("keeps each step's checks, and a report names what the chain wrote", async () => {
    const { call } = fakeCall(1);
    const run = await playSetupChain(premise, input(1), call, { sample: 1 });
    expect(run.steps.find((s) => s.kind === "setup")?.checks?.checks).toHaveProperty("distinctIdentities");
    expect(run.steps.find((s) => s.kind === "chapter plan")?.checks?.checks).toHaveProperty("lengthAllowed");
    expect(run.steps.find((s) => s.kind === "chapter step")?.checks?.checks).toHaveProperty("noStatReadouts");
    const report = renderChainReport([run], new Date("2026-09-28T12:00:00Z"));
    for (const heading of ["## chain-short-subscription", "### Setup", "### First switch plan", "### Chapter plan", "### Trigger probe", "### Stats at the start and after the chain"]) {
      expect(report).toContain(heading);
    }
    expect(report).toContain("When Supplies falls below 30%, the next thread is about finding food.");
  });
});
