import type { ClientStat } from "core/types";
import {
  STORY_END_EXITS,
  endStatGroups,
  plainStatValue,
} from "../../../../src/game/utils/storyEnd";
import { clientStoryState, player } from "../../../helpers/storyFixtures";

function stat(
  id: string,
  type: ClientStat["type"],
  overrides: Partial<ClientStat> = {}
): ClientStat {
  return {
    id,
    type,
    name: id,
    isVisible: true,
    partOfPlayerBackgrounds: false,
    initialValue: "",
    tooltip: "",
    group: "",
    ...overrides,
  };
}

describe("plainStatValue", () => {
  it("writes a percentage with its sign", () => {
    expect(plainStatValue(stat("energy", "percentage"), 62)).toBe("62%");
    expect(plainStatValue(stat("energy", "percentage"), 33.333)).toBe("33.3%");
    expect(plainStatValue(stat("energy", "percentage"), "62")).toBe("62%");
  });

  it("writes both sides of an opposites stat, each with its share", () => {
    const balance = stat("balance", "opposites", { name: "Order | Chaos" });

    expect(plainStatValue(balance, 62)).toBe("62% Order, 38% Chaos");
    expect(plainStatValue(balance, 37.5)).toBe("37.5% Order, 62.5% Chaos");
  });

  it("writes a number as it is", () => {
    expect(plainStatValue(stat("coins", "number"), 12)).toBe("12");
  });

  it("writes a text as it is, and None for an empty one", () => {
    expect(plainStatValue(stat("rank", "string"), "Known Hand")).toBe(
      "Known Hand"
    );
    expect(plainStatValue(stat("rank", "string"), "  ")).toBe("None");
  });

  it("lists a list's items, and None for an empty list", () => {
    expect(
      plainStatValue(stat("contacts", "string[]"), ["Ivo Senn", "Mara"])
    ).toBe("Ivo Senn, Mara");
    expect(plainStatValue(stat("contacts", "string[]"), [])).toBe("None");
  });
});

describe("endStatGroups", () => {
  const playerStats = [
    stat("player_energy", "percentage", { name: "Energy", group: "Body" }),
    stat("player_secret", "string", { name: "Secret", isVisible: false }),
    stat("player_rank", "string", { name: "Rank", group: "Standing" }),
    stat("player_luck", "number", { name: "Luck", group: "Body" }),
  ];
  const sharedStats = [
    stat("shared_lamps", "number", { name: "Lamps lit", group: "Harbour" }),
    stat("shared_tide", "opposites", { name: "Calm|Storm" }),
  ];

  function groupsOf(
    statValues = [
      { statId: "player_energy", value: 40 },
      { statId: "player_secret", value: "The keeper" },
      { statId: "player_rank", value: "Known Hand" },
      { statId: "player_luck", value: 3 },
    ],
    sharedStatValues = [
      { statId: "shared_lamps", value: 2 },
      { statId: "shared_tide", value: 70 },
    ]
  ) {
    return endStatGroups(
      clientStoryState({
        playerStats,
        sharedStats,
        sharedStatValues,
        players: { player1: { ...player(), statValues } },
      })
    );
  }

  it("groups the player's stats, then the shared ones, as the sidebar does, with their values at the end", () => {
    expect(groupsOf()).toEqual([
      {
        group: "Body",
        stats: [
          { id: "player_energy", name: "Energy", value: "40%" },
          { id: "player_luck", name: "Luck", value: "3" },
        ],
      },
      {
        group: "Standing",
        stats: [{ id: "player_rank", name: "Rank", value: "Known Hand" }],
      },
      {
        group: "Harbour",
        stats: [{ id: "shared_lamps", name: "Lamps lit", value: "2" }],
      },
      {
        group: "Other",
        stats: [
          { id: "shared_tide", name: "Calm / Storm", value: "70% Calm, 30% Storm" },
        ],
      },
    ]);
  });

  it("leaves out hidden stats", () => {
    const ids = groupsOf().flatMap((group) => group.stats.map((s) => s.id));

    expect(ids).not.toContain("player_secret");
  });

  it("leaves out a stat without a value rather than guess one", () => {
    const groups = groupsOf([{ statId: "player_energy", value: 40 }], []);

    expect(groups).toEqual([
      {
        group: "Body",
        stats: [{ id: "player_energy", name: "Energy", value: "40%" }],
      },
    ]);
  });

  it("is empty for a story without visible stats", () => {
    expect(endStatGroups(clientStoryState())).toEqual([]);
  });
});

describe("STORY_END_EXITS", () => {
  it("leads to the account's stories and to the home page", () => {
    expect(STORY_END_EXITS).toEqual({ myStories: "/users/my-stories", home: "/" });
  });
});
