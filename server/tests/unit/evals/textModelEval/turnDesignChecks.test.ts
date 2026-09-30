import { jest } from "@jest/globals";
import { Story } from "core/models/Story.js";
import { GameModes, type Beat, type SetOfBeatGenerationSchema, type StoryState, type SwitchAnalysis, type ThreadAnalysis } from "core/types/index.js";
import {
  allowedLengths,
  checkBeatDesign,
  checkSwitchDesign,
  checkThreadDesign,
  genericMilestoneKind,
  nearDuplicateOfOutcome,
  reusedFromPrevious,
  statReadouts,
} from "../../../../src/evals/textModelEval/turnDesignChecks.js";
import {
  endingBeat,
  firstSwitchBeat,
  firstThreadAnalysis,
  laterSwitchBeat,
  switchAnalysisAfterThread,
  threadAnalysisAfterSwitch,
  threadBeat,
} from "../../../helpers/promptStories.js";
import { beatGeneration, beatSet, challengeOptions, outcome, stat, switchAnalysis, threadAnalysis } from "../../../helpers/textFixtures.js";
import { endedChapter as roundEndedChapter, roundStory, topicSwitch as roundTopicSwitch } from "../../../helpers/roundStories.js";

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** A story with its state edited. */
function edited(story: Story, edit: (state: StoryState) => void): Story {
  const state = structuredClone(story.getState());
  edit(state);
  return Story.create(state);
}

function topicSwitch(directions: string[], slot = "player1"): SwitchAnalysis {
  const plan = switchAnalysis([slot]);
  plan.switches[0].topicChoices = directions;
  return plan;
}

function flavorSwitch(outcomeId: string): SwitchAnalysis {
  const plan = switchAnalysis(["player1"]);
  plan.switches[0] = { ...plan.switches[0], type: "flavor", outcomeId, question: "What now?", topicChoices: [] };
  return plan;
}

describe("allowedLengths: the chapter lengths that let a story end on its turn count (turn doc A4)", () => {
  it("allows exactly the turns left from 2 to 4, 2 at 5, 2 or 3 at 6, and 2 to 4 from 7", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 12].map(allowedLengths)).toEqual([[], [2], [3], [4], [2], [2, 3], [2, 3, 4], [2, 3, 4]]);
  });
});

describe("checkSwitchDesign", () => {
  // Turn 3 of 10: the thread that just ended pushed outcome_1 (one milestone pending)
  const outcomes = {
    sharedOutcomes: [outcome("outcome_1", { intendedNumberOfMilestones: 1 })],
  };
  const withOwn = (story: Story) =>
    edited(story, (state) => {
      state.players.player1.outcomes = [outcome("player1_trust", { intendedNumberOfMilestones: 2 }), outcome("player1_home", { intendedNumberOfMilestones: 2 })];
    });
  const story = withOwn(switchAnalysisAfterThread(1, { ...outcomes, maxTurns: 40 }));

  it("wants each direction to name one known outcome, a different one each", () => {
    const good = checkSwitchDesign(story, topicSwitch(["Win Mira's trust at the docks (player1_trust)", "Find a room above the bakery (player1_home)"]));
    expect(good.checks).toMatchObject({ directionsOneOutcome: true, directionsDistinctOutcomes: true });
    const two = checkSwitchDesign(story, topicSwitch(["Win Mira's trust and a room (player1_trust, player1_home)", "Find a room above the bakery (player1_home)"]));
    expect(two.checks).toMatchObject({ directionsOneOutcome: false, directionsDistinctOutcomes: false });
  });

  it("finds a complete outcome offered while others still need milestones", () => {
    // outcome_1 needs one milestone, and the chapter that just ended adds it
    const offered = checkSwitchDesign(story, topicSwitch(["Return to the storm wall (outcome_1)", "Find a room above the bakery (player1_home)"]));
    expect(offered.checks.noCompleteOutcomeOffered).toBe(false);
    expect(checkSwitchDesign(story, flavorSwitch("outcome_1")).checks.noCompleteOutcomeOffered).toBe(false);
    expect(checkSwitchDesign(story, flavorSwitch("player1_trust")).checks.noCompleteOutcomeOffered).toBe(true);
  });

  it("binds late in the story: every direction on an outcome that still needs milestones", () => {
    // Turn 3 of 10: 7 turns left fit one chapter, and 1 + 2 + 2 milestones are still needed
    const late = withOwn(switchAnalysisAfterThread(1, outcomes));
    expect(checkSwitchDesign(late, topicSwitch(["Win Mira's trust (player1_trust)", "Find a room (player1_home)"])).checks.lateDirectionsOnNeeded).toBe(true);
    expect(checkSwitchDesign(late, topicSwitch(["Win Mira's trust (player1_trust)", "Guard the wall (outcome_1)"])).checks.lateDirectionsOnNeeded).toBe(false);
    expect(checkSwitchDesign(story, topicSwitch(["Win Mira's trust (player1_trust)"])).checks).not.toHaveProperty("lateDirectionsOnNeeded");
  });

  it("reports no outcome check on a story without outcomes", () => {
    const { checks } = checkSwitchDesign(switchAnalysisAfterThread(1), topicSwitch(["Anything at all will do"]));
    expect(checks).toEqual({});
  });
});

describe("checkThreadDesign", () => {
  const known = { sharedOutcomes: [outcome("outcome_1"), outcome("outcome_2")] };
  /** The thread analysis after a switch whose directions name outcomes; the player picked direction `choice` */
  function afterSwitch(plan: SwitchAnalysis, choice = 0, overrides: Partial<StoryState> = {}): Story {
    return edited(threadAnalysisAfterSwitch(1, { ...known, ...overrides }), (state) => {
      state.storyPhases[state.storyPhases.length - 1] = { ...plan, firstBeatIndex: 3 };
      const history = state.players.player1.beatHistory;
      history[history.length - 1] = { ...history[history.length - 1], choice };
    });
  }
  const directions = topicSwitch(["Guard the storm wall tonight (outcome_1)", "Search the old archive (outcome_2)"]);

  it("wants the chapter's outcome to be the picked direction's, or the flavor switch's", () => {
    expect(checkThreadDesign(afterSwitch(directions, 0), threadAnalysis("challenge", 2, 4)).checks.chapterFollowsPick).toBe(true);
    expect(checkThreadDesign(afterSwitch(directions, 1), threadAnalysis("challenge", 2, 4)).checks.chapterFollowsPick).toBe(false);
    expect(checkThreadDesign(afterSwitch(flavorSwitch("outcome_2")), threadAnalysis("challenge", 2, 4)).checks.chapterFollowsPick).toBe(false);
  });

  it("wants a known outcome and one kind per chapter", () => {
    const story = afterSwitch(directions);
    expect(checkThreadDesign(story, threadAnalysis("challenge", 2, 4)).checks).toMatchObject({ threadOutcomeKnown: true, oneKindPerChapter: true });
    const mixed = threadAnalysis("challenge", 2, 4);
    mixed.threads[0].possibleMilestones = { resolution1: "a", resolution2: "b", resolution3: "c" };
    mixed.threads[0].outcomeId = "outcome_9";
    expect(checkThreadDesign(story, mixed).checks).toMatchObject({ threadOutcomeKnown: false, oneKindPerChapter: false });
  });

  it("wants a length that lets the story end on its turn count", () => {
    // Turn 4: at 10 turns 6 are left (2 or 3 allowed); at 8, 4 (only 4); at 5, one (none allowed, so any passes)
    const at = (maxTurns: number, duration: number) =>
      checkThreadDesign(afterSwitch(directions, 0, { maxTurns }), threadAnalysis("challenge", duration, 4)).checks.lengthAllowed;
    expect([at(10, 3), at(10, 4), at(8, 4), at(8, 3), at(5, 4)]).toEqual([true, false, true, false, true]);
    expect(checkThreadDesign(afterSwitch(directions), threadAnalysis("challenge", 3, 4)).counts.chapterLength).toBe(3);
  });

  it("finds 'the group' in a single-player chapter's milestones", () => {
    const plan = threadAnalysis("challenge", 2, 4);
    plan.threads[0].possibleMilestones = { favorable: "The group finds the key.", mixed: "A key.", unfavorable: "No key." };
    expect(checkThreadDesign(afterSwitch(directions), plan).checks.noGroupInSinglePlayer).toBe(false);
    expect(checkThreadDesign(afterSwitch(directions), threadAnalysis("challenge", 2, 4)).checks.noGroupInSinglePlayer).toBe(true);
  });

  it("wants the first multiplayer chapter to group everyone on a shared outcome", () => {
    const story = firstThreadAnalysis(2, { sharedOutcomes: [outcome("outcome_1")] });
    expect(checkThreadDesign(story, threadAnalysis("challenge", 2, 1, ["player1", "player2"])).checks.firstChapterGroupsAll).toBe(true);
    const split = threadAnalysis("challenge", 2, 1, ["player1"]);
    split.threads.push({ ...split.threads[0], id: "other", playersSideA: ["player2"] });
    expect(checkThreadDesign(story, split).checks.firstChapterGroupsAll).toBe(false);
    expect(checkThreadDesign(afterSwitch(directions), threadAnalysis("challenge", 2, 4)).checks).not.toHaveProperty("firstChapterGroupsAll");
  });

  it("wants every contest step to name both sides", () => {
    const story = edited(threadAnalysisAfterSwitch(2, { sharedOutcomes: [outcome("outcome_1")], gameMode: GameModes.Competitive }), (state) => {
      state.players.player1.name = "Ada Quill";
      state.players.player2.name = "Bram Tover";
    });
    const plan = threadAnalysis("contest", 2, 4, ["player1"], ["player2"]);
    plan.threads[0].progression.forEach((step) => (step.question = "Race: How do Ada and Bram cross the bay first?"));
    expect(checkThreadDesign(story, plan).checks.contestStepsNameBothSides).toBe(true);
    plan.threads[0].progression[1].question = "Race: How does Ada cross the bay first?";
    expect(checkThreadDesign(story, plan).checks.contestStepsNameBothSides).toBe(false);
    expect(checkThreadDesign(story, threadAnalysis("challenge", 2, 4, ["player1", "player2"])).checks).not.toHaveProperty("contestStepsNameBothSides");
  });
});

describe("turn round 1's plan checks (planner v2's fields, the kind rule, binding late, triggers)", () => {
  const TRUST = "player1_trust";
  const HOME = "player1_home";
  const story = roundStory({
    turns: 5,
    maxTurns: 20,
    playerOutcomes: { player1: [outcome(TRUST), outcome(HOME, { possibleResolutions: { resolution1: "stay", resolution2: "leave", resolution3: "build" } })] },
    phases: [roundTopicSwitch([["Win Mira's trust", TRUST], ["Find a home", HOME]], 4)],
  });
  const withElement = edited(story, (state) => {
    state.storyElements = [{ id: "mira", name: "Mira Vell", role: "a smuggler", instructions: "", appearance: "", facts: [] }];
  });
  const framed = (
    fields: Record<string, unknown>,
    milestones: ThreadAnalysis["threads"][number]["possibleMilestones"] = { favorable: "a", mixed: "b", unfavorable: "c" }
  ): ThreadAnalysis => {
    const plan = threadAnalysis("challenge", 2, 5);
    const [thread] = plan.threads;
    return { ...plan, threads: [{ ...thread, outcomeId: TRUST, possibleMilestones: milestones, progression: thread.progression.map((s) => ({ ...s, possibleResolutions: milestones })), ...fields }] };
  };

  it("wants the chapter's question to name something from the story, and its plan to carry no ids", () => {
    expect(checkThreadDesign(withElement, framed({ question: "Will Mira vouch for Rikkit?", plan: "Rikkit waits for Mira at the docks." })).checks).toMatchObject({
      questionPresent: true,
      planWithoutIds: true,
    });
    expect(checkThreadDesign(withElement, framed({ question: "Will it work?", plan: `Push ${TRUST} forward.` })).checks).toMatchObject({ questionPresent: false, planWithoutIds: false });
    expect(checkThreadDesign(withElement, framed({})).checks).not.toHaveProperty("questionPresent");
  });

  it("wants the chapter's kind to follow its outcome's, and the written kind to match its results", () => {
    expect(checkThreadDesign(story, framed({ kind: "challenge" })).checks).toMatchObject({ kindFollowsOutcome: true, kindFieldMatches: true });
    const explored = framed({ kind: "challenge" }, { resolution1: "a", resolution2: "b", resolution3: "c" });
    expect(checkThreadDesign(story, explored).checks).toMatchObject({ kindFollowsOutcome: false, kindFieldMatches: false });
    expect(checkThreadDesign(story, framed({})).checks).not.toHaveProperty("kindFieldMatches");
  });

  it("wants a round direction's text free of ids", () => {
    const plan = roundTopicSwitch([["Win Mira's trust", TRUST]], 5);
    const withDirections = (text: string) => ({ ...plan, switches: plan.switches.map((sw) => ({ ...sw, topicDirections: [{ direction: text, outcomeId: TRUST }] })) });
    expect(checkSwitchDesign(story, withDirections("Win Mira's trust at the docks")).checks.directionsNoIds).toBe(true);
    expect(checkSwitchDesign(story, withDirections(`Win Mira's trust (${TRUST})`)).checks.directionsNoIds).toBe(false);
    expect(checkSwitchDesign(story, plan).checks).not.toHaveProperty("directionsNoIds");
  });

  it("wants a binding switch to offer an outcome no chapter has pushed yet, when one needs milestones", () => {
    // Turn 17 of 20: 4 turns left fit one chapter; the trust outcome had a chapter, the home outcome none
    const late = roundStory({
      turns: 16,
      maxTurns: 20,
      playerOutcomes: { player1: [outcome(TRUST), outcome(HOME)] },
      phases: [roundTopicSwitch([["Trust", TRUST]], 12), roundEndedChapter(TRUST, 3, 13, "m")],
    });
    expect(checkSwitchDesign(late, topicSwitch([`Find a home (${HOME})`, `Trust (${TRUST})`])).checks.lateOffersUntouched).toBe(true);
    expect(checkSwitchDesign(late, topicSwitch([`Trust again (${TRUST})`])).checks.lateOffersUntouched).toBe(false);
    // Turn 6 of 40: 35 turns left fit 8 chapters for the 4 milestones still needed, so pacing does not bind
    const early = roundStory({ turns: 5, maxTurns: 40, playerOutcomes: { player1: [outcome(TRUST), outcome(HOME)] } });
    expect(checkSwitchDesign(early, topicSwitch([`Trust again (${TRUST})`])).checks).not.toHaveProperty("lateOffersUntouched");
  });

  it("reads a built trigger case's rule: a flavor switch on the outcome it bears on, or the recipe's length", () => {
    const expectation = { caseId: "c", kind: "flavor" as const, outcomeId: TRUST, rule: "r" };
    expect(checkSwitchDesign(story, flavorSwitch(TRUST), expectation).checks.triggerFollowed).toBe(true);
    expect(checkSwitchDesign(story, flavorSwitch(HOME), expectation).checks.triggerFollowed).toBe(false);
    expect(checkSwitchDesign(story, topicSwitch([`Trust (${TRUST})`]), expectation).checks.triggerFollowed).toBe(false);
    expect(checkSwitchDesign(story, flavorSwitch(TRUST)).checks).not.toHaveProperty("triggerFollowed");
    const recipe = { caseId: "c", kind: "length" as const, length: 2, rule: "r" };
    expect(checkThreadDesign(story, framed({}), recipe).checks.triggerFollowed).toBe(true);
    expect(checkThreadDesign(story, threadAnalysis("challenge", 3, 5), recipe).checks.triggerFollowed).toBe(false);
  });
});

describe("the nearer chapter question and the concrete kind of milestone (owner, 2026-09-28)", () => {
  const RING = "Does the player successfully expose and dismantle the Clandestine Waste Ring?";
  const NAMES = ["Arielle", "Clandestine Waste Ring"];

  it("finds a chapter question that asks its outcome's question again", () => {
    // The owner's example: the chapter question restates the outcome's goal
    expect(nearDuplicateOfOutcome("Will Arielle uncover enough concrete evidence to expose and dismantle the Clandestine Waste Ring?", RING, NAMES)).toBe(true);
    expect(nearDuplicateOfOutcome("Will Arielle uncover enough concrete evidence to expose and dismantle the Clandestine Waste Ring?", RING, [])).toBe(true);
    expect(nearDuplicateOfOutcome(RING, RING, NAMES)).toBe(true);
    // Inflected forms count as the same word
    expect(nearDuplicateOfOutcome("Will Arielle succeed in exposing and dismantling the ring?", RING, NAMES)).toBe(true);
  });

  it("passes a nearer question about this chapter's own situation, even one that names the outcome's people and things", () => {
    expect(nearDuplicateOfOutcome("Will Arielle get the shipping manifests out of the depot before the night shift?", RING, NAMES)).toBe(false);
    expect(nearDuplicateOfOutcome("Will Arielle find proof that ties the Clandestine Waste Ring to the depot?", RING, NAMES)).toBe(false);
    // One shared everyday verb is not a restatement
    expect(nearDuplicateOfOutcome("Will Ada find the lighthouse key before the tide?", "Will Ada find a home?", ["Ada"])).toBe(false);
  });

  it("finds a kind of milestone that names progress instead of a concrete thing", () => {
    for (const generic of [
      "Milestone marking progress in exposing the Waste Ring",
      "Progress in the race to claim the treasure",
      "Advancing influence over the culinary timeline",
      "Friendship development milestone",
      "Meaningful progress toward training for the Paris Marathon",
      "A Council-backed inquiry that advances the dismantling of the Clandestine Waste Ring",
      "A step toward the reforms",
      "",
      "  ",
    ]) {
      expect([generic, genericMilestoneKind(generic)]).toEqual([generic, true]);
    }
    for (const concrete of ["whether the letters prove the noble's hand in the conspiracy", "Finding a historical clue about the runes", "Which explorer gains the stronger lead toward the treasure"]) {
      expect([concrete, genericMilestoneKind(concrete)]).toEqual([concrete, false]);
    }
  });

  describe("on a chapter plan", () => {
    const EXPOSE = "player1_expose_waste_ring";
    const story = edited(
      roundStory({
        turns: 5,
        maxTurns: 20,
        playerOutcomes: { player1: [outcome(EXPOSE, { question: RING })] },
        phases: [roundTopicSwitch([["Expose the ring", EXPOSE]], 4)],
      }),
      (state) => {
        state.players.player1.name = "Arielle";
        state.storyElements = [{ id: "ring", name: "Clandestine Waste Ring", role: "the villains", instructions: "", appearance: "", facts: [] }];
      }
    );
    const plan = (fields: Record<string, unknown>): ThreadAnalysis => {
      const base = threadAnalysis("challenge", 3, 5);
      return { ...base, threads: [{ ...base.threads[0], outcomeId: EXPOSE, ...fields }] };
    };

    it("reads the chapter's own question against its outcome's, and its kind of milestone", () => {
      const near = checkThreadDesign(story, plan({ question: "Will Arielle get the manifests out of the depot before the night shift?", typeOfMilestone: "whether the manifests tie the ring to the depot" }));
      expect(near.checks).toMatchObject({ questionNearerThanOutcome: true, milestoneKindConcrete: true });
      const same = checkThreadDesign(story, plan({ question: "Will Arielle uncover enough evidence to expose and dismantle the ring?", typeOfMilestone: "Milestone marking progress in exposing the Waste Ring" }));
      expect(same.checks).toMatchObject({ questionNearerThanOutcome: false, milestoneKindConcrete: false });
    });

    it("reads today's plans, which write no question, on their kind of milestone only", () => {
      const today = checkThreadDesign(story, plan({ typeOfMilestone: "Finding the depot's manifests" }));
      expect(today.checks.milestoneKindConcrete).toBe(true);
      expect(today.checks).not.toHaveProperty("questionNearerThanOutcome");
    });

    it("leaves the question check out where the chapter's outcome is not the story's", () => {
      expect(checkThreadDesign(story, plan({ outcomeId: "player1_gone", question: RING })).checks).not.toHaveProperty("questionNearerThanOutcome");
    });

    // Planner v2 and v2b write no kind of milestone: their stored kind is the question, which is no kind to read
    const QUESTION = "Will Arielle make progress with the depot's night shift?";

    it("leaves the kind check out where the stored kind of milestone is the chapter's own question", () => {
      const copied = checkThreadDesign(story, plan({ question: QUESTION, typeOfMilestone: QUESTION }));
      expect(copied.checks).not.toHaveProperty("milestoneKindConcrete");
      expect(copied.checks).toHaveProperty("questionNearerThanOutcome");
      expect(checkThreadDesign(story, plan({ question: QUESTION, typeOfMilestone: ` ${QUESTION} ` })).checks).not.toHaveProperty("milestoneKindConcrete");
    });

    it("reads the kind of milestone as the reply wrote it, before the stored plan's fallback to the question", () => {
      const stored = plan({ question: QUESTION, typeOfMilestone: QUESTION });
      const one = (typeOfMilestone: string) => checkThreadDesign(story, stored, undefined, { thread: { question: QUESTION, typeOfMilestone } }).checks.milestoneKindConcrete;
      // planner v2c left it blank: the plan stores the question, the check fails the blank
      expect([one(""), one("  ")]).toEqual([false, false]);
      expect(one("whether the manifests tie the ring to the depot")).toBe(true);
      expect(one("progress in exposing the Waste Ring")).toBe(false);
      // A group's threads, and today's form (its reply is the stored shape): every written kind counts
      const group = (kinds: string[]) => checkThreadDesign(story, stored, undefined, { threads: kinds.map((typeOfMilestone) => ({ typeOfMilestone })) }).checks.milestoneKindConcrete;
      expect(group(["whether the manifests tie the ring to the depot", "whether the foreman talks"])).toBe(true);
      expect(group(["whether the manifests tie the ring to the depot", "a milestone for the ring"])).toBe(false);
    });

    it("leaves the kind check out where the reply wrote no kind of milestone (planner v2 and v2b)", () => {
      const written = { thread: { question: QUESTION } };
      expect(checkThreadDesign(story, plan({ question: QUESTION, typeOfMilestone: QUESTION }), undefined, written).checks).not.toHaveProperty("milestoneKindConcrete");
      expect(checkThreadDesign(story, plan({ question: QUESTION, typeOfMilestone: "Finding the manifests" }), undefined, written).checks).not.toHaveProperty("milestoneKindConcrete");
    });
  });

  describe("planner v2d's own stages (the owner's feedback of 2026-09-29)", () => {
    const EXPOSE = "player1_expose_waste_ring";
    const onStage = (recorded: number) =>
      edited(
        roundStory({
          turns: 5,
          maxTurns: 20,
          playerOutcomes: { player1: [outcome(EXPOSE, { question: RING, intendedNumberOfMilestones: 3, milestones: ["The ring's ledger is found", "m2"].slice(0, recorded) })] },
          phases: [roundTopicSwitch([["Expose the ring", EXPOSE]], 4)],
        }),
        (state) => {
          state.players.player1.name = "Arielle";
          state.storyElements = [{ id: "ring", name: "Clandestine Waste Ring", role: "the villains", instructions: "", appearance: "", facts: [] }];
        }
      );
    const STAGES = ["gather the evidence on the Waste Ring", "expose the ring's backers in public", "dismantle the ring's network"];
    const steps = (questions: string[]) => questions.map((question) => ({ title: "Step", question, possibleResolutions: { favorable: "a", mixed: "b", unfavorable: "c" } }));
    const plan = (fields: Record<string, unknown>): ThreadAnalysis => {
      const base = threadAnalysis("challenge", 3, 5);
      return { ...base, threads: [{ ...base.threads[0], outcomeId: EXPOSE, ...fields }] };
    };

    it("counts one stage per intended milestone", () => {
      expect(checkThreadDesign(onStage(0), plan({ outcomeStages: STAGES })).checks.stagesNamed).toBe(true);
      expect(checkThreadDesign(onStage(0), plan({ outcomeStages: STAGES.slice(0, 2) })).checks.stagesNamed).toBe(false);
      expect(checkThreadDesign(onStage(0), plan({ outcomeStages: [...STAGES, " "] })).checks.stagesNamed).toBe(false);
    });

    it("fails a step that names a later stage's own words, the words of its own and earlier stages allowed", () => {
      const within = plan({ outcomeStages: STAGES, progression: steps(["How does Arielle get into the depot?", "How does Arielle copy the evidence?", "How does Arielle get out before the shift?"]) });
      expect(checkThreadDesign(onStage(0), within).checks.stepsWithinNamedStage).toBe(true);
      // The owner's chapter: the last step turns to exposing
      const reaching = plan({ outcomeStages: STAGES, progression: steps(["How does Arielle gather intel?", "How does Arielle infiltrate the ring's channels?", "How does Arielle plan to expose the ring based on the evidence?"]) });
      expect(checkThreadDesign(onStage(0), reaching).checks.stepsWithinNamedStage).toBe(false);
      // At stage 2 exposing is the thread's own stage; only dismantling is later
      expect(checkThreadDesign(onStage(1), reaching).checks.stepsWithinNamedStage).toBe(true);
      const dismantling = plan({ outcomeStages: STAGES, progression: steps(["How does Arielle rally the leaders?", "How does Arielle dismantle the network?"]) });
      expect(checkThreadDesign(onStage(1), dismantling).checks.stepsWithinNamedStage).toBe(false);
    });

    it("reads only planner v2d's plans, and none at the outcome's last stage", () => {
      expect(checkThreadDesign(onStage(0), plan({})).checks).not.toHaveProperty("stepsWithinNamedStage");
      expect(checkThreadDesign(onStage(0), plan({})).checks).not.toHaveProperty("stagesNamed");
      expect(checkThreadDesign(onStage(2), plan({ outcomeStages: STAGES })).checks).not.toHaveProperty("stepsWithinNamedStage");
      expect(checkThreadDesign(onStage(2), plan({ outcomeStages: STAGES })).checks.stagesNamed).toBe(true);
    });
  });
});

describe("checkBeatDesign", () => {
  const ENERGY = stat("player_energy", { name: "Energy", optionsToSacrifice: "Spend 10% Energy" });

  /** A thread beat whose previous choice was a sacrifice naming Energy */
  function afterSacrifice(): Story {
    return edited(threadBeat(1, { playerStats: [ENERGY, stat("player_luck", { name: "Luck" })] }), (state) => {
      const history = state.players.player1.beatHistory;
      const options = challengeOptions();
      options[0] = { ...options[0], resourceType: "sacrifice", basePoints: 30, text: "Spend 10% Energy to force the door" };
      history[history.length - 1] = { ...history[history.length - 1], options, choice: 0 } as Beat;
    });
  }
  const change = (stat: string) => ({ type: "statChange" as const, group: "player1", stat, change: "subtractNumber" as const, value: 10 });

  it("wants a chosen sacrifice or reward applied to the stat it names", () => {
    const story = afterSacrifice();
    const applied = beatSet(1, { statChanges: [change("player_energy")] });
    expect(checkBeatDesign(story, applied, applied).checks.sacrificeApplied).toBe(true);
    const none = beatSet(1);
    expect(checkBeatDesign(story, none, none).checks.sacrificeApplied).toBe(false);
    const other = beatSet(1, { statChanges: [change("player_luck")] });
    expect(checkBeatDesign(story, other, other).checks.sacrificeApplied).toBe(false);
    expect(checkBeatDesign(threadBeat(1), none, none).checks).not.toHaveProperty("sacrificeApplied");
  });

  describe("milestones after a chapter", () => {
    const story = laterSwitchBeat(1, { sharedOutcomes: [outcome("outcome_1"), outcome("outcome_2")] });
    const milestone = (outcomeId: string, text: string) => ({ type: "newMilestone" as const, outcomeGroup: "shared", outcome: outcomeId, newMilestone: text });

    it("wants one milestone per ended chapter, none unearned and none copied from the plan", () => {
      const written = beatSet(1, { newMilestones: [milestone("outcome_1", "Threatened by the strike, the council approves the railroad.")] });
      expect(checkBeatDesign(story, written, written).checks).toMatchObject({ oneMilestonePerEndedChapter: true, noUnearnedMilestones: true, milestoneNotCopied: true });
      const doubled = beatSet(1, { newMilestones: [milestone("outcome_1", "One."), milestone("outcome_1", "Two.")] });
      expect(checkBeatDesign(story, doubled, doubled).checks.oneMilestonePerEndedChapter).toBe(false);
      const unearned = beatSet(1, { newMilestones: [milestone("outcome_1", "One."), milestone("outcome_2", "Out of nowhere.")] });
      expect(checkBeatDesign(story, unearned, unearned).checks.noUnearnedMilestones).toBe(false);
      // The fixture's thread planned "A Thread milestone"
      const copied = beatSet(1, { newMilestones: [milestone("outcome_1", "A thread milestone!")] });
      expect(checkBeatDesign(story, copied, copied).checks.milestoneNotCopied).toBe(false);
    });

    it("reads copies on the reply as written: a milestone the game adds from the plan is not the model's copy", () => {
      const raw = beatSet(1, { newMilestones: [] });
      const repaired = beatSet(1, { newMilestones: [milestone("outcome_1", "A Thread milestone")] });
      expect(checkBeatDesign(story, repaired, raw).checks).not.toHaveProperty("milestoneNotCopied");
    });
  });

  it("wants no sacrifice or reward in a switch turn, and no options at an ending", () => {
    const sacrifice = beatSet(1);
    sacrifice.player1 = beatGeneration({ options: [{ optionType: "exploration", resourceType: "sacrifice", text: "Give up the map" }, ...challengeOptions().slice(1)] });
    expect(checkBeatDesign(firstSwitchBeat(1), sacrifice, sacrifice).checks.noSacrificeInSwitch).toBe(false);
    expect(checkBeatDesign(firstSwitchBeat(1), beatSet(1), beatSet(1)).checks.noSacrificeInSwitch).toBe(true);
    const ending = endingBeat(1);
    expect(checkBeatDesign(ending, beatSet(1), beatSet(1)).checks.noOptionsOnEnding).toBe(false);
    const closed = beatSet(1);
    closed.player1 = beatGeneration({ options: [], text: "By spring the new code is nailed to every door." });
    expect(checkBeatDesign(ending, closed, closed).checks).toMatchObject({ noOptionsOnEnding: true, noSequelHook: true });
    closed.player1 = beatGeneration({ options: [], text: "You look at the long road ahead. This is only the beginning." });
    expect(checkBeatDesign(ending, closed, closed).checks.noSequelHook).toBe(false);
  });

  it("finds a stat's name beside a number, outside sacrifice and reward options", () => {
    const story = threadBeat(1, { playerStats: [ENERGY], sharedStats: [stat("shared_order", { name: "Order|Chaos", type: "opposites" })] });
    const readout = beatSet(1);
    readout.player1 = beatGeneration({ text: "Your Energy drops to 40% as you climb. The crowd turns to Chaos, 60 to 40." });
    expect(statReadouts(story, readout)).toEqual(["Energy drops to 40%", "Chaos, 60"]);
    expect(checkBeatDesign(story, readout, readout).checks.noStatReadouts).toBe(false);
    const priced = beatSet(1);
    priced.player1 = beatGeneration({ options: [{ ...challengeOptions()[0], resourceType: "sacrifice", text: "Burn 10% Energy to sprint" }, ...challengeOptions().slice(1)] });
    expect(checkBeatDesign(story, priced, priced).checks.noStatReadouts).toBe(true);
  });

  it("counts prose habits: paragraphs opening with You, a waiting close, pointing at the choice, stock phrases", () => {
    const beats = beatSet(1);
    beats.player1 = beatGeneration({
      text: "You step in. The air is thick with smoke.\n\nThe clerk looks up. A sense of dread follows.\n\nThe path ahead is uncertain, and the harbour waits for your choice.",
    });
    expect(checkBeatDesign(threadBeat(1), beats, beats).counts).toMatchObject({
      proseParagraphs: 3,
      youParagraphs: 1,
      waitingClose: 1,
      pointingAtChoice: 1,
      stockPhrases: 2,
      pathAhead: 1,
    });
  });

  it("reads pointing at the choice only where options follow the text, not at an ending (turn round 2)", () => {
    const beats = beatSet(1);
    beats.player1 = beatGeneration({ options: [], text: "The war is over.\n\nA year later you choose your own work, by choice and without permission." });
    const ending = checkBeatDesign(endingBeat(1), beats, beats).counts;
    expect(ending).toMatchObject({ pointingAtChoice: 0, choiceTexts: 0, beatTexts: 1 });
    const step = checkBeatDesign(threadBeat(1), beats, beats).counts;
    expect(step).toMatchObject({ pointingAtChoice: 1, choiceTexts: 1 });
  });

  it("counts option sets: the same odds, a lever, a reward, a shared first word, a negative base on a bonus option", () => {
    const options = challengeOptions().map((o, i) => ({ ...o, text: i < 2 ? `Climb ${i}` : "Wait here" }));
    options[1] = { ...options[1], basePoints: -10, modifiersToSuccessRate: [{ statId: "player1_energy", reason: "fit", effect: 10 }] };
    options[2] = { ...options[2], resourceType: "reward", basePoints: -30, modifiersToSuccessRate: [{ statId: "player1_energy", reason: "fit", effect: 30 }] };
    const beats = beatSet(1);
    beats.player1 = beatGeneration({ options });
    expect(checkBeatDesign(threadBeat(1), beats, beats).counts).toMatchObject({
      optionSets: 1,
      sameFirstWordSets: 1,
      challengeSets: 1,
      sameOddsSets: 1,
      oddsWithin5Sets: 1,
      leverSets: 1,
      rewardSets: 1,
      bonusOptions: 1,
      bonusOptionsNegativeBase: 1,
    });
  });

  describe("turn round 2's beat checks (B6, B7, B8)", () => {
    const GUILD = "player1_guild_reform";
    const ENCLAVE = "player1_enclave_trust";
    const PAMPHLET = "player1_pamphlet";
    const outcomes = { player1: [outcome(GUILD, { milestones: ["m"] }), outcome(ENCLAVE), outcome(PAMPHLET)] };
    const switchStory = roundStory({
      turns: 5,
      maxTurns: 20,
      playerOutcomes: outcomes,
      phases: [
        roundTopicSwitch([["Petition the Guild hall", GUILD]], 0),
        roundEndedChapter(GUILD, 4, 1, "The Guild hears the petition"),
        roundTopicSwitch([["Petition the Guild hall", GUILD], ["Win over the goblin enclave", ENCLAVE], ["Print the secret pamphlet", PAMPHLET]], 5),
      ],
    });
    const withOptions = (texts: string[]) => {
      const beats = beatSet(1);
      beats.player1 = beatGeneration({ options: texts.map((text) => ({ optionType: "exploration" as const, resourceType: "normal" as const, text })) });
      return beats;
    };

    it("wants a topic switch's options in the directions' order, and free of ids", () => {
      const inOrder = withOptions(["Carry the petition to the Guild hall", "Visit the goblin enclave's elders", "Set the secret pamphlet in type"]);
      expect(checkBeatDesign(switchStory, inOrder, inOrder).checks).toMatchObject({ switchOptionsFollowDirections: true, switchOptionsNoIds: true });
      const swapped = withOptions(["Visit the goblin enclave's elders", "Carry the petition to the Guild hall", "Set the secret pamphlet in type"]);
      expect(checkBeatDesign(switchStory, swapped, swapped).checks.switchOptionsFollowDirections).toBe(false);
      const ids = withOptions([`Carry the petition to the Guild hall (${GUILD})`, "Visit the goblin enclave's elders", "Set the secret pamphlet in type"]);
      expect(checkBeatDesign(switchStory, ids, ids).checks.switchOptionsNoIds).toBe(false);
      expect(checkBeatDesign(threadBeat(1), inOrder, inOrder).checks).not.toHaveProperty("switchOptionsFollowDirections");
    });

    it("wants direct speech in a first turn's first paragraph", () => {
      const speech = beatSet(1);
      speech.player1 = beatGeneration({ text: "\"You're late,\" Gruk says. The poster is still wet.\n\nYou nod." });
      expect(checkBeatDesign(firstSwitchBeat(1), speech, speech).checks.firstParagraphSpeech).toBe(true);
      const summary = beatSet(1);
      summary.player1 = beatGeneration({ text: "You recall the Guild and the enclave.\n\nGruk says, \"Tonight.\"" });
      expect(checkBeatDesign(firstSwitchBeat(1), summary, summary).checks.firstParagraphSpeech).toBe(false);
      expect(checkBeatDesign(threadBeat(1), speech, speech).checks).not.toHaveProperty("firstParagraphSpeech");
    });

    it("wants the ending's answers to cover every outcome once, with one of its own resolutions, and an outcome without milestones mixed", () => {
      // endingBeat's last chapter ends on outcome_1, which this ending gives a milestone
      const story = endingBeat(1, { sharedOutcomes: [outcome("outcome_1"), outcome("outcome_2")] });
      const answered = (answers: { outcomeId: string; resolution: string }[]) => {
        const beats = beatSet(1);
        beats.player1 = { ...beatGeneration({ options: [] }), outcomeEndings: answers.map((a) => ({ ...a, basis: "b" })) } as never;
        return checkBeatDesign(story, beats, beats).checks;
      };
      expect(answered([{ outcomeId: "outcome_1", resolution: "favorable" }, { outcomeId: "outcome_2", resolution: "mixed" }])).toMatchObject({
        endingAnswersEveryOutcome: true,
        endingNoMilestoneMixed: true,
      });
      expect(answered([{ outcomeId: "outcome_1", resolution: "favorable" }]).endingAnswersEveryOutcome).toBe(false);
      expect(answered([{ outcomeId: "outcome_1", resolution: "sideAWins" }, { outcomeId: "outcome_2", resolution: "mixed" }]).endingAnswersEveryOutcome).toBe(false);
      expect(answered([{ outcomeId: "outcome_1", resolution: "favorable" }, { outcomeId: "outcome_2", resolution: "unfavorable" }]).endingNoMilestoneMixed).toBe(false);
      expect(checkBeatDesign(story, beatSet(1), beatSet(1)).checks).not.toHaveProperty("endingAnswersEveryOutcome");
    });

    it("wants no lever on a challenge turn the computed rate line gives none", () => {
      const story = edited(threadBeat(1), (state) => {
        const history = state.players.player1.beatHistory;
        const options = challengeOptions();
        options[1] = { ...options[1], resourceType: "reward", basePoints: -30 };
        history[history.length - 1] = { ...history[history.length - 1], options } as Beat;
      });
      const lever = beatSet(1);
      const options = challengeOptions();
      options[0] = { ...options[0], resourceType: "sacrifice", basePoints: 30 };
      lever.player1 = beatGeneration({ options });
      expect(checkBeatDesign(story, lever, lever).checks.leverFollowsRateLine).toBe(false);
      const plain = beatSet(1, { player1: beatGeneration({ options: challengeOptions() }) });
      expect(checkBeatDesign(story, plain, plain).checks.leverFollowsRateLine).toBe(true);
      // No lever in the last two challenge turns: one fits, so either way passes and nothing is reported
      expect(checkBeatDesign(threadBeat(1), lever, lever).checks).not.toHaveProperty("leverFollowsRateLine");
    });
  });

  describe("the owner's feedback of 2026-09-30: option designs, levers per chapter, and continuity", () => {
    const GUILD = "player1_guild_reform";
    const bonus = (statId: string, effect: number) => ({ statId, reason: "fits", effect });
    type Challenge = ReturnType<typeof challengeOptions>[number];
    const withChallenge = (edits: Partial<Challenge>[]) => {
      const beats = beatSet(1);
      beats.player1 = beatGeneration({ options: challengeOptions().map((o, i) => ({ ...o, ...edits[i] })) });
      return beats;
    };

    it("reads each option's main bonus as the game counts it: distinct main stats, at most one option without", () => {
      const story = threadBeat(1);
      const distinct = withChallenge([
        { modifiersToSuccessRate: [bonus("player1_nerve", 10), bonus("player1_wits", 5)] },
        { modifiersToSuccessRate: [bonus("player1_wits", 10)] },
        { resourceType: "sacrifice", basePoints: 30 },
      ]);
      expect(checkBeatDesign(story, distinct, distinct)).toMatchObject({ checks: { primaryStatsDistinct: true }, counts: { distinctPrimaryStats: 2 } });
      // The owner's example: the same two stats on all three, only the risk differs
      const same = withChallenge(["safe", "normal", "risky"].map((riskType) => ({ riskType: riskType as Challenge["riskType"], modifiersToSuccessRate: [bonus("shared_sentiment", 15), bonus("player1_agency", 5)] })));
      expect(checkBeatDesign(story, same, same)).toMatchObject({ checks: { primaryStatsDistinct: false }, counts: { distinctPrimaryStats: 1, sameStatsOnlyRiskSets: 1 } });
      // Two options without a bonus
      const bare = withChallenge([{ modifiersToSuccessRate: [bonus("player1_nerve", 10)] }, {}, {}]);
      expect(checkBeatDesign(story, bare, bare).checks.primaryStatsDistinct).toBe(false);
      // The main bonus is the largest counted one: a third bonus is not counted, a penalty is no main bonus, +20 counts as 15
      const counted = withChallenge([
        { modifiersToSuccessRate: [bonus("player1_wits", 5), bonus("player1_nerve", 20), bonus("player1_luck", 15)] },
        { modifiersToSuccessRate: [bonus("player1_luck", -10), bonus("player1_wits", 10)] },
        { modifiersToSuccessRate: [bonus("player1_nerve", -5)] },
      ]);
      expect(checkBeatDesign(story, counted, counted)).toMatchObject({ checks: { primaryStatsDistinct: true }, counts: { distinctPrimaryStats: 2 } });
      // Not a challenge set: not reported
      expect(checkBeatDesign(firstSwitchBeat(1), beatSet(1), beatSet(1)).checks).not.toHaveProperty("primaryStatsDistinct");
      expect(checkBeatDesign(firstSwitchBeat(1), beatSet(1), beatSet(1)).counts).toMatchObject({ sameStatsOnlyRiskSets: 0 });
      expect(checkBeatDesign(firstSwitchBeat(1), beatSet(1), beatSet(1)).counts).not.toHaveProperty("distinctPrimaryStats");
    });

    it("counts a set with two normal options on the same stats and the same base, whatever their risk; a lever or another base tells them apart", () => {
      const story = threadBeat(1);
      const stats = [bonus("player1_nerve", 10)];
      const otherBase = withChallenge([{ modifiersToSuccessRate: stats }, { modifiersToSuccessRate: stats, basePoints: -10 }, { modifiersToSuccessRate: [bonus("player1_wits", 5)] }]);
      expect(checkBeatDesign(story, otherBase, otherBase).counts.sameStatsOnlyRiskSets).toBe(0);
      const lever = withChallenge([{ modifiersToSuccessRate: stats }, { modifiersToSuccessRate: stats, resourceType: "sacrifice" }, {}]);
      expect(checkBeatDesign(story, lever, lever).counts.sameStatsOnlyRiskSets).toBe(0);
      const onlyRisk = withChallenge([{ modifiersToSuccessRate: stats, riskType: "safe" }, { modifiersToSuccessRate: stats, riskType: "risky" }, { modifiersToSuccessRate: [bonus("player1_wits", 5)] }]);
      expect(checkBeatDesign(story, onlyRisk, onlyRisk).counts.sameStatsOnlyRiskSets).toBe(1);
    });

    /** A four-step challenge chapter from history index 1, with this history before the turn. */
    function chapterWith(history: Beat[]): Story {
      const done = history.length - 1;
      const analysis = threadAnalysis("challenge", 4, 1);
      const chapter: ThreadAnalysis = {
        ...analysis,
        threads: analysis.threads.map((t) => ({ ...t, outcomeId: GUILD, progression: t.progression.map((step, i) => ({ ...step, resolution: i < done ? ("favorable" as const) : null })) })),
      };
      const story = roundStory({ turns: history.length, maxTurns: 20, playerOutcomes: { player1: [outcome(GUILD)] }, phases: [roundTopicSwitch([["Petition", GUILD]], 0), chapter] });
      return edited(story, (state) => {
        state.players.player1.beatHistory = history;
      });
    }
    const past = (levers: ("normal" | "sacrifice" | "reward")[] = [], choice = 0): Beat => ({
      ...beatGeneration({ options: challengeOptions().map((o, i) => ({ ...o, resourceType: levers[i] ?? "normal" })) }),
      choice,
      resolution: "favorable",
    });
    const opening = (): Beat => ({ ...beatGeneration(), choice: 0, resolution: null });

    it("counts the chapter's rewards and sacrifices with this turn's, and wants at most one reward a chapter", () => {
      const story = chapterWith([opening(), past(["reward"]), past()]);
      const reward = withChallenge([{}, {}, { resourceType: "reward", basePoints: -30 }]);
      expect(checkBeatDesign(story, reward, reward)).toMatchObject({ checks: { atMostOneRewardPerChapter: false }, counts: { chapterRewards: 2, chapterSacrifices: 0 } });
      const plain = withChallenge([{}, {}, {}]);
      expect(checkBeatDesign(story, plain, plain)).toMatchObject({ checks: { atMostOneRewardPerChapter: true }, counts: { chapterRewards: 1, chapterSacrifices: 0 } });
      // Not a chapter step: not reported
      expect(checkBeatDesign(firstSwitchBeat(1), reward, reward).checks).not.toHaveProperty("atMostOneRewardPerChapter");
      expect(checkBeatDesign(firstSwitchBeat(1), reward, reward).counts).not.toHaveProperty("chapterRewards");
    });

    it("counts a second-or-later sacrifice in a chapter, and one whose text states no reason", () => {
      const story = chapterWith([opening(), past(["sacrifice"])]);
      const reasoned = withChallenge([{ resourceType: "sacrifice", basePoints: 30, text: "Burn your last favor with Gruk (-10% Trust) before the patrol reaches the door" }, {}, {}]);
      expect(checkBeatDesign(story, reasoned, reasoned).counts).toMatchObject({ chapterSacrifices: 2, secondSacrificeSets: 1, unreasonedSecondSacrifices: 0 });
      const bare = withChallenge([{ resourceType: "sacrifice", basePoints: 30, text: "Spend 10% Energy to force the door" }, {}, {}]);
      expect(checkBeatDesign(story, bare, bare).counts).toMatchObject({ secondSacrificeSets: 1, unreasonedSecondSacrifices: 1 });
      // The chapter's first sacrifice is no second one
      const first = chapterWith([opening(), past()]);
      expect(checkBeatDesign(first, bare, bare).counts).toMatchObject({ chapterSacrifices: 1, secondSacrificeSets: 0, unreasonedSecondSacrifices: 0 });
      // Reported on every reply, zero where it doesn't apply, so the share pools
      expect(checkBeatDesign(firstSwitchBeat(1), beatSet(1), beatSet(1)).counts).toMatchObject({ secondSacrificeSets: 0, unreasonedSecondSacrifices: 0 });
    });

    it("reads arm O's chapter lever line apart from today's rate: a second sacrifice it allows for a strong reason, no lever it gives none of", () => {
      const sacrifice = withChallenge([{ resourceType: "sacrifice", basePoints: 30, text: "Burn your last favor with Gruk (-10% Trust) before the patrol reaches the door" }, {}, {}]);
      const reward = withChallenge([{}, {}, { resourceType: "reward", basePoints: -30 }]);
      const plain = withChallenge([{}, {}, {}]);
      // A sacrifice last step: today's rate gives none, the chapter's line a second sacrifice for a strong reason and no reward
      const afterSacrifice = chapterWith([opening(), past(["sacrifice"])]);
      expect(checkBeatDesign(afterSacrifice, sacrifice, sacrifice).checks).toMatchObject({ leverFollowsChapterLine: true, leverFollowsRateLine: false });
      expect(checkBeatDesign(afterSacrifice, reward, reward).checks).toMatchObject({ leverFollowsChapterLine: false, leverFollowsRateLine: false });
      expect(checkBeatDesign(afterSacrifice, plain, plain).checks).toMatchObject({ leverFollowsChapterLine: true, leverFollowsRateLine: true });
      // A reward last step: the chapter offered no sacrifice, so none either way
      const afterReward = chapterWith([opening(), past(["reward"])]);
      expect(checkBeatDesign(afterReward, sacrifice, sacrifice).checks.leverFollowsChapterLine).toBe(false);
      expect(checkBeatDesign(afterReward, plain, plain).checks.leverFollowsChapterLine).toBe(true);
      // No lever yet and today's rate fits: the line forbids nothing, so nothing is reported
      expect(checkBeatDesign(chapterWith([opening(), past()]), reward, reward).checks).not.toHaveProperty("leverFollowsChapterLine");
      expect(checkBeatDesign(firstSwitchBeat(1), reward, reward).checks).not.toHaveProperty("leverFollowsChapterLine");
    });

    it("reads version O2's stat rule: the main stats distinct, and at most one option without a bonus that is neither a sacrifice nor a reward", () => {
      const story = threadBeat(1);
      // O2's lever set: a bonus-less sensible option beside a strength option and a bonus-less reward (arm O's rule fails it)
      const leverSet = withChallenge([{}, { modifiersToSuccessRate: [bonus("player1_nerve", 10)], basePoints: -10 }, { resourceType: "reward", basePoints: -30 }]);
      expect(checkBeatDesign(story, leverSet, leverSet).checks).toMatchObject({ primaryStatsDistinct: false, mainStatsDistinctLeverApart: true });
      // Two options on the same main stat, a lever beside them
      const sameStat = withChallenge([{ modifiersToSuccessRate: [bonus("player1_nerve", 10)] }, { modifiersToSuccessRate: [bonus("player1_nerve", 15)] }, { resourceType: "reward", basePoints: -30 }]);
      expect(checkBeatDesign(story, sameStat, sameStat).checks.mainStatsDistinctLeverApart).toBe(false);
      // Two normal options without a bonus
      const twoBare = withChallenge([{}, {}, { modifiersToSuccessRate: [bonus("player1_nerve", 10)] }]);
      expect(checkBeatDesign(story, twoBare, twoBare).checks.mainStatsDistinctLeverApart).toBe(false);
      // A lever's own bonus still counts against the others' main stats
      const leverShares = withChallenge([{ modifiersToSuccessRate: [bonus("player1_nerve", 10)] }, {}, { resourceType: "sacrifice", basePoints: 30, modifiersToSuccessRate: [bonus("player1_nerve", 5)] }]);
      expect(checkBeatDesign(story, leverShares, leverShares).checks.mainStatsDistinctLeverApart).toBe(false);
      // Three normal options on three stats, or one of them bare: both rules pass
      const three = withChallenge([{ modifiersToSuccessRate: [bonus("player1_nerve", 10)] }, { modifiersToSuccessRate: [bonus("player1_wits", 10)] }, {}]);
      expect(checkBeatDesign(story, three, three).checks).toMatchObject({ primaryStatsDistinct: true, mainStatsDistinctLeverApart: true });
      expect(checkBeatDesign(firstSwitchBeat(1), beatSet(1), beatSet(1)).checks).not.toHaveProperty("mainStatsDistinctLeverApart");
    });

    it("reads version O2's lever line: a reward invited where the chapter offered none, no lever it closes", () => {
      const sacrifice = withChallenge([{ resourceType: "sacrifice", basePoints: 30, text: "Burn your last favor with Gruk (-10% Trust) before the patrol reaches the door" }, {}, {}]);
      const reward = withChallenge([{}, {}, { resourceType: "reward", basePoints: -30 }]);
      const plain = withChallenge([{}, {}, {}]);
      // After a sacrifice: O2 invites a reward and allows a reasoned second sacrifice, so it forbids nothing
      const afterSacrifice = chapterWith([opening(), past(["sacrifice"])]);
      expect(checkBeatDesign(afterSacrifice, reward, reward).checks).not.toHaveProperty("leverFollowsO2Line");
      expect(checkBeatDesign(afterSacrifice, reward, reward).counts).toMatchObject({ rewardInvitedSets: 1, rewardWhereInvitedSets: 1 });
      expect(checkBeatDesign(afterSacrifice, plain, plain).counts).toMatchObject({ rewardInvitedSets: 1, rewardWhereInvitedSets: 0 });
      // After a reward, right away: no second reward, and today's rate gives no first sacrifice
      const afterReward = chapterWith([opening(), past(["reward"])]);
      expect(checkBeatDesign(afterReward, reward, reward).checks.leverFollowsO2Line).toBe(false);
      expect(checkBeatDesign(afterReward, sacrifice, sacrifice).checks.leverFollowsO2Line).toBe(false);
      expect(checkBeatDesign(afterReward, plain, plain).checks.leverFollowsO2Line).toBe(true);
      expect(checkBeatDesign(afterReward, reward, reward).counts).toMatchObject({ rewardInvitedSets: 0, rewardWhereInvitedSets: 0 });
      // Reported on every reply, zero where it doesn't apply, so the share pools
      expect(checkBeatDesign(firstSwitchBeat(1), reward, reward).counts).toMatchObject({ rewardInvitedSets: 0, rewardWhereInvitedSets: 0 });
      expect(checkBeatDesign(firstSwitchBeat(1), reward, reward).checks).not.toHaveProperty("leverFollowsO2Line");
    });

    describe("sentences and openings reused from the previous beat", () => {
      const previous = "You step onto the café terrace, collar up against the rain. Rain drums on the striped awning above the tables.\n\nMaya slides the demand sheet across the table toward you and waits. 'Read it,' she says.";
      const after = (text: string) => edited(threadBeat(1), (state) => {
        const history = state.players.player1.beatHistory;
        history[history.length - 1] = { ...history[history.length - 1], text };
      });
      const turn = (text: string) => beatSet(1, { player1: beatGeneration({ text }) });

      it("finds the owner's repeated opening, and sentences told again word for word, along an eight-word run, or with most of their words", () => {
        const story = after(previous);
        const repeated = turn(
          "You step onto the café terrace again. Rain drums on the striped awning above the tables.\n\nMaya slides the demand sheet across the table toward the drone. Across the table, the sheet waits toward you; Maya slides it."
        );
        expect(checkBeatDesign(story, repeated, repeated)).toMatchObject({ checks: { openingNotReused: false, noReusedSentences: false }, counts: { reusedSentences: 3, turnSentences: 4 } });
        // The pairs, for the hand read: each sentence told again with the one it tells again
        expect(reusedFromPrevious(previous, "Rain drums on the striped awning above the tables. You nod.")).toEqual({
          pairs: [["Rain drums on the striped awning above the tables.", "Rain drums on the striped awning above the tables."]],
          sentences: 2,
          openingReused: true,
        });
        const forward = turn("The first drop of rain hits the sheet before you finish reading. 'Clause four,' you say, 'is a trap.'\n\nMaya's pen stops. The drone above the square turns toward the café.");
        expect(checkBeatDesign(story, forward, forward)).toMatchObject({ checks: { openingNotReused: true, noReusedSentences: true }, counts: { reusedSentences: 0, turnSentences: 4 } });
      });

      it("leaves short lines and image tags out, and reads nothing on the first turn", () => {
        const story = after("'Go,' she says. [image id=maya source=story desc=\"Maya\"]The rain keeps falling on the empty tables tonight.");
        const short = turn("'Go,' she says. You go.");
        expect(checkBeatDesign(story, short, short)).toMatchObject({ checks: { noReusedSentences: true, openingNotReused: true }, counts: { reusedSentences: 0 } });
        const first = checkBeatDesign(firstSwitchBeat(1), turn(previous), turn(previous));
        expect(first.checks).not.toHaveProperty("noReusedSentences");
        expect(first.checks).not.toHaveProperty("openingNotReused");
        expect(first.counts).toMatchObject({ reusedSentences: 0, turnSentences: 0 });
      });
    });
  });

  it("does not throw on a malformed reply", () => {
    const junk = { statChanges: "x", newMilestones: 3, player1: { options: "x", text: 4 } } as unknown as SetOfBeatGenerationSchema;
    expect(() => checkBeatDesign(laterSwitchBeat(1), junk, junk)).not.toThrow();
    expect(() => checkSwitchDesign(switchAnalysisAfterThread(1), { switches: "x" } as unknown as SwitchAnalysis)).not.toThrow();
    expect(() => checkThreadDesign(threadAnalysisAfterSwitch(1), { threads: [null] } as unknown as ThreadAnalysis)).not.toThrow();
  });
});
