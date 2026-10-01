import type { Story } from "core/models/Story.js";
import type { Stat } from "core/types/index.js";
import { GameModes } from "core/types/index.js";
import { scoreboardOf, scoreboardsOf } from "../../../../src/game/services/scoreboards.js";
import { laterSwitchBeat } from "../../../helpers/promptStories.js";
import { outcome, stat } from "../../../helpers/textFixtures.js";

/*
 * Which shared opposites stat a contested outcome's "Scored by …" names. Setup round 3's form asks for the stat's name;
 * the stored setups on that form wrote it 83 times, and 8 times otherwise: the stat's id or its id's words (the food
 * trucks' round 3 "Contract Race" for shared_contract_race, named "Innovator's Lead|Circuit Caterer's Lead"; the space
 * pirates' round 1 "Black Star Lead"; "shared_bounty_score"), a possessive left out ("Youssef's Courtship" for
 * shared_youssef_courtship), the name with " stat" after it. Production's repair read the name only, so it never saw those
 * boards (since 2026-10-01 it reads them all).
 */

const CONTESTED = { sideAWins: "A wins.", mixed: "Split.", sideBWins: "B wins." };

function contestStory(scoredBy: string, stats: Stat[]): Story {
  return laterSwitchBeat(2).clone({
    gameMode: GameModes.Competitive,
    sharedOutcomes: [outcome("shared_festival_contract", { possibleResolutions: CONTESTED, resonance: `Both owners need the contract. ${scoredBy}` })],
    sharedStats: stats,
    sharedStatValues: stats.map((s) => ({ statId: s.id, value: 50 })),
  });
}

const RACE = stat("shared_contract_race", { type: "opposites", name: "Innovator's Lead|Circuit Caterer's Lead" });
const CALM = stat("shared_calm", { type: "opposites", name: "Calm|Storm" });

describe("scoreboardOf: the stat a contested outcome's 'Scored by …' names", () => {
  it("reads the stat's name, as setup round 3's form asks (83 of 91 stored setups on that form)", () => {
    expect(scoreboardOf(contestStory("Scored by Innovator's Lead|Circuit Caterer's Lead.", [CALM, RACE]), "shared_festival_contract")?.id).toBe(RACE.id);
  });

  it("reads the stat's id's words: the food trucks' round 3, 'Scored by Contract Race' for shared_contract_race", () => {
    expect(scoreboardOf(contestStory("Scored by Contract Race.", [CALM, RACE]), "shared_festival_contract")?.id).toBe(RACE.id);
    // The space pirates' round 1: "Black Star Lead" for shared_black_star_lead, named "Captain's Camp|Quartermaster-Engineer's Camp"
    const camps = stat("shared_black_star_lead", { type: "opposites", name: "Captain's Camp|Quartermaster-Engineer's Camp" });
    expect(scoreboardOf(contestStory("Scored by Black Star Lead.", [camps]), "shared_festival_contract")?.id).toBe(camps.id);
  });

  it("reads the stat's id as written, case and punctuation aside", () => {
    expect(scoreboardOf(contestStory("Scored by shared_contract_race.", [CALM, RACE]), "shared_festival_contract")?.id).toBe(RACE.id);
    expect(scoreboardOf(contestStory("Scored by CONTRACT-RACE.", [CALM, RACE]), "shared_festival_contract")?.id).toBe(RACE.id);
  });

  it("reads a name with a possessive left out or ' stat' after it, and 'scored by' in a sentence of its own", () => {
    const courtship = stat("shared_youssef_courtship", { type: "opposites", name: "Fatima's Courtship|Layla's Courtship" });
    expect(scoreboardOf(contestStory("The rivalry is scored by Youssef's Courtship.", [courtship]), "shared_festival_contract")?.id).toBe(courtship.id);
    const partnership = stat("shared_youssef_partnership_score", { type: "opposites", name: "Youssef's Partnership|Friendship's Partnership" });
    expect(scoreboardOf(contestStory("Scored by Youssef's Partnership|Friendship's Partnership stat.", [partnership]), "shared_festival_contract")?.id).toBe(partnership.id);
  });

  it("names no board where nothing matches, or two stats would: never the story's only opposites stat by default, which an older setup used as a meter", () => {
    expect(scoreboardOf(contestStory("Scored by Spreebogen Flat Lead.", [CALM]), "shared_festival_contract")).toBeUndefined();
    expect(scoreboardOf(contestStory("Both owners want it.", [RACE]), "shared_festival_contract")).toBeUndefined();
    const twin = stat("contract_race", { type: "opposites", name: "Other|Side" });
    expect(scoreboardOf(contestStory("Scored by Contract Race.", [RACE, twin]), "shared_festival_contract")).toBeUndefined();
    // Not an opposites stat, or not a contested outcome
    const number = stat("shared_contract_race", { type: "number", name: "Contract Race" });
    expect(scoreboardOf(contestStory("Scored by Contract Race.", [number]), "shared_festival_contract")).toBeUndefined();
    const plain = contestStory("Scored by Contract Race.", [RACE]).clone({ sharedOutcomes: [outcome("shared_festival_contract", { resonance: "Scored by Contract Race." })] });
    expect(scoreboardOf(plain, "shared_festival_contract")).toBeUndefined();
  });

  it("lists every contest's board by its stat id (scoreboardsOf)", () => {
    expect([...scoreboardsOf(contestStory("Scored by Contract Race.", [CALM, RACE])).keys()]).toEqual([RACE.id]);
    expect(scoreboardsOf(contestStory("Both owners want it.", [CALM, RACE])).size).toBe(0);
  });
});
