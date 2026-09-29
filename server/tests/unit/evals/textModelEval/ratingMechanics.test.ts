import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Story } from "core/models/Story.js";
import type { BeatOption, ChallengeOption, SetOfBeatGenerationSchema, StoryState } from "core/types/index.js";
import { LEAK_PATTERN } from "../../../../src/evals/textModelEval/blinding.js";
import type { ContextLine } from "../../../../src/evals/textModelEval/ratingContext.js";
import {
  MECHANICS_LABELS,
  choiceLines,
  readTurn,
  tallyTurns,
  turnMechanics,
  turnReadingsFor,
} from "../../../../src/evals/textModelEval/ratingMechanics.js";
import type { CallRecord } from "../../../../src/evals/textModelEval/runner.js";
import { endingBeat, firstSwitchBeat, laterSwitchBeat, threadAnalysisAfterSwitch, threadBeat } from "../../../helpers/promptStories.js";
import { beatGeneration, beatSet, challengeOptions, explorationOptions, stat, threadAnalysis } from "../../../helpers/textFixtures.js";
import { evalCase, record } from "./fixtures.js";

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const SUPPLIES = stat("shared_supplies", { type: "number", name: "Supplies", optionsToSacrifice: "Spend 10 supplies to push on" });
const ORDER = stat("shared_order", { type: "opposites", name: "Order|Chaos" });
const NERVE = stat("player_nerve", { name: "Nerve", optionsToGainAsReward: "Regain 10% nerve by resting" });
const RANK = stat("player_rank", { type: "string", name: "Rank", possibleValues: "Novice, Apprentice, Master", canBeChangedInBeatResolutions: false });
const KIT = stat("player_kit", { type: "string[]", name: "Kit", optionsToSacrifice: "Give up an item" });

type Last = { options: BeatOption[]; choice: number };

/** The story with the stats above, each player holding Nerve 40, Rank Novice and Kit [Rope, Lamp]; its last beat's options and choice replaced when given. */
function withStats(story: Story, last?: Last, overrides: Partial<StoryState> = {}): Story {
  const state = story.getState();
  const players = Object.fromEntries(
    Object.entries(state.players).map(([slot, player]) => {
      const history = [...player.beatHistory];
      if (last && history.length > 0) history[history.length - 1] = { ...history[history.length - 1], options: last.options, choice: last.choice };
      const statValues = [
        { statId: "player_nerve", value: 40 },
        { statId: "player_rank", value: "Novice" },
        { statId: "player_kit", value: ["Rope", "Lamp"] },
      ];
      return [slot, { ...player, statValues, beatHistory: history }];
    })
  );
  return Story.create({
    ...state,
    sharedStats: [SUPPLIES, ORDER],
    sharedStatValues: [
      { statId: "shared_supplies", value: 40 },
      { statId: "shared_order", value: 60 },
    ],
    playerStats: [NERVE, RANK, KIT],
    players,
    ...overrides,
  });
}

/** Each line as "label: text", nested lines after it, indented by depth. */
function flat(lines: ContextLine[] = [], depth = 0): string[] {
  return lines.flatMap((line) => [`${"  ".repeat(depth)}${[line.label, line.text].filter(Boolean).join(": ")}`, ...flat(line.sub, depth + 1)]);
}

const sacrificeLast = (text = "Burn 10 Supplies to press on"): Last => {
  const [lever, a, b] = challengeOptions();
  return { options: [{ ...lever, resourceType: "sacrifice", basePoints: 30, text }, a, b], choice: 0 };
};

const change = (group: string, statId: string, kind: string, value: unknown) => ({ type: "statChange", group, stat: statId, change: kind, value }) as SetOfBeatGenerationSchema["statChanges"][number];

function reply(overrides: Partial<SetOfBeatGenerationSchema> = {}, options: BeatOption[] = challengeOptions()): SetOfBeatGenerationSchema {
  return beatSet(1, { player1: { ...beatGeneration(), options }, ...overrides });
}

describe("choiceLines: each choice's mechanics, as the game plays it", () => {
  const bonus = (statId: string, effect: number, reason = "it fits") => ({ statId, reason, effect });

  it("shows a challenge choice's risk, signed base points and stat bonuses with the reasons players see", () => {
    const story = withStats(threadBeat(1));
    const [a, b, c] = challengeOptions();
    const options: ChallengeOption[] = [
      { ...a, riskType: "safe", basePoints: -5, modifiersToSuccessRate: [bonus("player1_nerve", 10, "steady hands"), bonus("shared_supplies", -5, "short on rope")] },
      { ...b, riskType: "risky", basePoints: 5 },
      c,
    ];
    const lines = flat(choiceLines(story, reply({}, options), "player1"));
    expect(lines).toEqual([
      "Choice 1: challenge · risk safe · base points -5",
      "  Stat bonus: +10 Nerve: steady hands",
      "  Stat bonus: -5 Supplies: short on rope",
      "Choice 2: challenge · risk risky · base points +5",
      "Choice 3: challenge · risk normal · base points 0",
    ]);
  });

  it("shows a bonus as the game counts it: clamped to ±15, only the first two, an id no stat has shown as the game shows it", () => {
    const story = withStats(threadBeat(1));
    const [a, b, c] = challengeOptions();
    const options: ChallengeOption[] = [
      { ...a, modifiersToSuccessRate: [bonus("player_nerve", 20), bonus("player1_luck", 5), bonus("shared_supplies", 5)] },
      b,
      c,
    ];
    const lines = flat(choiceLines(story, reply({}, options), "player1"));
    expect(lines).toContain("  Stat bonus: +15 Nerve (written as +20): it fits");
    expect(lines).toContain("  Stat bonus: +5 player1_luck (no stat has this id: the game counts it and shows the id): it fits");
    expect(lines).toContain("  Stat bonus: +5 Supplies (not counted: only two bonuses count): it fits");
  });

  it("names a sacrifice's or reward's stat, the amount its text gives and what the stat allows", () => {
    const story = withStats(threadBeat(1));
    const [a, b, c] = challengeOptions();
    const options: ChallengeOption[] = [
      { ...a, resourceType: "sacrifice", basePoints: 30, text: "Spend 10 Supplies on a bribe" },
      { ...b, resourceType: "reward", basePoints: -30, text: "Rest by the fire" },
      c,
    ];
    const lines = flat(choiceLines(story, reply({}, options), "player1"));
    expect(lines).toContain("  Sacrifice: Supplies · amount in its text: 10");
    expect(lines).toContain("    The stat allows: Spend 10 supplies to push on");
    // No stat named: the one stat that allows a reward is read as its stat
    expect(lines).toContain("  Reward: Nerve · no amount in its text");
    expect(lines).toContain("    The stat allows: Regain 10% nerve by resting");
  });

  it("names only the stat a lever pays when its text names two: the one that allows the lever, named beside the amount", () => {
    const story = withStats(threadBeat(1));
    const [a, b, c] = challengeOptions();
    const lines = flat(choiceLines(story, reply({}, [{ ...a, resourceType: "sacrifice", basePoints: 30, text: "Burn 10 Supplies to steady your Nerve" }, b, c]), "player1"));
    expect(lines).toContain("  Sacrifice: Supplies · amount in its text: 10");
    expect(lines.filter((line) => line.includes("The stat allows"))).toEqual(["    The stat allows: Spend 10 supplies to push on"]);
  });

  it("finds a sacrificed list item by its value, and says when no stat can be told", () => {
    const story = withStats(threadBeat(1));
    const [a, b, c] = challengeOptions();
    const byValue = flat(choiceLines(story, reply({}, [{ ...a, resourceType: "sacrifice", basePoints: 30, text: "Leave the Lamp behind" }, b, c]), "player1"));
    expect(byValue).toContain("  Sacrifice: Kit · no amount in its text");
    // Two stats allow a sacrifice and the text names neither
    const unknown = flat(choiceLines(story, reply({}, [{ ...a, resourceType: "sacrifice", basePoints: 30, text: "Give it all up" }, b, c]), "player1"));
    expect(unknown).toContain("  Sacrifice: no stat named in its text · no amount in its text");
  });

  it("maps an exploration step's choices to the step's results by position", () => {
    const thread = threadAnalysis("exploration", 3, 2);
    thread.threads[0].progression[0].resolution = "resolution1";
    const base = threadBeat(1);
    const story = withStats(Story.create({ ...base.getState(), storyPhases: [...base.getState().storyPhases.slice(0, -1), thread] }));
    const lines = flat(choiceLines(story, reply({}, explorationOptions()), "player1"));
    expect(lines).toEqual([
      "Choice 1: exploration",
      "  Leads to: Resolution 1: one",
      "Choice 2: exploration",
      "  Leads to: Resolution 2: two",
      "Choice 3: exploration",
      "  Leads to: Resolution 3: three",
    ]);
  });

  it("maps a topic switch's choices to its directions by position", () => {
    const story = withStats(firstSwitchBeat(1));
    const lines = flat(choiceLines(story, reply({}, explorationOptions()), "player1"));
    expect(lines).toEqual(["Choice 1: exploration", "  Leads to: Direction 1: a", "Choice 2: exploration", "  Leads to: Direction 2: b", "Choice 3: exploration", "  Leads to: Direction 3: c"]);
  });

  it("reads the options after the game's repairs: a challenge step's exploration option plays as a challenge", () => {
    const story = withStats(threadBeat(1));
    const [first] = flat(choiceLines(story, readTurn(story, reply({}, explorationOptions())).reply, "player1"));
    expect(first).toBe("Choice 1: challenge · risk normal · base points 0");
  });

  it("reads bonuses after the game's repairs: the doubled seat form names its stat, as the roll breakdown now does", () => {
    const story = withStats(threadBeat(1));
    const [a, b, c] = challengeOptions();
    const options: ChallengeOption[] = [{ ...a, modifiersToSuccessRate: [bonus("player1_player_nerve", 10, "steady hands")] }, b, c];
    const lines = flat(choiceLines(story, readTurn(story, reply({}, options)).reply, "player1"));
    expect(lines).toContain("  Stat bonus: +10 Nerve: steady hands");
  });
});

describe("readTurn and turnMechanics: what the turn changes, after the game's repairs", () => {
  it("shows each stat change as before → after on the case's state, in the stat's own form", () => {
    const story = withStats(threadBeat(1));
    const written = reply({
      statChanges: [
        change("shared", "shared_supplies", "subtractNumber", 10),
        change("player1", "player_nerve", "addNumber", 5),
        change("player1", "player_kit", "removeElement", "Rope"),
        change("shared", "shared_order", "setNumber", 50),
        change("player1", "player_kit", "addElement", "Map"),
      ],
    });
    const lines = flat(turnMechanics(story, written)?.changes);
    expect(lines).toEqual([
      "Stat changes",
      "  Supplies: 40 → 30",
      "  Nerve: 40% → 45%",
      "  Kit: Rope, Lamp → Lamp",
      "  Order|Chaos: 60|40 → 50|50",
      "  Kit: Lamp → Lamp, Map",
    ]);
  });

  it("reads a stat id in seat form as the player's stat, and lists what the game drops", () => {
    const story = withStats(threadBeat(1));
    const written = reply({ statChanges: [change("player1", "player1_nerve", "subtractNumber", 10), change("shared", "shared_gold", "addNumber", 3)] });
    const lines = flat(turnMechanics(story, written)?.changes);
    expect(lines).toContain("  Nerve: 40% → 30%");
    expect(lines).toContain("Dropped by the game");
    expect(lines).toContain("  a stat change on a stat the story lacks: shared/shared_gold");
  });

  it("says whether the previous choice's sacrifice was applied, and by how much", () => {
    const applied = withStats(threadBeat(1), sacrificeLast());
    const paid = turnMechanics(applied, reply({ statChanges: [change("shared", "shared_supplies", "subtractNumber", 10)] }));
    expect(flat(paid?.changes)[0]).toBe("Previous choice sacrificed: Supplies: applied, 40 → 30");
    expect(paid?.reading.levers).toEqual([expect.objectContaining({ slot: "player1", kind: "sacrifice", text: "Burn 10 Supplies to press on", status: "applied", before: 40, after: 30 })]);

    const unpaid = turnMechanics(applied, reply({ statChanges: [change("player1", "player_nerve", "addNumber", 5)] }));
    expect(flat(unpaid?.changes)[0]).toBe("Previous choice sacrificed: Supplies: not applied");
    expect(unpaid?.reading.levers[0].status).toBe("notApplied");

    const wrongWay = turnMechanics(applied, reply({ statChanges: [change("shared", "shared_supplies", "addNumber", 10)] }));
    expect(flat(wrongWay?.changes)[0]).toBe("Previous choice sacrificed: Supplies: changed the other way, 40 → 50");

    const none = turnMechanics(applied, reply({ statChanges: [change("shared", "shared_supplies", "subtractNumber", 0)] }));
    expect(flat(none?.changes)[0]).toBe("Previous choice sacrificed: Supplies: written, but nothing changed, 40 → 40");
  });

  it("reads a previous reward, a sacrificed list item and a sacrifice whose stat can't be told", () => {
    const [lever, a, b] = challengeOptions();
    const reward = withStats(threadBeat(1), { options: [a, { ...lever, resourceType: "reward", basePoints: -30, text: "Rest and regain your Nerve" }, b], choice: 1 });
    expect(flat(turnMechanics(reward, reply({ statChanges: [change("player1", "player_nerve", "addNumber", 10)] }))?.changes)[0]).toBe(
      "Previous choice gained: Nerve: applied, 40% → 50%"
    );

    const item = withStats(threadBeat(1), sacrificeLast("Trade away the Rope"));
    expect(flat(turnMechanics(item, reply({ statChanges: [change("player1", "player_kit", "removeElement", "Rope")] }))?.changes)[0]).toBe(
      "Previous choice sacrificed: Kit: applied, Rope, Lamp → Lamp"
    );

    const unnamed = withStats(threadBeat(1), sacrificeLast("Give it all up"));
    const read = turnMechanics(unnamed, reply());
    expect(flat(read?.changes)[0]).toBe("Previous choice sacrificed: no stat named in its text");
    expect(read?.reading.levers[0].status).toBe("unnamed");
  });

  it("reads a previous lever whose text names two stats on the stat it pays, so the other stat moving never hides an unpaid one", () => {
    const onlyNerve = reply({ statChanges: [change("player1", "player_nerve", "addNumber", 5)] });
    // The stat spent and the stat it helps: only the helped one changes
    const both = withStats(threadBeat(1), sacrificeLast("Burn 10 Supplies to steady your Nerve"));
    const unpaid = turnMechanics(both, onlyNerve);
    expect(flat(unpaid?.changes)[0]).toBe("Previous choice sacrificed: Supplies: not applied");
    expect(unpaid?.reading.levers[0]).toEqual(expect.objectContaining({ status: "notApplied", stat: expect.objectContaining({ id: "shared_supplies" }) }));
    expect(tallyTurns([readTurn(both, onlyNerve)]).leverStatus).toEqual({ applied: 0, notApplied: 1, otherWay: 0, noChange: 0, unnamed: 0 });
    const paid = turnMechanics(both, reply({ statChanges: [change("player1", "player_nerve", "addNumber", 5), change("shared", "shared_supplies", "subtractNumber", 10)] }));
    expect(flat(paid?.changes)[0]).toBe("Previous choice sacrificed: Supplies: applied, 40 → 30");

    // Named second and no amount: the stat that allows a sacrifice (Nerve allows only a reward)
    const byRule = withStats(threadBeat(1), sacrificeLast("Steady your Nerve by burning Supplies"));
    expect(flat(turnMechanics(byRule, onlyNerve)?.changes)[0]).toBe("Previous choice sacrificed: Supplies: not applied");

    // Both allow a sacrifice: the one named beside the amount, else the one the text names first
    const PACK = stat("player_kit", { ...KIT, name: "Pack" });
    const packs = { playerStats: [NERVE, RANK, PACK] };
    const byAmount = withStats(threadBeat(1), sacrificeLast("Mend your Pack with 10 Supplies"), packs);
    expect(flat(turnMechanics(byAmount, reply({ statChanges: [change("player1", "player_kit", "removeElement", "Rope")] }))?.changes)[0]).toBe(
      "Previous choice sacrificed: Supplies: not applied"
    );
    const byOrder = withStats(threadBeat(1), sacrificeLast("Strip your Pack bare and hand over the Supplies"), packs);
    expect(flat(turnMechanics(byOrder, reply({ statChanges: [change("shared", "shared_supplies", "subtractNumber", 10)] }))?.changes)[0]).toBe(
      "Previous choice sacrificed: Pack: not applied"
    );
  });

  it("says nothing about a previous choice that was neither", () => {
    const story = withStats(threadBeat(1));
    const read = turnMechanics(story, reply());
    expect(read?.reading.levers).toEqual([]);
    expect(flat(read?.changes)).toEqual(["No changes"]);
  });

  it("flags a stat change that doesn't fit its stat", () => {
    const story = withStats(threadBeat(1), undefined, { sharedStatValues: [{ statId: "shared_supplies", value: 3 }, { statId: "shared_order", value: 95 }] });
    const written = reply({
      statChanges: [
        change("player1", "player_rank", "setString", "Legend"),
        change("shared", "shared_order", "addNumber", 10),
        change("shared", "shared_supplies", "subtractNumber", 5),
        change("player1", "player_kit", "removeElement", "Compass"),
        change("player1", "player_kit", "addElement", "Rope"),
        change("player1", "player_nerve", "addElement", "Calm"),
      ],
    });
    const read = turnMechanics(story, written);
    const lines = flat(read?.changes);
    expect(lines).toEqual([
      "Stat changes",
      "  Rank: Novice → Legend",
      "    Doesn't fit its stat: not among its possible values: Novice, Apprentice, Master",
      "    Doesn't fit its stat: changes only after a chapter ends",
      "  Order|Chaos: 95|5 → 100|0",
      "    Doesn't fit its stat: out of range: 105, kept at 100",
      "  Supplies: 3 → -2",
      "    Doesn't fit its stat: below 0: -2",
      "  Kit: Rope, Lamp → Rope, Lamp",
      "    Doesn't fit its stat: not held: Compass",
      "  Kit: Rope, Lamp → Rope, Lamp",
      "    Doesn't fit its stat: already held: Rope",
      "  Nerve: 40% → 40%",
      "    Doesn't fit its stat: a change the game can't apply to this stat: addElement",
    ]);
    expect(read?.reading.statChanges.map((c) => c.unfit.map((u) => u.kind))).toEqual([
      ["offLadder", "onlyAfterChapter"],
      ["outOfRange"],
      ["belowZero"],
      ["notHeld"],
      ["alreadyHeld"],
      ["cantApply"],
    ]);
  });

  it("lets a stat that changes only after chapters change after one, and for the previous choice's sacrifice", () => {
    const afterChapter = withStats(laterSwitchBeat(1));
    const read = turnMechanics(afterChapter, reply({ statChanges: [change("player1", "player_rank", "setString", "Apprentice")] }, explorationOptions()));
    expect(read?.reading.statChanges[0].unfit).toEqual([]);

    const lockedLever = stat("player_rank", { ...RANK, optionsToSacrifice: "Lose a rank" });
    const sacrificed = withStats(threadBeat(1), sacrificeLast("Stake your Rank on it"), { playerStats: [NERVE, lockedLever, KIT] });
    const paid = turnMechanics(sacrificed, reply({ statChanges: [change("player1", "player_rank", "setString", "Novice")] }));
    expect(paid?.reading.statChanges[0].unfit).toEqual([]);
  });

  it("flags a number written as text on a number change", () => {
    const story = withStats(threadBeat(1));
    const read = turnMechanics(story, reply({ statChanges: [change("shared", "shared_supplies", "subtractNumber", "10")] }));
    expect(flat(read?.changes)).toContain('    Doesn\'t fit its stat: a number written as text: "10"');
  });

  it("lists milestones with their outcome, new story elements, introductions and facts", () => {
    const base = laterSwitchBeat(1);
    const outcomes = [{ id: "outcome_1", question: "Does the town survive?", possibleResolutions: { favorable: "a", mixed: "b", unfavorable: "c" }, resonance: "", intendedNumberOfMilestones: 2, milestones: [] }];
    const state = base.getState();
    const story = withStats(
      Story.create({ ...state, players: { player1: { ...state.players.player1, outcomes } }, storyElements: [{ id: "harbour", name: "Harbour", role: "the port", instructions: "", appearance: "", facts: [] }] })
    );
    const beat = beatGeneration();
    const written = beatSet(1, {
      newMilestones: [{ type: "newMilestone", outcomeGroup: "player1", outcome: "outcome_1", newMilestone: "The dam holds." }],
      player1: {
        ...beat,
        options: explorationOptions(),
        plan: {
          ...beat.plan,
          newGameElements: [{ type: "newStoryElement", element: { id: "ferry", name: "The Ferry", role: "the way out", instructions: "", appearance: "", facts: [] } }],
          newIntroductionsOfStoryElements: [{ type: "addIntroductionOfStoryElement", player: "player1", storyElementId: "ferry" }],
          establishedFacts: [
            { type: "newFact", storyElementId: "harbour", fact: "The harbour floods at spring tide." },
            { type: "newFact", storyElementId: "world", fact: "Tolls doubled this year." },
          ],
        },
      },
    });
    expect(flat(turnMechanics(story, written)?.changes)).toEqual([
      "Milestones",
      "  The dam holds.",
      "    For outcome: Does the town survive?",
      "New story elements",
      "  The Ferry: the way out",
      "Introduced",
      "  The Ferry",
      "Facts",
      "  Harbour: The harbour floods at spring tide.",
      "  World: Tolls doubled this year.",
    ]);
  });

  it("groups a group turn's changes: shared ones, then each player's, each with that player's previous choice", () => {
    const story = withStats(threadBeat(2), sacrificeLast());
    const written = beatSet(2, {
      statChanges: [change("shared", "shared_supplies", "subtractNumber", 10), change("player2", "player_nerve", "addNumber", 5)],
      player1: { ...beatGeneration(), options: challengeOptions() },
      player2: { ...beatGeneration(), options: challengeOptions() },
    });
    const read = turnMechanics(story, written);
    expect(flat(read?.changes)).toEqual([
      "Shared",
      "  Stat changes",
      "    Supplies: 40 → 30",
      "For: Test Player 1",
      "  Previous choice sacrificed: Supplies: applied, 40 → 30",
      "For: Test Player 2",
      "  Previous choice sacrificed: Supplies: applied, 40 → 30",
      "  Stat changes",
      "    Nerve: 40% → 45%",
    ]);
    expect(Object.keys(read?.choices ?? {})).toEqual(["player1", "player2"]);
  });

  it("reads a reply whose beats lack a plan, or that isn't a beat at all, without throwing", () => {
    const story = withStats(threadBeat(1));
    const bare = { player1: { title: "T", text: "You search.", options: [{ text: "Look" }], interludes: [] } };
    const read = turnMechanics(story, bare);
    expect(flat(read?.changes)).toEqual(["No changes"]);
    expect(flat(read?.choices.player1)).toEqual(["Choice 1: challenge · risk normal · base points 0"]);
    expect(flat(turnMechanics(story, { player1: "not a beat" })?.changes)).toEqual(["No changes"]);
  });

  it("reads the ending's changes, and nothing for a reply that isn't one", () => {
    const story = withStats(endingBeat(1));
    expect(turnMechanics(story, reply({}, []))?.changes).toEqual([{ label: MECHANICS_LABELS.noChanges }]);
    expect(turnMechanics(story, undefined)).toBeUndefined();
    expect(turnMechanics(story, "text")).toBeUndefined();
  });

  it("keeps every fixed string clear of the blinding words", () => {
    expect(Object.values(MECHANICS_LABELS).filter((label) => LEAK_PATTERN.test(label))).toEqual([]);
  });
});

describe("tallyTurns and turnReadingsFor: the previous levers and unfit stat changes over stored turns", () => {
  const ARM = { promptState: "round0", armKey: "gpt-6-luna@medium/prod" };

  it("counts previous levers by what the turn did, and stat changes that don't fit", () => {
    const lever = withStats(threadBeat(1), sacrificeLast());
    const readings = [
      readTurn(lever, reply({ statChanges: [change("shared", "shared_supplies", "subtractNumber", 10)] })),
      readTurn(lever, reply()),
      readTurn(withStats(threadBeat(1)), reply({ statChanges: [change("player1", "player_rank", "setString", "Legend"), change("player1", "player_nerve", "addNumber", 5)] })),
    ];
    expect(tallyTurns(readings)).toEqual({
      turns: 3,
      levers: 2,
      leverStatus: { applied: 1, notApplied: 1, otherWay: 0, noChange: 0, unnamed: 0 },
      statChanges: 3,
      unfitChanges: 1,
      unfitByKind: { offLadder: 1, onlyAfterChapter: 1 },
      turnsWithUnfit: 1,
    });
  });

  it("reads an arm's final usable single-player turns, a chain's turn on its own plan included", () => {
    const state = withStats(threadBeat(1), sacrificeLast()).getState();
    const cases = [evalCase("step", "beat", { state }), evalCase("open", "thread", { state: withStats(threadAnalysisAfterSwitch(1)).getState() })];
    const outputs = new Map<string, unknown>([
      ["paid", reply({ statChanges: [change("shared", "shared_supplies", "subtractNumber", 10)] })],
      ["unpaid", reply()],
      ["plan", threadAnalysis("challenge", 2, 4)],
      ["opening", reply({}, explorationOptions())],
    ]);
    const CHAIN = { promptState: "round0", armKey: "pipeline:gpt-6-luna@low/prod>gpt-6-luna@medium/prod" };
    const records: CallRecord[] = [
      record({ caseId: "step", promptState: "round0", armKey: ARM.armKey, callArmKey: ARM.armKey, baseline: false, sample: 1, outputFile: "paid" }),
      record({ caseId: "step", promptState: "round0", armKey: ARM.armKey, callArmKey: ARM.armKey, baseline: false, sample: 2, outputFile: "unpaid" }),
      // Not final, another arm, another state, a group turn: left out
      record({ caseId: "step", promptState: "round0", armKey: ARM.armKey, callArmKey: ARM.armKey, baseline: false, sample: 3, jobFinal: false, outputFile: "unpaid" }),
      record({ caseId: "step", promptState: "round0", armKey: "gpt-6-luna@medium/turnR2b", baseline: false, outputFile: "unpaid" }),
      record({ caseId: "step", promptState: "adopted1", armKey: ARM.armKey, baseline: false, outputFile: "unpaid" }),
      record({ caseId: "step", promptState: "round0", armKey: ARM.armKey, baseline: false, sample: 4, players: 2, outputFile: "unpaid" }),
      record({ jobKey: "open|chain", caseId: "open", group: "pipeline", role: "thread", promptState: "round0", armKey: CHAIN.armKey, baseline: false, step: 1, jobFinal: false, outputFile: "plan" }),
      record({ jobKey: "open|chain", caseId: "open", group: "pipeline", role: "beat", promptState: "round0", armKey: CHAIN.armKey, baseline: false, step: 2, outputFile: "opening" }),
    ];
    const load = (r: CallRecord) => outputs.get(r.outputFile ?? "");
    const readings = turnReadingsFor(records, cases, load, ARM);
    expect(readings).toHaveLength(2);
    expect(tallyTurns(readings).leverStatus).toEqual({ applied: 1, notApplied: 1, otherWay: 0, noChange: 0, unnamed: 0 });
    const chain = turnReadingsFor(records, cases, load, CHAIN);
    expect(chain).toHaveLength(1);
    // The chain's turn is read on its own plan: a challenge chapter, so its exploration options play as challenges
    expect(chain[0].reply.player1.options.map((o) => o.optionType)).toEqual(["challenge", "challenge", "challenge"]);
  });
});
