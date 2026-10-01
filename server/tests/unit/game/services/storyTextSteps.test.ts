import { jest } from "@jest/globals";
import { z } from "zod";
import type { Story } from "core/models/Story.js";
import { GameModes, type Beat, type ChallengeOption, type Change } from "core/types/index.js";
import { POINTS_FOR_REWARD, POINTS_FOR_SACRIFICE } from "core/config.js";
import {
  analysisBefore,
  beatStep,
  partialTemplateSchema,
  switchStep,
  threadStep,
} from "../../../../src/game/services/storyTextSteps.js";
import { createMockMultiplayerStory, createMockStory } from "../../../helpers/testHelpers.js";
import { threadBeat } from "../../../helpers/promptStories.js";
import {
  beatGeneration,
  beatSet,
  challengeOptions,
  stat,
  switchAnalysis,
  threadAnalysis,
} from "../../../helpers/textFixtures.js";

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

function playedBeat(resolution: Beat["resolution"] = "resolution1"): Beat {
  return { ...beatGeneration(), choice: 0, resolution };
}

function storyWithBeats(beats: number, overrides = {}) {
  const base = createMockStory(overrides).getState();
  return createMockStory({
    ...overrides,
    players: {
      player1: { ...base.players.player1, beatHistory: Array.from({ length: beats }, () => playedBeat()) },
    },
  });
}

function shapeOf(story: ReturnType<typeof createMockStory>) {
  return beatStep.request(story).schema.shape;
}

describe("beatStep.request schema flags", () => {
  it("allows milestones on a switch after the first beat, not on the first switch", () => {
    const firstSwitch = createMockStory({ storyPhases: [switchAnalysis(["player1"])] });
    expect(shapeOf(firstSwitch).newMilestones).toBeInstanceOf(z.ZodLiteral);

    const laterSwitch = storyWithBeats(3, { storyPhases: [switchAnalysis(["player1"], 3)] });
    expect(shapeOf(laterSwitch).newMilestones).toBeInstanceOf(z.ZodArray);
  });

  it("allows milestones on the ending", () => {
    const resolved = threadAnalysis("exploration", 2, 1);
    resolved.threads[0].progression.forEach((step) => (step.resolution = "resolution1"));
    const ending = storyWithBeats(3, { maxTurns: 3, storyPhases: [resolved] });
    expect(ending.getCurrentBeatType()).toBe("ending");
    expect(shapeOf(ending).newMilestones).toBeInstanceOf(z.ZodArray);
  });

  it("asks for multiplayer coordination only in multiplayer games", () => {
    expect(shapeOf(createMockStory()).multiplayerCoordination).toBeInstanceOf(z.ZodLiteral);
    expect(shapeOf(createMockMultiplayerStory(2)).multiplayerCoordination).toBeInstanceOf(
      z.ZodString
    );
  });

  it("adds an image request field only when the story generates images", () => {
    const beatShape = (generateImages: boolean) => {
      const player = Object.entries(shapeOf(createMockStory({ generateImages }))).find(
        ([key]) => key === "player1"
      )?.[1];
      return player instanceof z.ZodObject ? Object.keys(player.shape) : [];
    };
    expect(beatShape(true)).toContain("imageRequest");
    expect(beatShape(false)).not.toContain("imageRequest");
  });
});

describe("beatStep.apply", () => {
  it("adds the new beat and merges stat changes, milestones, facts, elements and introductions", () => {
    const story = createMockStory({ generateImages: true });
    const statChange: Change = {
      type: "statChange",
      group: "shared",
      stat: "gold",
      change: "addNumber",
      value: 5,
    };
    const milestone: Change = {
      type: "newMilestone",
      outcomeGroup: "player1",
      outcome: "o1",
      newMilestone: "m",
    };
    const fact: Change = { type: "newFact", storyElementId: "world", fact: "f" };
    const intro: Change = {
      type: "addIntroductionOfStoryElement",
      player: "player1",
      storyElementId: "inn",
    };
    const element: Change = {
      type: "newStoryElement",
      element: {
        id: "inn",
        name: "Inn",
        role: "location",
        instructions: "",
        appearance: "",
        facts: [],
      },
    };
    const beat = beatGeneration({
      imageRequest: { caption: "The hall", id: "hall", referenceImageIds: [], prompt: "the hall" },
    });
    beat.plan.establishedFacts = [fact];
    beat.plan.newGameElements = [element];
    beat.plan.newIntroductionsOfStoryElements = [intro];
    const response = beatSet(1, { statChanges: [statChange], newMilestones: [milestone], player1: beat });

    const [updated, changes, imageRequests] = beatStep.apply(story, response);
    expect(changes).toEqual([statChange, milestone, fact, element, intro]);
    expect(updated.getCurrentTurn()).toBe(1);
    expect(updated.getCurrentBeat("player1")?.choice).toBe(-1);
    expect(imageRequests).toHaveLength(1);
    expect(beatStep.apply(story, response, true)[2]).toHaveLength(0);
  });
});

describe("beatStep.apply records the lever a turn paid on its new beat (for the next turn's repair, TR-10)", () => {
  const RESERVE = stat("player_personal_reserve", { name: "Personal Reserve", optionsToSacrifice: "Spend 15% Personal Reserve to sustain one difficult effort." });
  const CONTACTS = stat("player_city_contacts", { type: "string[]", name: "City Contacts", optionsToSacrifice: "Call in one contact, removing them from the list." });
  const CRUMBS = stat("shared_pantry_crumbs", { type: "number", name: "Pantry Crumbs", optionsToSacrifice: "Spend 1 Pantry Crumb to wedge, bait or bribe." });
  const BRACE = "Brace the shuddering control ring and keep it aligned (-15% Personal Reserve).";
  const option = (text: string, resourceType: "normal" | "sacrifice" = "sacrifice"): ChallengeOption => ({
    optionType: "challenge",
    resourceType,
    riskType: "normal",
    text,
    basePoints: resourceType === "sacrifice" ? POINTS_FOR_SACRIFICE : 0,
    modifiersToSuccessRate: [],
  });

  /** Each player's last beat chose this option (none: a normal one); Personal Reserve at 60, two contacts, three Pantry Crumbs. */
  function chose(base: Story, bySlot: Record<string, string | undefined>): Story {
    const players = Object.fromEntries(
      Object.entries(base.getPlayers()).map(([slot, player]) => {
        const beats = [...player.beatHistory];
        const text = bySlot[slot];
        beats[beats.length - 1] = { ...beats[beats.length - 1], options: [...challengeOptions().slice(0, 2), option(text ?? "Look around", text ? "sacrifice" : "normal")], choice: 2 };
        const statValues = [
          { statId: RESERVE.id, value: 60 },
          { statId: CONTACTS.id, value: ["Mara Vell", "Tavi Renn"] },
        ];
        return [slot, { ...player, beatHistory: beats, statValues }];
      })
    );
    return base.clone({ sharedStats: [CRUMBS], sharedStatValues: [{ statId: CRUMBS.id, value: 3 }], playerStats: [RESERVE, CONTACTS], players });
  }
  const change = (group: string, id: string, kind: "addNumber" | "subtractNumber" | "setNumber" | "removeElement" | "addElement", value: number | string): Change => ({ type: "statChange", group, stat: id, change: kind, value });
  const paidOn = (story: Story, statChanges: Change[], slot = "player1") =>
    beatStep.apply(story, beatSet(story.getPlayerSlots().length, { statChanges }))[0].getCurrentBeat(slot as "player1")?.paidLever;

  it("records the sacrifice the turn paid, by the change that paid it (New Avalon turn 3: 60 → 45)", () => {
    const story = chose(threadBeat(1), { player1: BRACE });
    expect(paidOn(story, [change("player1", RESERVE.id, "subtractNumber", 15)])).toEqual({ kind: "sacrifice", group: "player1", stat: RESERVE.id, step: -15 });
    expect(paidOn(story, [change("player1", RESERVE.id, "setNumber", 45)])).toEqual({ kind: "sacrifice", group: "player1", stat: RESERVE.id, step: -15 });
  });

  it("records nothing for a lever the turn left unpaid or paid the other way, or for a normal choice", () => {
    const story = chose(threadBeat(1), { player1: BRACE });
    expect(paidOn(story, [])).toBeUndefined();
    expect(paidOn(story, [change("player1", RESERVE.id, "addNumber", 15)])).toBeUndefined();
    expect(paidOn(chose(threadBeat(1), {}), [change("player1", RESERVE.id, "subtractNumber", 15)])).toBeUndefined();
  });

  /*
   * Decision A's fix 4 (2026-10-01): a list's payment is an item, recorded since then (until then a list stat's lever
   * recorded nothing, so round 3's second contacts burned or added went through); a replacement in the same reply, an
   * item not held removed or an item held added, records nothing.
   */
  it("records a list lever's payment as one item, and nothing for a replacement or a change that changes nothing", () => {
    const contact = chose(threadBeat(1), { player1: "Call in Tavi Renn from your City Contacts." });
    expect(paidOn(contact, [change("player1", CONTACTS.id, "removeElement", "Tavi Renn")])).toEqual({ kind: "sacrifice", group: "player1", stat: CONTACTS.id, step: -1 });
    expect(paidOn(contact, [change("player1", CONTACTS.id, "removeElement", "Ivo Senn")])).toBeUndefined();
    expect(paidOn(contact, [change("player1", CONTACTS.id, "removeElement", "Tavi Renn"), change("player1", CONTACTS.id, "addElement", "Ivo Senn")])).toBeUndefined();
  });

  it("records a shared stat's payment on the beat of the player who chose it", () => {
    const story = chose(threadBeat(2), { player2: "Spend 1 Pantry Crumb as a wedge under the board." });
    const paid = [change("shared", CRUMBS.id, "subtractNumber", 1)];
    expect(paidOn(story, paid, "player2")).toEqual({ kind: "sacrifice", group: "shared", stat: CRUMBS.id, step: -1 });
    expect(paidOn(story, paid, "player1")).toBeUndefined();
  });

  /*
   * A lever on a stat where more is worse (fix 3 of the second playthroughs'
   * review, adopted 2026-10-01): the setup writes its sacrifice as a rise
   * ("Let Suspicion rise 10% …") and its reward as a fall ("Lower Suspicion
   * 10% …"). Its payment is the change that moves the stat the way the lever's
   * words say: the chosen option's, else the stat's lever rule's, else a
   * sacrifice down and a reward up.
   */
  describe("on a stat where more is worse", () => {
    const SUSPICION = stat("player_suspicion", {
      name: "Suspicion",
      optionsToSacrifice: "Let Suspicion rise 10% to slip past the guards in plain sight.",
      optionsToGainAsReward: "Lower Suspicion 10% by lying low instead of pressing on.",
    });
    function choseOn(text: string, resourceType: "sacrifice" | "reward"): Story {
      const base = threadBeat(1);
      const players = Object.fromEntries(
        Object.entries(base.getPlayers()).map(([slot, player]) => {
          const beats = [...player.beatHistory];
          const lever: ChallengeOption = { ...option(text), resourceType, basePoints: resourceType === "sacrifice" ? POINTS_FOR_SACRIFICE : POINTS_FOR_REWARD };
          beats[beats.length - 1] = { ...beats[beats.length - 1], options: [...challengeOptions().slice(0, 2), lever], choice: 2 };
          return [slot, { ...player, beatHistory: beats, statValues: [{ statId: SUSPICION.id, value: 40 }] }];
        })
      );
      return base.clone({ playerStats: [SUSPICION], players });
    }

    it("records a sacrifice that raises the stat, as its words say, and nothing for a fall", () => {
      const story = choseOn("Let the guards' Suspicion rise 10% and walk through the gate in plain sight.", "sacrifice");
      expect(paidOn(story, [change("player1", SUSPICION.id, "addNumber", 10)])).toEqual({ kind: "sacrifice", group: "player1", stat: SUSPICION.id, step: 10 });
      expect(paidOn(story, [change("player1", SUSPICION.id, "subtractNumber", 10)])).toBeUndefined();
    });

    it("records a reward that lowers the stat, as its words say, and nothing for a rise", () => {
      const story = choseOn("Lie low behind the stalls and let your Suspicion drop 10%.", "reward");
      expect(paidOn(story, [change("player1", SUSPICION.id, "setNumber", 30)])).toEqual({ kind: "reward", group: "player1", stat: SUSPICION.id, step: -10 });
      expect(paidOn(story, [change("player1", SUSPICION.id, "addNumber", 10)])).toBeUndefined();
    });

    it("reads a sign in the option's text, and the stat's lever rule where the option's words say no direction", () => {
      expect(paidOn(choseOn("Slip past the guards in plain sight (+10% Suspicion).", "sacrifice"), [change("player1", SUSPICION.id, "addNumber", 10)])).toMatchObject({ step: 10 });
      const unsaid = choseOn("Walk through the gate under the guards' Suspicion.", "sacrifice");
      expect(paidOn(unsaid, [change("player1", SUSPICION.id, "addNumber", 10)])).toMatchObject({ kind: "sacrifice", step: 10 });
      expect(paidOn(choseOn("Wait out the guards' Suspicion behind the stalls.", "reward"), [change("player1", SUSPICION.id, "subtractNumber", 10)])).toMatchObject({ kind: "reward", step: -10 });
    });

    it("keeps a sacrifice down and a reward up where neither the option nor the stat's rule says a direction", () => {
      const plain = stat("player_resolve", { name: "Resolve", optionsToSacrifice: "Steel yourself with 10% Resolve.", optionsToGainAsReward: "Take heart for 10% Resolve." });
      const story = (text: string, kind: "sacrifice" | "reward") => {
        const base = choseOn(text, kind);
        const players = Object.fromEntries(Object.entries(base.getPlayers()).map(([slot, player]) => [slot, { ...player, statValues: [{ statId: plain.id, value: 50 }] }]));
        return base.clone({ playerStats: [plain], players });
      };
      expect(paidOn(story("Steel your Resolve and step into the ring.", "sacrifice"), [change("player1", plain.id, "subtractNumber", 10)])).toMatchObject({ step: -10 });
      expect(paidOn(story("Steel your Resolve and step into the ring.", "sacrifice"), [change("player1", plain.id, "addNumber", 10)])).toBeUndefined();
      expect(paidOn(story("Take a breath for your Resolve.", "reward"), [change("player1", plain.id, "addNumber", 10)])).toMatchObject({ step: 10 });
    });
  });

  /*
   * An option describes an action, so its words about something else ("greatly
   * increasing disruption") say nothing about its stat: read as if they did, the
   * correct payment went unrecorded and the next turn's second charge was kept.
   */
  describe("on an ordinary stat, whatever else the option's words say", () => {
    const AGENCY = stat("player_personal_agency", { name: "Personal Agency", optionsToSacrifice: "Can spend 10% agency for a one-time major advantage in a beat." });
    const BLACKOUT = "Expend an additional 10% of your Personal Agency to intensify the blackout, risking exhaustion but greatly increasing disruption.";
    function choseAgency(text: string): Story {
      const base = chose(threadBeat(1), { player1: text });
      const players = Object.fromEntries(Object.entries(base.getPlayers()).map(([slot, player]) => [slot, { ...player, statValues: [...player.statValues, { statId: AGENCY.id, value: 60 }] }]));
      return base.clone({ playerStats: [...base.getState().playerStats, AGENCY], players });
    }

    it("records the sacrifice that lowers it (a stored option's blackout: Personal Agency 60 → 50), and nothing for a rise", () => {
      const story = choseAgency(BLACKOUT);
      expect(paidOn(story, [change("player1", AGENCY.id, "subtractNumber", 10)])).toEqual({ kind: "sacrifice", group: "player1", stat: AGENCY.id, step: -10 });
      expect(paidOn(story, [change("player1", AGENCY.id, "addNumber", 10)])).toBeUndefined();
    });
  });

  /*
   * A ladder stat (a string stat whose possible values are its steps, lowest first) pays a lever by a step: the step is the
   * steps it moved (the review of the third playthroughs, 2026-10-01: the space pirates' Oren, Pirate Reputation Unproven →
   * Known Hand for his reward at turn 16, then Known Hand → Feared Name at 17, a second charge the repair could not see).
   */
  describe("on a ladder stat", () => {
    const REPUTATION = stat("player_reputation", {
      type: "string",
      name: "Pirate Reputation",
      possibleValues: "Unproven, Known Hand, Feared Name",
      optionsToSacrifice: "Risk your standing by making a public promise you may not be able to keep.",
      optionsToGainAsReward: "Improve one step by taking time to honor a public commitment instead of pressing on.",
      canBeChangedInBeatResolutions: false,
    });
    function choseLadder(text: string, resourceType: "sacrifice" | "reward", value: string): Story {
      const base = threadBeat(1);
      const players = Object.fromEntries(
        Object.entries(base.getPlayers()).map(([slot, player]) => {
          const beats = [...player.beatHistory];
          const lever: ChallengeOption = { ...option(text), resourceType, basePoints: resourceType === "sacrifice" ? POINTS_FOR_SACRIFICE : POINTS_FOR_REWARD };
          beats[beats.length - 1] = { ...beats[beats.length - 1], options: [...challengeOptions().slice(0, 2), lever], choice: 2 };
          return [slot, { ...player, beatHistory: beats, statValues: [{ statId: REPUTATION.id, value }] }];
        })
      );
      return base.clone({ playerStats: [REPUTATION], players });
    }
    const set = (value: string): Change => ({ type: "statChange", group: "player1", stat: REPUTATION.id, change: "setString", value });

    it("records a reward's step up and a sacrifice's step down", () => {
      const rewarded = choseLadder("Let the guild inspect the claim openly, improving Pirate Reputation one step.", "reward", "Unproven");
      expect(paidOn(rewarded, [set("Known Hand")])).toEqual({ kind: "reward", group: "player1", stat: REPUTATION.id, step: 1 });
      const risked = choseLadder("Promise the guild a correction you may not be able to deliver, risking your Pirate Reputation.", "sacrifice", "Feared Name");
      expect(paidOn(risked, [set("Known Hand")])).toEqual({ kind: "sacrifice", group: "player1", stat: REPUTATION.id, step: -1 });
    });

    it("records nothing for a step the other way, a value off the ladder, or a string stat without steps", () => {
      const rewarded = choseLadder("Let the guild inspect the claim openly, improving Pirate Reputation one step.", "reward", "Known Hand");
      expect(paidOn(rewarded, [set("Unproven")])).toBeUndefined();
      expect(paidOn(rewarded, [set("Notorious")])).toBeUndefined();
      const plain = { ...REPUTATION, possibleValues: "" };
      const unstepped = choseLadder("Let the guild inspect the claim openly, improving Pirate Reputation one step.", "reward", "Unproven").clone({ playerStats: [plain] });
      expect(paidOn(unstepped, [set("Known Hand")])).toBeUndefined();
    });
  });
});

describe("analysis steps", () => {
  it("adds a switch phase starting at the next beat", () => {
    const story = storyWithBeats(2);
    const updated = switchStep.apply(story, switchAnalysis(["player1"]));
    expect(updated.getCurrentBeatType()).toBe("switch");
    expect(updated.getState().storyPhases[0]).toMatchObject({ firstBeatIndex: 2, duration: 1 });
  });

  it("adds a thread phase with unresolved steps and records the thread type", () => {
    const story = storyWithBeats(2);
    const updated = threadStep.apply(story, threadAnalysis("challenge", 3, 0));
    expect(updated.getCurrentBeatType()).toBe("thread");
    expect(updated.getCurrentThreadBeatsCompleted()).toBe(0);
    expect(updated.getCurrentThreadAnalysis()?.threads[0]).toMatchObject({
      firstBeatIndex: 2,
      duration: 3,
      milestone: null,
    });
    expect(updated.getPlayer("player1")?.previousTypesOfThreads).toContain("Chase");
  });
});

describe("analysisBefore", () => {
  it("runs a switch analysis before a switch beat", () => {
    expect(analysisBefore(createMockStory(), "switch")).toBe("switch");
  });

  it("runs a thread analysis only before a thread's first beat", () => {
    const fresh = createMockStory({ storyPhases: [threadAnalysis("challenge", 2, 0)] });
    expect(analysisBefore(fresh, "thread")).toBe("thread");

    const started = threadAnalysis("challenge", 2, 0);
    started.threads[0].progression[0].resolution = "favorable";
    expect(analysisBefore(createMockStory({ storyPhases: [started] }), "thread")).toBeUndefined();
  });

  it("runs nothing before an ending", () => {
    expect(analysisBefore(createMockStory(), "ending")).toBeUndefined();
  });
});

describe("partialTemplateSchema", () => {
  it("keeps only the section fields and this player count's slots", () => {
    const keys = Object.keys(partialTemplateSchema(["players", "media", "unknown"], 2, GameModes.Competitive).shape);
    expect(keys.sort()).toEqual(
      ["characterSelectionIntroduction", "characterSelectionPlan", "imageInstructions", "player1", "player2"].sort()
    );
  });
});
