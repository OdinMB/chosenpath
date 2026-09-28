import { GameModes, type ResolutionType } from "core/types";
import {
  RESOLUTION_FIELDS,
  emptyResolutions,
  resolutionKindOf,
  resolutionKindsFor,
  withResolutionField,
  worldPlaysContests,
} from "../../../../src/resources/templates/utils/outcomeResolutions";

/*
 * The template editor's outcome resolutions, one set of fields per kind:
 * challenge (favorable, mixed, unfavorable), contest (side A wins, mixed,
 * side B wins) and exploration (three paths). Setup round 3's form writes
 * contested shared outcomes in every competitive and cooperative-competitive
 * template, so the editor must show and keep them (setup doc B1.11).
 */

const challenge: ResolutionType = { favorable: "Won", unfavorable: "Lost", mixed: "Half" };
const contest: ResolutionType = { sideAWins: "The enclave speaks", sideBWins: "The printers speak", mixed: "They share the seat" };
const exploration: ResolutionType = { resolution1: "Stays", resolution2: "Leaves", resolution3: "Wanders" };

describe("resolutionKindOf", () => {
  it("reads each kind from its fields", () => {
    expect(resolutionKindOf(challenge)).toBe("challenge");
    expect(resolutionKindOf(contest)).toBe("contest");
    expect(resolutionKindOf(exploration)).toBe("exploration");
  });

  it("reads a contest as a contest, not as a challenge missing two fields", () => {
    expect(resolutionKindOf({ sideAWins: "", sideBWins: "", mixed: "" })).toBe("contest");
  });
});

describe("emptyResolutions", () => {
  it.each(["challenge", "contest", "exploration"] as const)("%s: one empty field per resolution, of its own kind", (kind) => {
    const empty = emptyResolutions(kind);
    expect(Object.keys(empty).sort()).toEqual(RESOLUTION_FIELDS[kind].map((f) => f.field).sort());
    expect(Object.values(empty)).toEqual(["", "", ""]);
    expect(resolutionKindOf(empty)).toBe(kind);
  });
});

describe("RESOLUTION_FIELDS", () => {
  it("labels a contest's sides by who holds them", () => {
    expect(RESOLUTION_FIELDS.contest.map((f) => f.field)).toEqual(["sideAWins", "mixed", "sideBWins"]);
    expect(RESOLUTION_FIELDS.contest[0].label).toBe("Side A wins");
    expect(RESOLUTION_FIELDS.contest[0].placeholder).toContain("player1");
    expect(RESOLUTION_FIELDS.contest[2].label).toBe("Side B wins");
  });

  it("keeps the challenge and exploration fields in the editor's order", () => {
    expect(RESOLUTION_FIELDS.challenge.map((f) => f.field)).toEqual(["favorable", "unfavorable", "mixed"]);
    expect(RESOLUTION_FIELDS.exploration.map((f) => f.field)).toEqual(["resolution1", "resolution2", "resolution3"]);
  });
});

describe("withResolutionField", () => {
  it("writes a contest's fields, which the editor used to drop", () => {
    expect(withResolutionField(contest, "sideAWins", "The enclave wins the seat")).toEqual({ ...contest, sideAWins: "The enclave wins the seat" });
    expect(withResolutionField(contest, "mixed", "A split council")).toEqual({ ...contest, mixed: "A split council" });
  });

  it("writes challenge and exploration fields as before", () => {
    expect(withResolutionField(challenge, "unfavorable", "Ruin")).toEqual({ ...challenge, unfavorable: "Ruin" });
    expect(withResolutionField(exploration, "resolution3", "Returns")).toEqual({ ...exploration, resolution3: "Returns" });
  });

  it("ignores a field of another kind, leaving the resolutions as they were", () => {
    expect(withResolutionField(challenge, "sideAWins", "x")).toEqual(challenge);
    expect(withResolutionField(contest, "favorable", "x")).toEqual(contest);
  });

  it("returns a new object", () => {
    expect(withResolutionField(contest, "sideBWins", "y")).not.toBe(contest);
  });
});

describe("resolutionKindsFor", () => {
  it("offers contests where they are offered (a shared outcome in a World that plays contests)", () => {
    expect(resolutionKindsFor(true, challenge)).toEqual(["challenge", "contest", "exploration"]);
  });

  it("offers challenge and exploration elsewhere, and keeps a contest the outcome already holds selectable", () => {
    expect(resolutionKindsFor(false, challenge)).toEqual(["challenge", "exploration"]);
    expect(resolutionKindsFor(false, contest)).toEqual(["challenge", "contest", "exploration"]);
  });
});

describe("worldPlaysContests", () => {
  it("is true for competitive and cooperative-competitive Worlds with two or more players", () => {
    expect(worldPlaysContests(GameModes.Competitive, 2)).toBe(true);
    expect(worldPlaysContests(GameModes.CooperativeCompetitive, 3)).toBe(true);
  });

  it("is false for cooperative and single-player Worlds, and for a World of one player in any mode", () => {
    expect(worldPlaysContests(GameModes.Cooperative, 3)).toBe(false);
    expect(worldPlaysContests(GameModes.SinglePlayer, 1)).toBe(false);
    expect(worldPlaysContests(GameModes.Competitive, 1)).toBe(false);
    expect(worldPlaysContests(undefined, 2)).toBe(false);
  });
});
