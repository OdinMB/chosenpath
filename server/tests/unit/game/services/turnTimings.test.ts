import {
  createTurnTimings,
  type TurnTimingRecord,
} from "../../../../src/game/services/turnTimings.js";

function setup(maxStories?: number) {
  let t = 0;
  const records: TurnTimingRecord[] = [];
  const timings = createTurnTimings(() => t, (r) => records.push(r), maxStories);
  return {
    timings,
    records,
    at: (seconds: number) => {
      t = seconds * 1000;
    },
  };
}

describe("turnTimings", () => {
  it("measures the wait from the last choice to the next turn's delivery", () => {
    const { timings, records, at } = setup();
    at(0);
    timings.noteBroadcast("s1", 1, 1);
    at(40);
    timings.noteChoice("s1", 1, "player1", "none", false);
    at(45);
    timings.noteBroadcast("s1", 1, 1); // the choice's own broadcast: same turn
    at(58);
    timings.noteBroadcast("s1", 2, 1);
    const delivered = records.filter((r) => r.event === "delivered");
    expect(delivered).toHaveLength(2);
    expect(delivered[1]).toMatchObject({ turn: 2, waitSeconds: 18 });
  });

  it("counts reading time only for a choice on the delivered turn", () => {
    const { timings, records, at } = setup();
    at(10);
    timings.noteBroadcast("s1", 3, 2);
    at(35);
    timings.noteChoice("s1", 3, "player1", "complete", false);
    timings.noteChoice("s1", 2, "player2", "none", false);
    const choices = records.filter((r) => r.event === "choice");
    expect(choices[0]).toMatchObject({ readingSeconds: 25 });
    expect(choices[1]).toMatchObject({ readingSeconds: undefined });
  });

  it("flags a duplicate when the pregeneration is incomplete and still running", () => {
    const { timings, records } = setup();
    timings.noteChoice("s1", 1, "player1", "partial", true);
    timings.noteChoice("s1", 1, "player1", "complete", true);
    timings.noteChoice("s1", 1, "player1", "none", false);
    expect(
      records.map((r) => (r.event === "choice" ? r.duplicate : undefined))
    ).toEqual([true, false, false]);
  });

  it("forgets the least recently seen story beyond the cap", () => {
    const { timings, records, at } = setup(2);
    at(0);
    timings.noteBroadcast("a", 1, 1);
    timings.noteBroadcast("b", 1, 1);
    timings.noteBroadcast("a", 1, 1); // touches a
    timings.noteBroadcast("c", 1, 1); // evicts b
    timings.noteBroadcast("a", 1, 1); // a was kept: not delivered again
    timings.noteBroadcast("b", 1, 1); // b is new again, so turn 1 is delivered again
    const deliveredTo = records.filter((r) => r.event === "delivered").map((r) => r.storyId);
    expect(deliveredTo).toEqual(["a", "b", "c", "b"]);
  });

  it("logs only ids, turns, slots, numbers and flags", () => {
    const { timings, records } = setup();
    timings.noteBroadcast("s1", 1, 1);
    timings.noteChoice("s1", 1, "player1", "none", false);
    timings.notePregenerationFinished("s1", 1, "player1", 2, 31_400, true);
    const allowed = new Set([
      "event",
      "storyId",
      "turn",
      "players",
      "waitSeconds",
      "slot",
      "readingSeconds",
      "pregen",
      "duplicate",
      "option",
      "seconds",
      "ok",
    ]);
    for (const record of records) {
      for (const key of Object.keys(record)) {
        expect(allowed.has(key)).toBe(true);
      }
    }
    expect(records[2]).toMatchObject({ event: "pregeneration", seconds: 31.4, ok: true });
  });
});
