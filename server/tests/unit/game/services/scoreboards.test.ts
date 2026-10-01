import type { Story } from "core/models/Story.js";
import type { Stat, StoryState } from "core/types/index.js";
import { GameModes } from "core/types/index.js";
import { campOf, campsFromSeatRoles, campsOfSetup, scoreboardOf, scoreboardsOf } from "../../../../src/game/services/scoreboards.js";
import { laterSwitchBeat, slotsOf } from "../../../helpers/promptStories.js";
import { outcome, stat, switchAnalysis, threadAnalysis } from "../../../helpers/textFixtures.js";

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

/*
 * Which camp a seat plays for on a contest's scoreboard (the review of decision A's fixes, 2026-10-01). The plan check
 * stores a contest it made one side's challenge by that side's camp (PL-12's favorableSide); with three players and
 * player1 elsewhere it took the side the planner wrote, which nothing checks, so a lone player written on the wrong side
 * would have turned a correct move around. Setup round 3's form names each seat's camp in its seat roles, which the game
 * dropped with the rest of the plan; it keeps them now (StoryState.camps).
 */
describe("campsFromSeatRoles: the camps a setup's seat roles name", () => {
  const SPACE_PIRATES_3 = [
    "player1: the Comet's route-reader and negotiator (side A)",
    "player2: the Comet's engineer and salvage specialist (side B)",
    "player3: the Comet's scout and boarding lead (side B)",
  ];

  it("reads each seat's camp from its line: round 3's '(side B)' and round 2's 'side B's claimant'", () => {
    expect(campsFromSeatRoles(SPACE_PIRATES_3, 3)).toEqual({ player1: "sideA", player2: "sideB", player3: "sideB" });
    const round2 = [
      "player1: the ship's captain and side A's sole claimant, who wants the Gloam Cache's captain's share.",
      "player2: the ship's quartermaster and side B's claimant, who wants the share redistributed to the crew.",
      "player3: the ship's scout and side B's claimant, who wants a crew-owned freeport berth.",
    ];
    expect(campsFromSeatRoles(round2, 3)).toEqual({ player1: "sideA", player2: "sideB", player3: "sideB" });
    // A line without its seat's name is that seat by its place, as the form orders them
    expect(campsFromSeatRoles(["the organizer (side A)", "the treasurer (side A)", "the rival (side B)"], 3)).toEqual({ player1: "sideA", player2: "sideA", player3: "sideB" });
  });

  it("records none unless every seat names exactly one camp, player1's is side A and side B holds a seat", () => {
    const lines = (...camps: string[]) => camps.map((camp, i) => `player${i + 1}: a role${camp}`);
    expect(campsFromSeatRoles(lines(" (side A)", " (side B)"), 3)).toBeUndefined();
    expect(campsFromSeatRoles(lines(" (side A)", "", " (side B)"), 3)).toBeUndefined();
    expect(campsFromSeatRoles(lines(" (side A)", ", side A against side B", " (side B)"), 3)).toBeUndefined();
    expect(campsFromSeatRoles(lines(" (side B)", " (side A)", " (side A)"), 3)).toBeUndefined();
    expect(campsFromSeatRoles(lines(" (side A)", " (side A)", " (side A)"), 3)).toBeUndefined();
    expect(campsFromSeatRoles(["player1: x (side A)", "player1: y (side B)", "player3: z (side B)"], 3)).toBeUndefined();
    expect(campsFromSeatRoles("player1: the organizer (side A)", 3)).toBeUndefined();
    // "a side bet" names no side
    expect(campsFromSeatRoles(lines(" (side A)", " who keeps a side bet (side B)", " (side B)"), 3)).toEqual({ player1: "sideA", player2: "sideB", player3: "sideB" });
    // Two players' camps are their seats (campOf), so a two-player setup records none
    expect(campsFromSeatRoles(lines(" (side A)", " (side B)"), 2)).toBeUndefined();
  });

  it("reads them from a setup reply as the game assembles it (its plan's multiplayerCoordination)", () => {
    expect(campsOfSetup({ characterSelectionPlan: { multiplayerCoordination: SPACE_PIRATES_3 } }, 3)).toEqual({ player1: "sideA", player2: "sideB", player3: "sideB" });
    expect(campsOfSetup({ characterSelectionPlan: { multiplayerCoordination: [] } }, 3)).toBeUndefined();
    expect(campsOfSetup({}, 3)).toBeUndefined();
  });
});

describe("campOf: the camp a seat plays for", () => {
  const three = (extra: Partial<StoryState> = {}) => laterSwitchBeat(3).clone({ gameMode: GameModes.CooperativeCompetitive, ...extra });
  const withContests = (...contests: [string[], string[]][]) =>
    three({ storyPhases: [switchAnalysis(slotsOf(3), 0), ...contests.map(([sideA, sideB], i) => threadAnalysis("contest", 2, 1 + 2 * i, sideA, sideB)), switchAnalysis(slotsOf(3), 1 + 2 * contests.length)] });

  it("is side A for player1, and side B for player2 in a two-player game", () => {
    expect(campOf(three(), "player1")).toBe("sideA");
    expect(campOf(laterSwitchBeat(2).clone({ gameMode: GameModes.Competitive }), "player2")).toBe("sideB");
  });

  it("reads the camp the setup recorded, before anything the story played", () => {
    const recorded = withContests([["player1", "player3"], ["player2"]]).clone({ camps: { player1: "sideA", player2: "sideA", player3: "sideB" } });
    expect(["player2", "player3"].map((slot) => campOf(recorded, slot))).toEqual(["sideA", "sideB"]);
  });

  it("else takes the side a seat played on beside or against player1 in the story's earlier contests", () => {
    expect(["player2", "player3"].map((slot) => campOf(withContests([["player1", "player3"], ["player2"]]), slot))).toEqual(["sideB", "sideA"]);
    // A contest player1 sits out says nothing about either camp, and contests that disagree say nothing
    expect(campOf(withContests([["player2"], ["player3"]]), "player2")).toBeUndefined();
    expect(campOf(withContests([["player1", "player2"], ["player3"]], [["player1"], ["player2", "player3"]]), "player2")).toBeUndefined();
    expect(campOf(withContests([["player1", "player2"], ["player3"]], [["player1"], ["player2", "player3"]]), "player3")).toBe("sideB");
  });

  it("says nothing where the setup recorded none and no earlier contest had the seat beside or against player1", () => {
    expect(campOf(three(), "player3")).toBeUndefined();
  });
});
