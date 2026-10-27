import { describe, expect, it } from "@jest/globals";
import { PLACEHOLDER_MARK, chatCompletion, instanceFromSchema } from "../../../../harness/lib/fake-openai.mjs";
import {
  BASE_POINTS,
  BONUS_EFFECTS,
  CHANGE_STEPS,
  EMPTY_REQUEST,
  RISKS,
  START_VALUES,
  chapterLengthIn,
  readRequest,
  requestText,
  seededRandom,
  statsIn,
  turnNumberIn,
  type FakeRequestReading,
} from "../../../../harness/lib/fake-story.mjs";

/*
 * What the harness's fake model reads in a request beyond its schema, and the
 * seeded variety it writes (harness/lib/fake-story.mjs): chapters as long as
 * PACING asks, so a story ends on its turn count; options that differ in
 * risk, points and bonuses; stats that start apart and move every turn but
 * the first. Pure schema instances on the replies' shapes; nothing is served.
 * fakeModel.test.ts plays whole stories on it with the product's own code.
 */

const string = { type: "string" };
const number = { type: "number" };

/** A single player's chapter plan's shape (plannerReplies.ts, threadReplySchema). */
const chapterPlan = {
  type: "object",
  properties: {
    thread: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["challenge", "exploration"] },
        title: string,
        steps: { type: "array", maxItems: 3, items: { type: "object", properties: { title: string, question: string }, required: ["title", "question"] } },
        finalStep: { type: "object", properties: { title: string, question: string }, required: ["title", "question"] },
      },
      required: ["kind", "title", "steps", "finalStep"],
    },
  },
  required: ["thread"],
};

/** A group's chapter plan's shape: one duration for every thread. */
const groupChapterPlan = {
  type: "object",
  properties: {
    duration: number,
    threads: { type: "array", items: chapterPlan.properties.thread },
  },
  required: ["duration", "threads"],
};

type JsonSchema = { [key: string]: unknown; properties?: Record<string, JsonSchema>; items?: JsonSchema; anyOf?: JsonSchema[] };

/**
 * A schema as the product's JSON schema writes a part it repeats (a group's
 * later seats): a definition whose every property, list item and union
 * variant is a definition of its own, referred to by its path.
 */
function asDefinitions(name: string, schema: JsonSchema, definitions: Record<string, JsonSchema>): JsonSchema {
  const written: JsonSchema = { ...schema };
  if (schema.properties) {
    written.properties = Object.fromEntries(Object.entries(schema.properties).map(([key, child]) => [key, asDefinitions(`${name}_properties_${key}`, child, definitions)]));
  }
  if (schema.items) written.items = asDefinitions(`${name}_items`, schema.items, definitions);
  if (schema.anyOf) written.anyOf = schema.anyOf.map((variant, i) => asDefinitions(`${name}_anyOf_${i}`, variant, definitions));
  definitions[name] = written;
  return { $ref: `#/definitions/${name}` };
}

/**
 * A turn's shape (core's createSetOfBeatGenerationSchema) for these seats, as
 * the request carries it: the options a union, the first seat's beat inline
 * and the others' referring to its definitions, a stat change's group a union
 * of "shared" and the seats.
 */
function turnFor(seats: string[]) {
  const option: JsonSchema = {
    anyOf: [
      {
        type: "object",
        properties: { optionType: { type: "string", const: "exploration" }, resourceType: { type: "string", enum: ["normal", "sacrifice", "reward"] }, text: string },
        required: ["optionType", "resourceType", "text"],
      },
      {
        type: "object",
        properties: {
          optionType: { type: "string", const: "challenge" },
          resourceType: { type: "string", enum: ["normal", "sacrifice", "reward"] },
          // As the product describes it, which names the beat
          text: { type: "string", description: "Text shown to player for this choice. Prioritize flavor and consistency between beat and option text." },
          riskType: { type: "string", enum: ["normal", "safe", "risky"] },
          basePoints: number,
          modifiersToSuccessRate: {
            type: "array",
            items: { type: "object", properties: { statId: string, reason: string, effect: number }, required: ["statId", "reason", "effect"] },
          },
        },
        required: ["optionType", "resourceType", "text", "riskType", "basePoints", "modifiersToSuccessRate"],
      },
    ],
  };
  const beat: JsonSchema = {
    type: "object",
    properties: {
      title: string,
      text: { type: "string", description: "The narrative of the beat." },
      options: { type: "array", items: option, description: "Exactly 3 choices for the player." },
    },
    required: ["title", "text", "options"],
  };
  const statChange = {
    type: "object",
    properties: {
      type: { type: "string", const: "statChange" },
      group: { anyOf: [{ type: "string", const: "shared" }, { type: "string", enum: seats }] },
      stat: string,
      change: { type: "string", enum: ["setBoolean", "addNumber", "subtractNumber", "setNumber", "setString", "addElement", "removeElement"] },
      value: { type: ["number", "string", "boolean"] },
    },
    required: ["type", "group", "stat", "change", "value"],
  };
  const definitions: Record<string, JsonSchema> = {};
  const later = seats.length > 1 ? asDefinitions("extract_properties_player1", beat, definitions) : undefined;
  return {
    type: "object",
    properties: {
      statChanges: { type: "array", items: statChange, description: "If this is the first beat of the story, just return an empty list." },
      ...Object.fromEntries(seats.map((seat, i) => [seat, i === 0 ? beat : later])),
    },
    required: ["statChanges", ...seats],
    definitions,
  };
}

/** A setup's stats' shape: their starting values, and a background's. */
const setupStats = {
  type: "object",
  properties: {
    sharedStats: {
      type: "array",
      items: { type: "object", properties: { id: string, initialValue: { anyOf: [number, string, { type: "array", items: string }] } }, required: ["id", "initialValue"] },
    },
    initialPlayerStatValues: {
      type: "array",
      items: { type: "object", properties: { statId: string, value: { anyOf: [number, string, { type: "array", items: string }] } }, required: ["statId", "value"] },
    },
  },
  required: ["sharedStats", "initialPlayerStatValues"],
};

/** The stats section of a request, as StoryStatePromptService writes it. */
const STATS_SECTION = [
  "SHARED STATS:",
  "- HARBOUR CALM (id: shared_calm, type: percentage): 40%",
  "  - Can be adjusted anytime",
  "",
  "- OPEN QUESTIONS (id: shared_questions, type: string[]): none",
  "",
  "PLAYER STAT DEFINITIONS:",
  "- NERVE (id: player_nerve, type: percentage): Values in player sections below",
  "",
  "- COINS (id: player_coins, type: number): Values in player sections below",
  "",
  "CHARACTER STAT VALUES:",
  "- NERVE (player_nerve): 55%",
].join("\n");

const turnRequest = (job: string, extra = ""): FakeRequestReading =>
  readRequest(`======= YOUR JOB: IDENTIFY CHANGES TO THE STORY STATE AND GENERATE THE NEXT SET OF STORY BEATS TO IMPLEMENT THE ${job} =======\n${STATS_SECTION}\n${extra}`);

type Option = { optionType: string; text: string; riskType?: string; basePoints?: number; modifiersToSuccessRate?: { statId: string; effect: number }[] };
type Turn = { statChanges: { group: string; stat: string; change: string; value: number }[] } & Record<string, { title: string; text: string; options: Option[] }>;

describe("what the fake model reads in a request", () => {
  it("takes the last chapter's exact length, else the shortest length PACING allows", () => {
    expect(chapterLengthIn("This thread starts at turn 2 of 5; 4 turns are left, this one included.\nThis is the story's last thread: exactly 4 beats. It is the story's climax.")).toBe(4);
    expect(chapterLengthIn("Allowed lengths for this thread: 2, 3 or 4 beats.")).toBe(2);
    expect(chapterLengthIn("Allowed lengths for this thread: 3 or 4 beats. Shorter ones would leave milestones unsettled.")).toBe(3);
    expect(chapterLengthIn("Allowed lengths for this thread: 4 beats.")).toBe(4);
    expect(chapterLengthIn("Allowed lengths for this thread: any of 2, 3 or 4 beats (too few turns are left for the story to end on its turn count).")).toBe(2);
    // The planner's instructions name the rule without a number
    expect(chapterLengthIn("when it says this is the story's last thread, use exactly its number of beats")).toBeUndefined();
  });

  it("lists the request's stats, shared or a player's by the section they are in", () => {
    expect(statsIn(STATS_SECTION)).toEqual([
      { id: "shared_calm", type: "percentage", shared: true },
      { id: "shared_questions", type: "string[]", shared: true },
      { id: "player_nerve", type: "percentage", shared: false },
      { id: "player_coins", type: "number", shared: false },
    ]);
    // Without the player heading, by the id's form
    expect(statsIn("- A (id: player_a, type: number)\n- B (id: crew_b, type: percentage)").map((s) => s.shared)).toEqual([false, true]);
  });

  it("tells the turn a request writes, and the story's first beat", () => {
    expect(turnRequest("SWITCH CONFIGURATION").turn).toBe("switch");
    expect(turnRequest("THREAD CONFIGURATION").turn).toBe("thread");
    expect(turnRequest("ENDING").turn).toBe("ending");
    expect(readRequest("======= YOUR JOB: CONTINUE THE STORY WITH A SWITCH =======").turn).toBeUndefined();
    expect(turnRequest("SWITCH CONFIGURATION", "This is the first beat of the story. DON'T ADD ANY NEW STORY ELEMENTS").firstBeat).toBe(true);
    expect(turnRequest("THREAD CONFIGURATION").firstBeat).toBe(false);
  });

  it("reads the story's turn from the story state's progress line, else PACING's", () => {
    expect(turnNumberIn("======= STORY PROGRESS =======\n\nCurrent turn: 4/5\nTurns left (including this one): 2")).toBe(4);
    expect(turnNumberIn("======= PACING =======\nThis thread starts at turn 7 of 25; 19 turns are left, this one included.")).toBe(7);
    expect(turnNumberIn("Turn 11 of 25; 15 turns left, this one included.")).toBe(11);
    expect(turnNumberIn("A premise for a new World")).toBeUndefined();
    expect(turnRequest("THREAD CONFIGURATION", "Current turn: 2/3").turnNumber).toBe(2);
  });

  it("reads every message's text, in order", () => {
    expect(requestText({ messages: [{ role: "system", content: "one" }, { role: "user", content: [{ type: "text", text: "two" }] }] })).toBe("one\n\ntwo");
    expect(requestText({})).toBe("");
  });
});

describe("the fake model's chapters", () => {
  it.each([2, 3, 4])("write the steps for a %i-beat chapter when PACING asks for one", (length) => {
    const request = { ...EMPTY_REQUEST, chapterLength: length };
    const reply = instanceFromSchema(chapterPlan, undefined, { request }) as { thread: { steps: unknown[] } };
    expect(reply.thread.steps).toHaveLength(length - 1);
    const group = instanceFromSchema(groupChapterPlan, undefined, { request }) as { duration: number; threads: { steps: unknown[] }[] };
    expect(group.duration).toBe(length);
    for (const thread of group.threads) expect(thread.steps).toHaveLength(length - 1);
  });

  it("are the shortest the engine plays where the request names no length", () => {
    expect((instanceFromSchema(chapterPlan) as { thread: { steps: unknown[] } }).thread.steps).toHaveLength(1);
    expect((instanceFromSchema(groupChapterPlan) as { duration: number }).duration).toBe(2);
  });
});

describe("the fake model's turns", () => {
  it("offer challenge options in a chapter, each with its own risk, points within the schema's range, and bonuses on the request's stats", () => {
    const reply = instanceFromSchema(turnFor(["player1"]), undefined, { request: turnRequest("THREAD CONFIGURATION") }) as Turn;
    const options = reply.player1.options;
    expect(options).toHaveLength(3);
    expect(options.every((o) => o.optionType === "challenge")).toBe(true);
    expect(new Set(options.map((o) => o.riskType))).toEqual(new Set(RISKS));
    // The beat's text is a scene; each option's one marked line, which the journeys find the choices by
    expect(reply.player1.text).toContain(PLACEHOLDER_MARK);
    for (const option of options) {
      expect(option.text).toContain("(placeholder ");
      expect(option.text).not.toContain(PLACEHOLDER_MARK);
      expect(BASE_POINTS).toContain(option.basePoints);
      expect(option.modifiersToSuccessRate?.length).toBeGreaterThanOrEqual(1);
      expect(option.modifiersToSuccessRate?.length).toBeLessThanOrEqual(2);
      for (const bonus of option.modifiersToSuccessRate ?? []) {
        // A player stat in the seat form the bonus contract asks for; never a list stat
        expect(["shared_calm", "player1_nerve", "player1_coins"]).toContain(bonus.statId);
        expect(BONUS_EFFECTS).toContain(bonus.effect);
      }
      const bonusStats = (option.modifiersToSuccessRate ?? []).map((b) => b.statId);
      expect(new Set(bonusStats).size).toBe(bonusStats.length);
    }
  });

  it("offer exploration options at a switch", () => {
    const reply = instanceFromSchema(turnFor(["player1"]), undefined, { request: turnRequest("SWITCH CONFIGURATION") }) as Turn;
    expect(reply.player1.options.map((o) => o.optionType)).toEqual(["exploration", "exploration", "exploration"]);
  });

  it("move one or two of the request's number stats every turn but the story's first", () => {
    const later = instanceFromSchema(turnFor(["player1"]), undefined, { request: turnRequest("THREAD CONFIGURATION") }) as Turn;
    expect(later.statChanges.length).toBeGreaterThanOrEqual(1);
    expect(later.statChanges.length).toBeLessThanOrEqual(2);
    for (const change of later.statChanges) {
      expect(["shared_calm", "player_nerve", "player_coins"]).toContain(change.stat);
      expect(change.group).toBe(change.stat.startsWith("shared") ? "shared" : "player1");
      expect(["addNumber", "subtractNumber"]).toContain(change.change);
      expect(CHANGE_STEPS).toContain(change.value);
    }
    const first = instanceFromSchema(turnFor(["player1"]), undefined, { request: turnRequest("SWITCH CONFIGURATION", "This is the first beat of the story.") }) as Turn;
    expect(first.statChanges).toEqual([]);
    // Nothing to move where the request lists no stats
    expect((instanceFromSchema(turnFor(["player1"])) as Turn).statChanges).toEqual([]);
  });

  it("give every seat of a group challenges of its own, and its player stat changes and bonuses to the story's own seats", () => {
    const seats = ["player1", "player2", "player3"];
    for (let seed = 1; seed <= 20; seed++) {
      const reply = instanceFromSchema(turnFor(seats), undefined, { seed, request: turnRequest("THREAD CONFIGURATION") }) as Turn;
      expect(reply.statChanges.length).toBeGreaterThanOrEqual(1);
      for (const change of reply.statChanges) {
        if (change.stat.startsWith("shared")) expect(change.group).toBe("shared");
        else expect(seats).toContain(change.group);
      }
      for (const seat of seats) {
        // The later seats' beats come through the schema's definitions, as the first's inline
        const options = reply[seat].options;
        expect(options.map((o) => o.optionType)).toEqual(["challenge", "challenge", "challenge"]);
        expect(new Set(options.map((o) => o.riskType))).toEqual(new Set(RISKS));
        for (const option of options) expect(option.text).toContain("(placeholder ");
        for (const bonus of options.flatMap((o) => o.modifiersToSuccessRate ?? [])) {
          expect(["shared_calm", `${seat}_nerve`, `${seat}_coins`]).toContain(bonus.statId);
        }
      }
      // Each seat's options start at a different risk
      expect(new Set(seats.map((seat) => reply[seat].options[0].riskType)).size).toBe(seats.length);
    }
    const atSwitch = instanceFromSchema(turnFor(seats), undefined, { request: turnRequest("SWITCH CONFIGURATION") }) as Turn;
    for (const seat of seats) expect(atSwitch[seat].options.every((o) => o.optionType === "exploration")).toBe(true);
  });

  it("title the ending's beats as the beat schema asks", () => {
    expect((instanceFromSchema(turnFor(["player1"]), undefined, { request: turnRequest("ENDING") }) as Turn).player1.title).toBe("The End");
    expect((instanceFromSchema(turnFor(["player1"]), undefined, { request: turnRequest("THREAD CONFIGURATION") }) as Turn).player1.title).not.toBe("The End");
  });
});

describe("the fake model's stats", () => {
  it("start at different values, never at zero", () => {
    const reply = instanceFromSchema(setupStats) as { sharedStats: { initialValue: number }[]; initialPlayerStatValues: { value: number }[] };
    const values = [...reply.sharedStats.map((s) => s.initialValue), ...reply.initialPlayerStatValues.map((s) => s.value)];
    for (const value of values) expect(START_VALUES).toContain(value);
    const across = [1, 2, 3, 4, 5].flatMap((seed) => (instanceFromSchema(setupStats, undefined, { seed }) as { sharedStats: { initialValue: number }[] }).sharedStats.map((s) => s.initialValue));
    expect(new Set(across).size).toBeGreaterThan(1);
  });
});

describe("the fake model's seed", () => {
  const request = turnRequest("THREAD CONFIGURATION", "Current turn: 3/5");
  const reply = (seed: number, offset = 5000, at = request) => instanceFromSchema(turnFor(["player1"]), undefined, { seed, offset, request: at });
  /** What a choice's result and the stats depend on: each option's risk, points and bonuses, and the stat changes. */
  const outcomes = (value: unknown) => {
    const turn = value as Turn;
    return JSON.stringify({
      options: turn.player1.options.map((o) => [o.riskType, o.basePoints, (o.modifiersToSuccessRate ?? []).map((b) => [b.statId, b.effect])]),
      statChanges: turn.statChanges,
    });
  };

  it("gives the same reply to the same request", () => {
    expect(reply(7)).toEqual(reply(7));
    const a = seededRandom(3, 9);
    const b = seededRandom(3, 9);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    const c = seededRandom(3, "4|thread||");
    const d = seededRandom(3, "4|thread||");
    expect([c(), c()]).toEqual([d(), d()]);
  });

  it("gives one turn request the same risks, points, bonuses and stat changes at any sequence number, as pregeneration reorders requests", () => {
    // As the server sends it: the request's text and its schema
    const body = {
      model: "gpt-fake",
      messages: [
        { role: "system", content: "You write the next beats of a story." },
        { role: "user", content: `======= YOUR JOB: GENERATE THE NEXT SET OF STORY BEATS TO IMPLEMENT THE THREAD CONFIGURATION =======\n${STATS_SECTION}\n======= STORY PROGRESS =======\n\nCurrent turn: 3/5\n` },
      ],
      response_format: { type: "json_schema", json_schema: { name: "extract", schema: turnFor(["player1"]) } },
    };
    const at = (sequence: number) => JSON.parse(String((chatCompletion(body, sequence) as { choices: { message: { content: string } }[] }).choices[0].message.content)) as Turn;
    const early = at(3);
    const late = at(41);
    expect(early.statChanges.length).toBeGreaterThan(0);
    expect(outcomes(late)).toBe(outcomes(early));
    // The ids and lines around them still follow the arrival order, so no two replies repeat one
    expect(late.player1.options.map((o) => o.text)).not.toEqual(early.player1.options.map((o) => o.text));
    // And so does a reply written straight from the schema
    expect(outcomes(reply(1, 3000))).toBe(outcomes(reply(1, 41000)));
  });

  it("varies the replies from seed to seed and turn to turn", () => {
    expect(new Set([1, 2, 3, 4, 5, 6].map((seed) => outcomes(reply(seed)))).size).toBeGreaterThan(1);
    const turns = [2, 3, 4, 5, 6].map((n) => outcomes(reply(1, 5000, turnRequest("THREAD CONFIGURATION", `Current turn: ${n}/7`))));
    expect(new Set(turns).size).toBeGreaterThan(1);
    const draws = seededRandom(1, 1);
    for (let i = 0; i < 100; i++) {
      const n = draws();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });
});
