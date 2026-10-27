import type { Beat, BeatOption, ClientStat, PaidLever } from "core/types";
import { storyPath } from "../../../../src/game/utils/storyPath";
import { beat } from "../../../helpers/storyFixtures";

const explore = (text: string): BeatOption => ({
  optionType: "exploration",
  resourceType: "normal",
  text,
});

const challenge = (
  text: string,
  riskType: "safe" | "normal" | "risky" = "normal",
  resourceType: "normal" | "sacrifice" | "reward" = "normal"
): BeatOption => ({
  optionType: "challenge",
  resourceType,
  text,
  riskType,
  basePoints: 0,
  modifiersToSuccessRate: [],
});

/** A beat offering `options`, on which the player chose `choice` (-1: not yet). */
function turn(
  title: string,
  options: BeatOption[],
  choice: number,
  extra: Partial<Beat> = {}
): Beat {
  return { ...beat(title, choice), options, ...extra };
}

type Stat = Pick<ClientStat, "id" | "name" | "type">;
const stats = (
  playerStats: Stat[] = [],
  sharedStats: Stat[] = []
): { playerStats: Stat[]; sharedStats: Stat[] } => ({ playerStats, sharedStats });

const paid = (lever: Partial<PaidLever>): Partial<Beat> => ({
  paidLever: { kind: "sacrifice", group: "player1", stat: "gold", step: -15, ...lever },
});

const ending = beat("The End", -1);

describe("storyPath", () => {
  it("lists every turn the player chose on, in order, numbered from the story's first beat; the ending adds none", () => {
    const beats = [
      turn("Arrival", [explore("Take the ferry"), explore("Walk the cliff path")], 1),
      turn("The Night Market (1/2)", [challenge("Haggle"), challenge("Slip past")], 0),
      ending,
    ];

    expect(storyPath(beats, stats())).toEqual([
      { turn: 1, beatTitle: "Arrival", choice: "Walk the cliff path", kind: "exploration" },
      { turn: 2, beatTitle: "The Night Market (1/2)", choice: "Haggle", kind: "challenge", risk: "normal" },
    ]);
  });

  it("gives a challenge its roll's result and the risk the player took", () => {
    const beats = (["favorable", "mixed", "unfavorable"] as const).map((resolution, i) =>
      turn(`Step ${i + 1}`, [challenge("Climb", "risky"), challenge("Wait", "safe")], i % 2, { resolution })
    );

    expect(storyPath(beats, stats()).map(({ result, risk }) => ({ result, risk }))).toEqual([
      { result: "favorable", risk: "risky" },
      { result: "mixed", risk: "safe" },
      { result: "unfavorable", risk: "risky" },
    ]);
  });

  it("gives an exploration no result and no risk: it picks a direction, with no roll", () => {
    const beats = [turn("Crossroads", [explore("North"), explore("South")], 1, { resolution: "resolution2" })];

    const [step] = storyPath(beats, stats());

    expect(step).toEqual({ turn: 1, beatTitle: "Crossroads", choice: "South", kind: "exploration" });
  });

  it("leaves out a challenge's result that is not a roll's", () => {
    const beats = [
      turn("Unrolled", [challenge("Push")], 0, { resolution: null }),
      turn("Odd", [challenge("Pull")], 0, { resolution: "sideAWins" }),
    ];

    expect(storyPath(beats, stats()).map((step) => step.result)).toEqual([undefined, undefined]);
  });

  it("skips a turn whose recorded choice names no option, and keeps the others' numbers", () => {
    const beats = [
      turn("Broken", [explore("Only")], 3),
      turn("Fine", [explore("Left"), explore("Right")], 0),
      ending,
    ];

    expect(storyPath(beats, stats()).map((step) => step.turn)).toEqual([2]);
  });

  describe("the sacrifice or reward a choice cost or gained, which the next turn's beat records", () => {
    const gold: Stat = { id: "gold", name: "Gold", type: "number" };
    const health: Stat = { id: "health", name: "Health", type: "percentage" };
    const rank: Stat = { id: "rank", name: "Rank", type: "string" };
    const contacts: Stat = { id: "contacts", name: "Contacts", type: "string[]" };
    const order: Stat = { id: "order", name: "Order|Chaos", type: "opposites" };
    const morale: Stat = { id: "gold", name: "Crew Morale", type: "number" };

    /** The lever the first turn's choice paid, as the step after it records it. */
    function leverFor(lever: Partial<PaidLever>, playerStats: Stat[], sharedStats: Stat[] = []) {
      const beats = [
        turn("Bargain", [challenge("Pay the guard", "safe", lever.kind ?? "sacrifice")], 0, { resolution: "favorable" }),
        { ...ending, ...paid(lever) },
      ];
      return storyPath(beats, stats(playerStats, sharedStats))[0]?.lever;
    }

    it("names the stat and its change, signed, where the stat is a number or a percentage", () => {
      expect(leverFor({ stat: "gold", step: -15 }, [gold])).toEqual({ kind: "sacrifice", stat: "Gold", change: "-15" });
      expect(leverFor({ kind: "reward", stat: "health", step: 10 }, [health])).toEqual({
        kind: "reward",
        stat: "Health",
        change: "+10",
      });
    });

    it("names only the stat where its change is a rung or a list item", () => {
      expect(leverFor({ kind: "reward", stat: "rank", step: 1 }, [rank])).toEqual({ kind: "reward", stat: "Rank" });
      expect(leverFor({ stat: "contacts", step: -1 }, [contacts])).toEqual({ kind: "sacrifice", stat: "Contacts" });
    });

    it("names an opposites stat by both its sides", () => {
      expect(leverFor({ stat: "order", step: -10 }, [order])).toEqual({ kind: "sacrifice", stat: "Order / Chaos" });
    });

    it("reads a shared stat among the shared stats and a seat's among the player stats", () => {
      expect(leverFor({ group: "shared", stat: "gold" }, [gold], [morale])?.stat).toBe("Crew Morale");
      expect(leverFor({ group: "player1", stat: "gold" }, [gold], [morale])?.stat).toBe("Gold");
    });

    it("shows nothing for a stat the player can't see", () => {
      expect(leverFor({ stat: "secret_debt" }, [gold])).toBeUndefined();
    });

    it("shows nothing where the next turn records none", () => {
      const beats = [turn("Bargain", [challenge("Pay the guard", "safe", "sacrifice")], 0), ending];

      expect(storyPath(beats, stats([gold]))[0]?.lever).toBeUndefined();
    });
  });
});
