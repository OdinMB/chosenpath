import { describe, expect, it, jest } from "@jest/globals";
import type { StoryState } from "core/types/index.js";
import { seatsWithSharedIdentityNames, withDistinctIdentityNames } from "../../../src/stories/setupIdentities.js";
import { createMockStoryState } from "../../helpers/testHelpers.js";
import { outcome } from "../../helpers/textFixtures.js";

/*
 * A setup whose seat offers three identities with one name gives the player no
 * choice of name (the review of the third playthroughs, 2026-10-01: New Avalon's
 * setup offered "Ari" three times, she, he and they; the setup's own rule says
 * three names unless the premise names the character). The game asks for the
 * setup once more, a fresh sample of the same request, and never fails a story
 * over names.
 */

const PRONOUNS = { personal: "they", object: "them", possessive: "their", reflexive: "themselves" };

function withNames(bySeat: Record<string, string[]>): StoryState {
  const base = createMockStoryState({ sharedOutcomes: [outcome("shared_letter_found")] });
  const options = Object.fromEntries(
    Object.entries(bySeat).map(([slot, names]) => [
      slot,
      { outcomes: [], possibleCharacterIdentities: names.map((name) => ({ name, pronouns: PRONOUNS, appearance: "tall" })), possibleCharacterBackgrounds: [] },
    ])
  );
  return { ...base, characterSelectionOptions: options as StoryState["characterSelectionOptions"] };
}

const PREMISE = "A courier crosses a drowned city.";

describe("seatsWithSharedIdentityNames", () => {
  it("names each seat whose identities share the name they are called by", () => {
    expect(seatsWithSharedIdentityNames(withNames({ player1: ["Ari", "Ari", "Ari"] }), PREMISE)).toEqual(["player1"]);
    expect(seatsWithSharedIdentityNames(withNames({ player1: ["Dr. Alex Chen", "Alex Rivera", "Mia Stone"] }), PREMISE)).toEqual(["player1"]);
    expect(seatsWithSharedIdentityNames(withNames({ player1: ["Ari Vale", "Nia Calder", "Tavi Sen"], player2: ["Dora Fenn", "Dora Fenn", "Emil Rast"] }), PREMISE)).toEqual(["player2"]);
  });

  it("names none where the names differ, or where the premise gives the character the shared name (a role is never one)", () => {
    expect(seatsWithSharedIdentityNames(withNames({ player1: ["Ari Vale", "Nia Calder", "Tavi Sen"] }), PREMISE)).toEqual([]);
    expect(seatsWithSharedIdentityNames(withNames({ player1: ["Susan", "Susan", "Susan"] }), "Susan's Magical Night: her stuffed animals come alive.")).toEqual([]);
    expect(seatsWithSharedIdentityNames(withNames({ player1: ["The Detective", "The Detective", "The Detective"] }), "A Neo-Tokyo Detective Story.")).toEqual(["player1"]);
  });
});

describe("withDistinctIdentityNames", () => {
  const clash = withNames({ player1: ["Ari", "Ari", "Ari"] });
  const distinct = withNames({ player1: ["Ari Vale", "Nia Calder", "Tavi Sen"] });

  it("keeps a setup whose names differ, and asks for nothing more", async () => {
    const again = jest.fn(async () => distinct);
    expect(await withDistinctIdentityNames(distinct, again, PREMISE, 1, () => undefined)).toBe(distinct);
    expect(again).not.toHaveBeenCalled();
  });

  it("asks once more where a seat's names clash, and takes the second setup when its names differ and it can start; the log names the seats, never a name", async () => {
    const lines: string[] = [];
    const again = jest.fn(async () => distinct);
    expect(await withDistinctIdentityNames(clash, again, PREMISE, 1, (line) => lines.push(line))).toBe(distinct);
    expect(again).toHaveBeenCalledTimes(1);
    expect(lines.join("\n")).toContain("player1");
    expect(lines.join("\n")).not.toMatch(/Ari|Nia/);
  });

  it("keeps the first setup where the second clashes too, can't start or fails: never a failed story over names", async () => {
    const lines: string[] = [];
    expect(await withDistinctIdentityNames(clash, async () => withNames({ player1: ["Nia", "Nia", "Ari"] }), PREMISE, 1, (line) => lines.push(line))).toBe(clash);
    const unstartable = { ...distinct, sharedOutcomes: [] };
    expect(await withDistinctIdentityNames(clash, async () => unstartable, PREMISE, 1, (line) => lines.push(line))).toBe(clash);
    expect(
      await withDistinctIdentityNames(
        clash,
        async () => {
          throw new TypeError("the model wrote Ari again");
        },
        PREMISE,
        1,
        (line) => lines.push(line)
      )
    ).toBe(clash);
    expect(lines.some((line) => line.includes("TypeError"))).toBe(true);
    expect(lines.join("\n")).not.toContain("the model wrote");
  });
});
