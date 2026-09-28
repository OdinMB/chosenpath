import { describe, expect, it } from "@jest/globals";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { Story } from "core/models/Story.js";
import { GameModes, type ThreadAnalysis } from "core/types/index.js";
import { beatStep } from "../../../../../src/game/services/storyTextSteps.js";
import { CHAPTER_TURN_TEXT, chapterTurnRequest } from "../../../../../src/game/services/storyTextRounds/turnRound1Turns.js";
import { endedChapter, flavorSwitch, outcome, roundStory, topicSwitch } from "../../../../helpers/roundStories.js";
import { stat } from "../../../../helpers/textFixtures.js";
import { descriptionsOf } from "../storyTextRewrite/rewriteChecks.js";

const GUILD = "player1_guild_reform";
const ENCLAVE = "player1_enclave_trust";
const FRAMES = { chapter_x: { question: "Will Zelda rejoin the movement?", plan: "Rikkit stays in the print shop with Zelda; the Guild's informer pushes back." } };

const occurrences = (text: string, passage: string) => text.split(passage).length - 1;
const descriptions = (schema: Parameters<typeof toJsonSchema>[0]) => descriptionsOf(toJsonSchema(schema)).join("\n");

/** A chapter at step `done + 1` of `duration`, on the guild outcome, after a topic switch the player took */
function chapterStory(done: number, duration: number, options: { players?: number; contest?: boolean; own?: { question: string; plan: string } } = {}): Story {
  const players = options.players ?? 1;
  const slots = Array.from({ length: players }, (_, i) => `player${i + 1}`);
  const base = endedChapter(GUILD, duration, 5, "unused", slots);
  const [first] = base.threads;
  const thread = {
    ...first,
    id: "chapter_x",
    title: "The Print Shop",
    typeOfThread: "Negotiation",
    typeOfMilestone: "winning or losing Zelda",
    ...(options.contest
      ? {
          outcomeId: "shared_duel",
          playersSideA: ["player1"],
          playersSideB: ["player2"],
          possibleMilestones: { sideAWins: "A", mixed: "draw", sideBWins: "B" },
          progression: first.progression.map((s) => ({ ...s, possibleResolutions: { sideAWins: "A", mixed: "d", sideBWins: "B" } })),
        }
      : {}),
    progression: (options.contest ? first.progression.map((s) => ({ ...s, possibleResolutions: { sideAWins: "A", mixed: "d", sideBWins: "B" } })) : first.progression).map((step, i) => ({
      ...step,
      title: `Step ${i + 1}`,
      question: `How does Rikkit act in step ${i + 1}?`,
      resolution: i < done ? ("favorable" as const) : null,
    })),
    resolution: null,
    milestone: null,
    ...(options.own ?? {}),
  };
  const chapter: ThreadAnalysis = { ...base, threads: [thread] };
  return roundStory({
    players,
    turns: 5 + done,
    maxTurns: 20,
    gameMode: options.contest ? GameModes.Competitive : undefined,
    sharedOutcomes: options.contest ? [outcome("shared_duel", { possibleResolutions: { sideAWins: "A", mixed: "draw", sideBWins: "B" }, resonance: "Pride. Scored by Duel Standing." })] : [],
    playerOutcomes: Object.fromEntries(slots.map((slot) => [slot, [outcome(slot === "player1" ? GUILD : `${slot}_own`, { milestones: slot === "player1" ? ["Sir Bram listened"] : [] }), outcome(slot === "player1" ? ENCLAVE : `${slot}_x`)]])),
    phases: [topicSwitch([["Guild", GUILD]], 4, slots), chapter],
    switchAndThreadInstructions: ["Negotiation threads take two beats: the opening offer, then the price."],
  });
}

/** The same story with a scoreboard stat for the contest's Score line */
function withScoreboard(story: Story): Story {
  const state = story.getState();
  return Story.create({
    ...state,
    sharedStats: [stat("shared_duel_standing", { name: "Duel Standing", type: "opposites" })],
    sharedStatValues: [{ statId: "shared_duel_standing", value: 60 }],
  });
}

const FORMS = ["full", "slim"] as const;

describe("chapterTurnRequest builds", () => {
  it.each(FORMS.flatMap((form) => [[form, 0, 3], [form, 1, 3], [form, 2, 3], [form, 1, 2]] as const))("%s form, step %i done of %i: a schema that converts", (form, done, duration) => {
    const request = chapterTurnRequest(chapterStory(done, duration), form, FRAMES);
    expect(() => toJsonSchema(request.schema)).not.toThrow();
  });

  it("covers multiplayer chapter turns on the full form", () => {
    expect(() => chapterTurnRequest(chapterStory(1, 3, { players: 2 }), "full", FRAMES)).not.toThrow();
    expect(() => chapterTurnRequest(withScoreboard(chapterStory(1, 3, { players: 2, contest: true })), "full")).not.toThrow();
  });

  it("refuses turns that are not chapter steps, and the slim form in multiplayer (round 1 measures it for one player)", () => {
    const switchBeat = roundStory({ turns: 5, maxTurns: 20, phases: [flavorSwitch(GUILD, "q", 4)] });
    expect(() => chapterTurnRequest(switchBeat, "full")).toThrow(/chapter/);
    expect(() => chapterTurnRequest(chapterStory(1, 3, { players: 2 }), "slim")).toThrow(/single-player/);
  });
});

describe("the THIS THREAD block (B2)", () => {
  it("frames the step: kind and position, thread type, the question, the outcome with its milestones, why it matters, the plan and the step", () => {
    const { prompt } = chapterTurnRequest(chapterStory(1, 3), "full", FRAMES);
    expect(prompt).toContain(
      [
        "======= THIS THREAD: The Print Shop (challenge, beat 2 of 3) =======",
        "Thread type: Negotiation",
        "It decides: Will Zelda rejoin the movement?",
        `For the outcome: Question of ${GUILD}? (${GUILD}). So far 1 of 2 milestones: Sir Bram listened`,
        "Why it matters to Test Player: It matters.",
        `Plan: ${FRAMES.chapter_x.plan}`,
        "This step: Step 2: How does Rikkit act in step 2?",
      ].join("\n")
    );
    expect(prompt).not.toContain("Related Outcome:");
    expect(prompt).not.toContain("==== CHALLENGE THREAD: The Print Shop (chapter_x) ====");
    expect(prompt).not.toContain("CURRENT STEP IN THREAD PROGRESSION");
    expect(prompt).toContain("Possible milestones:");
  });

  it("prefers the chapter's own question and plan (planner v2) over a backfilled frame, and falls back to the kind of milestone", () => {
    const own = { question: "Own question?", plan: "Own plan." };
    expect(chapterTurnRequest(chapterStory(1, 3, { own }), "full", FRAMES).prompt).toContain("It decides: Own question?");
    const fallback = chapterTurnRequest(chapterStory(1, 3), "full").prompt;
    expect(fallback).toContain("It decides: winning or losing Zelda");
    expect(fallback).not.toContain("\nPlan: ");
  });

  it("shows a contest's sides by name and its score, without the resonance's Scored-by sentence", () => {
    const { prompt } = chapterTurnRequest(withScoreboard(chapterStory(1, 3, { players: 2, contest: true })), "full");
    expect(prompt).toContain("Why it matters to Test Player 1 and Test Player 2: Pride.");
    expect(prompt).not.toContain("Scored by");
    expect(prompt).toContain("Score: Duel Standing: 60|40");
    expect(prompt).toContain("Sides: Test Player 1 (side A) against Test Player 2 (side B)");
  });

  it("gives chapter turns the story's switch/thread instructions, once", () => {
    const { prompt } = chapterTurnRequest(chapterStory(1, 3), "full", FRAMES);
    expect(occurrences(prompt, "SPECIAL SWITCH/THREAD INSTRUCTIONS:")).toBe(1);
    expect(prompt).toContain("Negotiation threads take two beats: the opening offer, then the price.");
    expect(beatStep.request(chapterStory(1, 3)).prompt).not.toContain("SPECIAL SWITCH/THREAD INSTRUCTIONS:");
  });
});

describe("the progress rule (B2) and each rule once (B3 rows 11, 14, 15)", () => {
  it.each(FORMS.flatMap((form) => [[form, 0, 3], [form, 2, 3]] as const))("%s form, step %i done of %i", (form, done, duration) => {
    const last = done + 1 === duration;
    const { prompt, schema } = chapterTurnRequest(chapterStory(done, duration), form, FRAMES);
    const schemaText = descriptions(schema);
    expect(occurrences(prompt, CHAPTER_TURN_TEXT.progressRuleStart)).toBe(1);
    expect(occurrences(prompt, CHAPTER_TURN_TEXT.decisive)).toBe(last ? 1 : 0);
    expect(prompt).toContain("- Follow the thread's plan (THIS THREAD) and its steps.");
    // B2 replaces both unclear paragraphs, and B3 row 15 the other copies of "don't resolve"
    for (const gone of [
      "should be answered in this beat",
      "WITHOUT defining the resolution of the step",
      "This is not yet the last beat of the thread",
      "Don't define or narrate the resolution of the thread",
      "Remember that the resolution of the beat will only be determined AFTER this beat",
      "make sure that this progression is followed",
    ]) {
      expect(prompt).not.toContain(gone);
      expect(schemaText).not.toContain(gone);
    }
    expect(schemaText).not.toContain("don't define the resolution of this step");
    // B3 row 11: one outcome per thread
    expect(prompt).not.toContain("one or more story outcomes");
    expect(prompt).not.toContain("one or more outcomes");
    expect(prompt).toContain("After the final beat, one of the thread's possible milestones is added to its outcome.");
    // B3 row 14: the summary carries the decision
    expect(prompt).not.toContain("The players' decisions are tracked separately");
    expect(schemaText).toContain(CHAPTER_TURN_TEXT.summary);
  });
});

describe("the slim reply (B4)", () => {
  it("drops the unread planning and the title, keeps show-don't-tell, the options check and the state changes", () => {
    const json = JSON.stringify(toJsonSchema(chapterTurnRequest(chapterStory(1, 3), "slim", FRAMES).schema));
    for (const gone of ['"statsAffectingDecisionConsequences"', '"forPlayer"', '"developmentsToNarrate"', '"beatTypeConsiderations"', '"worldBuilding"', '"showDontTellPreviousDecision"', '"keyConflictsAndDecisions"', '"title"']) {
      expect(json).not.toContain(gone);
    }
    for (const kept of ['"showDontTell"', '"previousOptionsToAvoid"', '"upToOneSacrificeOrRewardOption"', '"statChanges"', '"establishedFacts"', '"newGameElements"', '"newIntroductionsOfStoryElements"']) {
      expect(json).toContain(kept);
    }
  });

  it("states the facts, introductions and new-elements rules in their fields, once", () => {
    const { prompt, schema } = chapterTurnRequest(chapterStory(1, 3), "slim", FRAMES);
    const schemaText = descriptions(schema);
    expect(schemaText).toContain(CHAPTER_TURN_TEXT.facts);
    expect(schemaText).toContain(CHAPTER_TURN_TEXT.introductions);
    expect(schemaText).toContain(CHAPTER_TURN_TEXT.newElements);
    expect(prompt).not.toContain("Aim for adding 3 or more new facts");
    expect(prompt).not.toContain("In most beats, you don't have to add a new story element.");
    expect(prompt).toContain(CHAPTER_TURN_TEXT.decisionOption);
    expect(prompt).not.toContain("after the title to indicate the beat number");
  });

  it("writes each title in code, in today's '<thread title> (k/n)' form that the game screen reads", () => {
    const request = chapterTurnRequest(chapterStory(1, 3), "slim", FRAMES);
    const assembled = request.assemble?.({ statChanges: [], newMilestones: "", player1: { text: "t", summary: "s", options: [], interludes: [] } }) as Record<string, { title: string }>;
    expect(assembled.player1.title).toBe("The Print Shop (2/3)");
    const first = chapterTurnRequest(chapterStory(0, 2), "slim").assemble?.({ player1: { text: "t" } }) as Record<string, { title: string }>;
    expect(first.player1.title).toBe("The Print Shop (1/2)");
  });

  it("leaves the full form's reply as the model writes it", () => {
    expect(chapterTurnRequest(chapterStory(1, 3), "full", FRAMES).assemble).toBeUndefined();
  });
});

describe("slim's one fix-and-retest: the step and world-building plans kept (round 1: facts 3.97 → 3.28 per turn, the step left open 91% → 81%)", () => {
  const plan = (form: "slim" | "slimPlans") => {
    const json = toJsonSchema(chapterTurnRequest(chapterStory(1, 3), form, FRAMES).schema) as { properties: Record<string, { properties: Record<string, { properties: Record<string, unknown> }> }> };
    return json.properties.player1.properties.plan.properties;
  };
  const production = () =>
    (
      toJsonSchema(beatStep.request(chapterStory(1, 3)).schema) as {
        properties: Record<string, { properties: Record<string, { properties: Record<string, { description?: string }> }> }>;
      }
    ).properties.player1.properties.plan.properties;

  it("is slim with production's beatTypeConsiderations and worldBuilding fields back, in production's places: before the new elements and the facts", () => {
    const keys = Object.keys(plan("slimPlans"));
    expect(keys).toEqual(["beatTypeConsiderations", "worldBuilding", ...Object.keys(plan("slim"))]);
    expect(keys.indexOf("worldBuilding")).toBeLessThan(keys.indexOf("establishedFacts"));
    for (const field of ["beatTypeConsiderations", "worldBuilding"]) {
      expect((plan("slimPlans")[field] as { description?: string }).description).toBe(production()[field].description);
    }
  });

  it("changes nothing else: the same prompt, titles written by code", () => {
    const [slim, retest] = (["slim", "slimPlans"] as const).map((form) => chapterTurnRequest(chapterStory(1, 3), form, FRAMES));
    expect(retest.prompt).toBe(slim.prompt);
    expect((retest.assemble?.({ player1: { text: "t" } }) as Record<string, { title: string }>).player1.title).toBe("The Print Shop (2/3)");
  });
});
