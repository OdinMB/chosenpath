import { describe, expect, it } from "@jest/globals";
import { instanceFromSchema } from "../../../../harness/lib/fake-openai.mjs";

/*
 * How the harness's fake model fills a list of player seats
 * (harness/lib/fake-openai.mjs): every seat once per reply, as the switch
 * and thread planners must place each player in exactly one switch or
 * thread, and a group story's first thread must hold them all
 * (planChecks.ts). Pure schema instances; nothing is served.
 */

const seat = { type: "string", enum: ["player1", "player2", "player3"] };

/** A switch plan's shape (storyTextSteps.ts, switchStep) for a story with these seats. */
const switchPlanFor = (seats: string[]) => ({
  type: "object",
  properties: {
    switches: {
      type: "array",
      items: {
        type: "object",
        properties: { players: { type: "array", items: { type: "string", enum: seats } }, title: { type: "string" } },
        required: ["players", "title"],
      },
    },
  },
  required: ["switches"],
});
const switchPlan = switchPlanFor(seat.enum);

const threadPlan = {
  type: "object",
  properties: {
    threads: {
      type: "array",
      items: {
        type: "object",
        properties: { playersSideA: { type: "array", items: seat }, playersSideB: { type: "array", items: seat } },
        required: ["playersSideA", "playersSideB"],
      },
    },
  },
  required: ["threads"],
};

type Switches = { switches: { players: string[] }[] };
type Threads = { threads: { playersSideA: string[]; playersSideB: string[] }[] };

describe("the fake model's lists of player seats", () => {
  it("group every seat in a reply's first list, and leave the later ones empty", () => {
    const reply = instanceFromSchema(switchPlan) as Switches;
    expect(reply.switches.map((s) => s.players)).toEqual([["player1", "player2", "player3"], []]);
  });

  it("put each seat on one side of one thread only", () => {
    const reply = instanceFromSchema(threadPlan) as Threads;
    expect(reply.threads.map((t) => [t.playersSideA, t.playersSideB])).toEqual([
      [["player1", "player2", "player3"], []],
      [[], []],
    ]);
  });

  it("start again with every reply", () => {
    instanceFromSchema(switchPlan);
    expect((instanceFromSchema(switchPlan) as Switches).switches[0].players).toEqual(["player1", "player2", "player3"]);
  });

  it("hold one seat in a single player's story", () => {
    expect((instanceFromSchema(switchPlanFor(["player1"])) as Switches).switches.map((s) => s.players)).toEqual([["player1"], []]);
  });

  it("follow a $ref to the seats, and keep to a list's bounds", () => {
    const schema = {
      type: "object",
      definitions: { seat },
      properties: {
        first: { type: "array", maxItems: 2, items: { $ref: "#/definitions/seat" } },
        second: { type: "array", items: { $ref: "#/definitions/seat" } },
        third: { type: "array", minItems: 1, items: { $ref: "#/definitions/seat" } },
      },
      required: ["first", "second", "third"],
    };
    expect(instanceFromSchema(schema)).toEqual({ first: ["player1", "player2"], second: ["player3"], third: ["player1"] });
  });

  it("leave lists of anything else as before", () => {
    const schema = { type: "object", properties: { kinds: { type: "array", items: { type: "string", enum: ["topic", "flavor"] } } }, required: ["kinds"] };
    expect(instanceFromSchema(schema)).toEqual({ kinds: ["topic", "topic"] });
  });
});
