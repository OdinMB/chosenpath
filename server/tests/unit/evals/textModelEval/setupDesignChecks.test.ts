import { GameModes, type GameMode, type PlayerCount } from "core/types/index.js";
import {
  checkSetupDesign,
  exampleBlock,
  milestoneBudget,
} from "../../../../src/evals/textModelEval/setupDesignChecks.js";
import type { SetupInput } from "../../../../src/evals/textModelEval/variants.js";

type Loose = Record<string, unknown>;

const challenge = { favorable: "It stands.", mixed: "Half of it stands.", unfavorable: "It falls." };
const contest = { sideAWins: "The first wins.", mixed: "A draw.", sideBWins: "The second wins." };
const paths = { resolution1: "Stays.", resolution2: "Leaves.", resolution3: "Founds a guild." };

function outcome(id: string, question: string, milestones: number, resolutions: Loose = challenge, extra: Loose = {}): Loose {
  return { id, question, possibleResolutions: resolutions, resonance: "It matters.", intendedNumberOfMilestones: milestones, milestones: [], ...extra };
}

function stat(name: string, extra: Loose = {}): Loose {
  return {
    type: "percentage",
    name,
    id: `shared_${name.toLowerCase().replace(/\W+/g, "_")}`,
    possibleValues: "",
    effectOnPoints: ["Above 70%: +10 in social challenges", "Below 30%: -10 in every challenge"],
    optionsToSacrifice: "Spend 10% to push through.",
    optionsToGainAsReward: "Regain 10% by resting.",
    narrativeImplications: ["Below 20%: the next switch forces a thread about finding food."],
    adjustmentsAfterThreads: ["+10% after a favorable harbour chase."],
    isVisible: true,
    tooltip: "How much the crew has left.",
    ...extra,
  };
}

function player(names: string[], outcomes: Loose[]): Loose {
  return {
    outcomes,
    possibleCharacterIdentities: names.map((name) => ({ name, pronouns: {}, appearance: "tall" })),
    possibleCharacterBackgrounds: [],
  };
}

/** A single-player setup that passes every check at 25 turns (M = 6). */
function soloSetup(overrides: Loose = {}): Loose {
  return {
    guidelines: {
      world: "A harbour town.",
      typesOfThreads: [
        "Harbour chase (challenge, 3): outrun the tide",
        "Tavern talk (exploration, 2): win a confidence",
        "Storm watch (challenge, 4): hold the sea wall",
      ],
      switchAndThreadInstructions: [
        "When Supplies falls below 30%, the next thread is about finding food.",
        "The first thread is about the missing ferry.",
        "Around turn 13 someone attacks the harbour.",
      ],
    },
    storyElements: [
      { id: "harbour", name: "Old Harbour", facts: ["Has a secret smuggling tunnel.", "Busy at dawn.", "Floods at spring tide."] },
      { id: "mira", name: "Mira Holt", facts: ["Pronouns: she/her.", "Owes the guild a debt.", "Runs the ferry."] },
    ],
    sharedOutcomes: [],
    sharedStats: [stat("Supplies")],
    playerStats: [stat("Courage", { id: "player_courage" })],
    player1: player(
      ["Ada Quill", "Bram Tover", "Cato Lune"],
      [
        outcome("player1_harbour", "Will the Old Harbour survive the storm season?", 3),
        outcome("player1_trust", "Can the sailor keep Mira Holt's trust?", 2),
        outcome("player1_path", "What will the sailor's life on the water look like?", 1, paths),
      ]
    ),
    ...overrides,
  };
}

const solo: SetupInput = { premise: "A sailor in a harbour town.", playerCount: 1, gameMode: GameModes.SinglePlayer, maxTurns: 25 };

function multi(players: PlayerCount, gameMode: GameMode, premise = "Rivals in a harbour town."): SetupInput {
  return { premise, playerCount: players, gameMode, maxTurns: 25 };
}

/** A two-player competitive setup that passes the multiplayer checks. */
function duelSetup(overrides: Loose = {}): Loose {
  return soloSetup({
    sharedOutcomes: [outcome("shared_regatta", "Who will win the harbour regatta?", 3, contest)],
    sharedStats: [stat("Supplies"), stat("Harbour Master's Voice|Guild's Voice", { type: "opposites", tooltip: "The score of the regatta: the harbour master holds the first side." })],
    player1: player(["Ada Quill", "Bram Tover", "Cato Lune"], [
      outcome("player1_trust", "Can the harbour master's aide keep Mira Holt's trust?", 2),
      outcome("player1_path", "What will the aide's life on the water look like?", 1, paths),
    ]),
    player2: player(["Dora Fenn", "Emil Rast", "Fay Orm"], [
      outcome("player2_guild", "Will the guild's pilot repay the old debt?", 2),
      outcome("player2_rival", "How will the pilot treat the losing crews?", 1, paths),
    ]),
    ...overrides,
  });
}

describe("milestoneBudget: M from the story length (setup doc A10)", () => {
  it("is 6 at 25 turns, 4 at 15, 3 at 10 or fewer and never more than 6", () => {
    expect([25, 15, 10, 8, 40].map(milestoneBudget)).toEqual([6, 4, 3, 3, 6]);
  });
});

describe("checkSetupDesign: outcomes (proposals 1, 6, 10)", () => {
  it("passes a single-player slate of three own outcomes on the budget, and reports no multiplayer check", () => {
    const { checks } = checkSetupDesign(soloSetup(), solo);
    expect(checks).toMatchObject({ singlePlayerOutcomes: true, personalFloor: true, milestoneBudget: true, questionFormMatches: true, noIdentityNamesInOutcomes: true });
    expect(checks).not.toHaveProperty("modeSlate");
    expect(checks).not.toHaveProperty("noMirroredOutcomes");
  });

  it("fails a single-player setup with shared outcomes or off the budget", () => {
    const shared = checkSetupDesign(soloSetup({ sharedOutcomes: [outcome("shared_town", "Will the town survive?", 2)] }), solo).checks;
    expect(shared).toMatchObject({ singlePlayerOutcomes: false, milestoneBudget: false });
    const short = checkSetupDesign(soloSetup(), { ...solo, maxTurns: 10 }).checks;
    expect(short).toMatchObject({ singlePlayerOutcomes: false, milestoneBudget: false });
  });

  it("reads the mode's slate: a contest in competitive games, a goal and no contest in cooperative ones, one or two shared", () => {
    expect(checkSetupDesign(duelSetup(), multi(2, GameModes.Competitive)).checks).toMatchObject({ modeSlate: true, milestoneBudget: true });
    expect(checkSetupDesign(duelSetup(), multi(2, GameModes.Cooperative)).checks.modeSlate).toBe(false);
    expect(checkSetupDesign(duelSetup(), multi(2, GameModes.CooperativeCompetitive)).checks.modeSlate).toBe(false);
    const both = duelSetup({ sharedOutcomes: [outcome("shared_regatta", "Who will win the regatta?", 2, contest), outcome("shared_wall", "Will the sea wall hold?", 2)] });
    expect(checkSetupDesign(both, multi(2, GameModes.CooperativeCompetitive)).checks.modeSlate).toBe(true);
    const none = duelSetup({ sharedOutcomes: [] });
    expect(checkSetupDesign(none, multi(2, GameModes.Competitive)).checks.modeSlate).toBe(false);
  });

  it("counts a three-player race written as three paths under Who as a contest", () => {
    const race = duelSetup({
      sharedOutcomes: [outcome("shared_flat", "Who will sign the lease on the flat?", 3, paths)],
      player3: player(["Gus Pell", "Hana Voss", "Ivo Kett"], [outcome("player3_home", "Will the archivist find a home?", 2)]),
    });
    expect(checkSetupDesign(race, multi(3, GameModes.Competitive)).checks.modeSlate).toBe(true);
  });

  it("holds each player to a personal floor of two milestones, one at M = 3", () => {
    const thin = duelSetup({ player2: player(["Dora Fenn", "Emil Rast", "Fay Orm"], [outcome("player2_guild", "Will the pilot repay the old debt?", 1)]) });
    expect(checkSetupDesign(thin, multi(2, GameModes.Competitive)).checks.personalFloor).toBe(false);
    expect(checkSetupDesign(thin, { ...multi(2, GameModes.Competitive), maxTurns: 10 }).checks.personalFloor).toBe(true);
    const bare = duelSetup({ player2: player(["Dora Fenn"], []) });
    expect(checkSetupDesign(bare, { ...multi(2, GameModes.Competitive), maxTurns: 10 }).checks.personalFloor).toBe(false);
  });

  it("finds mirrored personal outcomes, seat numbers and identity names removed", () => {
    const mirrored = duelSetup({
      player1: player(["Fatima Noor"], [outcome("player1_home", "Will Fatima Noor find a home in player 1's city?", 3)]),
      player2: player(["Layla Aziz"], [outcome("player2_home", "Will Layla Aziz find a home in Player 2's city?", 3)]),
    });
    expect(checkSetupDesign(mirrored, multi(2, GameModes.Competitive)).checks.noMirroredOutcomes).toBe(false);
    // Names the premise gives the players are still names to take out before comparing
    expect(checkSetupDesign(mirrored, multi(2, GameModes.Competitive, "Fatima Noor and Layla Aziz share a city.")).checks.noMirroredOutcomes).toBe(false);
    expect(checkSetupDesign(duelSetup(), multi(2, GameModes.Competitive)).checks.noMirroredOutcomes).toBe(true);
  });

  it("matches each question's form to its resolutions, and counts compound questions", () => {
    const wrong = soloSetup({
      player1: player(["Ada Quill"], [
        outcome("player1_harbour", "Who saves the harbour?", 3),
        outcome("player1_trust", "Will the sailor stay or leave?", 2, paths),
        outcome("player1_side", "Can the sailor win the race and keep the boat?", 1),
      ]),
    });
    const { checks, counts } = checkSetupDesign(wrong, solo);
    expect(checks.questionFormMatches).toBe(false);
    expect(counts.questionFormMismatches).toBe(2);
    expect(counts.compoundQuestions).toBe(1);
  });

  it("flags an identity name in an outcome, unless the premise names the player", () => {
    const named = soloSetup({
      player1: player(["Ada Quill", "Bram Tover"], [outcome("player1_harbour", "Will Ada save the Old Harbour?", 3), outcome("player1_trust", "Can the sailor keep Mira Holt's trust?", 2), outcome("player1_path", "What will the sailor's life look like?", 1, paths)]),
    });
    expect(checkSetupDesign(named, solo).checks.noIdentityNamesInOutcomes).toBe(false);
    expect(checkSetupDesign(named, { ...solo, premise: "Ada Quill, a sailor in a harbour town." }).checks.noIdentityNamesInOutcomes).toBe(true);
  });

  it("reports the share of outcomes that name a story element", () => {
    // The harbour and trust outcomes name Old Harbour and Mira Holt; the path does not
    expect(checkSetupDesign(soloSetup(), solo).counts).toMatchObject({ outcomes: 3, outcomesNamingElement: 2 });
  });
});

describe("checkSetupDesign: scoreboards and names (proposal 2)", () => {
  it("wants one shared opposites scoreboard per contest in two-player contest modes, and no per-seat counters", () => {
    expect(checkSetupDesign(duelSetup(), multi(2, GameModes.Competitive)).checks.scoreStatPerContest).toBe(true);
    const counters = duelSetup({ sharedStats: [stat("Supplies"), stat("Player 1 Points", { type: "number" }), stat("Player 2 Points", { type: "number" })] });
    expect(checkSetupDesign(counters, multi(2, GameModes.Competitive)).checks.scoreStatPerContest).toBe(false);
    // A contest mode without a contested outcome still wants its scoreboard
    const bare = duelSetup({ sharedOutcomes: [outcome("shared_wall", "Will the sea wall hold?", 3)], sharedStats: [stat("Supplies")] });
    expect(checkSetupDesign(bare, multi(2, GameModes.CooperativeCompetitive)).checks.scoreStatPerContest).toBe(false);
    expect(checkSetupDesign(duelSetup(), multi(2, GameModes.Cooperative)).checks).not.toHaveProperty("scoreStatPerContest");
    expect(checkSetupDesign(duelSetup(), multi(3, GameModes.Competitive)).checks).not.toHaveProperty("scoreStatPerContest");
  });

  it("finds a score or lead stat in a cooperative game", () => {
    const scored = duelSetup({ sharedStats: [stat("Supplies"), stat("Rescue Tally", { tooltip: "Who is ahead in rescues." })] });
    expect(checkSetupDesign(scored, multi(2, GameModes.Cooperative)).checks.noCoopScore).toBe(false);
    expect(checkSetupDesign(soloSetup({ sharedStats: [stat("Supplies")] }), multi(2, GameModes.Cooperative)).checks.noCoopScore).toBe(true);
  });

  it("finds seat numbers and player names in stat names, values and tooltips, but not NPC names", () => {
    const seats = duelSetup({ sharedStats: [stat("Player 1 Claims|Player 2 Claims", { type: "opposites" })] });
    expect(checkSetupDesign(seats, multi(2, GameModes.Competitive)).checks.noSlotNames).toBe(false);
    const byName = duelSetup({ sharedStats: [stat("Supplies", { tooltip: "What Dora has left." })] });
    expect(checkSetupDesign(byName, multi(2, GameModes.Competitive)).checks.noSlotNames).toBe(false);
    const npc = duelSetup({ sharedStats: [stat("Mira Holt's Favor")] });
    expect(checkSetupDesign(npc, multi(2, GameModes.Competitive)).checks.noSlotNames).toBe(true);
  });
});

describe("checkSetupDesign: stats (proposals 3 and 4)", () => {
  it("reads effects in range, two or three per stat, and no formula", () => {
    const clean = checkSetupDesign(soloSetup(), solo);
    expect(clean.checks).toMatchObject({ effectsInRange: true, effectsTwoOrThree: true, noFormula: true });
    expect(clean.counts).toMatchObject({ effectNumbers: 4, effectNumbersInRange: 4 });
    const wild = soloSetup({
      sharedStats: [stat("Followers", { effectOnPoints: ["+1 point for every 10 followers", "-20 points in stealth", "+15 when helped", "+30 with a shrine"] })],
    });
    const { checks, counts } = checkSetupDesign(wild, solo);
    expect(checks).toMatchObject({ effectsInRange: false, effectsTwoOrThree: false, noFormula: false });
    // +1, -20, +15 and +30 on Followers, and Courage's +10 and -10
    expect(counts).toMatchObject({ effectNumbers: 6, effectNumbersInRange: 4 });
  });

  it("lets a two-player contest's scoreboard carry one effect, its catch-up (round 1b's fix), and holds every other stat to two or three", () => {
    const catchUp = ["When the side behind takes a bold risk in a regatta thread: +10 to its choice."];
    const board = (effectOnPoints: string[]) =>
      duelSetup({
        sharedStats: [stat("Supplies"), stat("Harbour Master's Voice|Guild's Voice", { type: "opposites", effectOnPoints, tooltip: "The score of the regatta: the harbour master holds the first side." })],
      });
    expect(checkSetupDesign(board(catchUp), multi(2, GameModes.Competitive)).checks.effectsTwoOrThree).toBe(true);
    expect(checkSetupDesign(board(catchUp), multi(2, GameModes.CooperativeCompetitive)).checks.effectsTwoOrThree).toBe(true);
    expect(checkSetupDesign(board([]), multi(2, GameModes.Competitive)).checks.effectsTwoOrThree).toBe(false);
    expect(checkSetupDesign(board([...catchUp, "+5 in a", "+5 in b", "+5 in c"]), multi(2, GameModes.Competitive)).checks.effectsTwoOrThree).toBe(false);
    // No scoreboard in a cooperative game, and no rule gives a three-player lead string one effect
    expect(checkSetupDesign(board(catchUp), multi(2, GameModes.Cooperative)).checks.effectsTwoOrThree).toBe(false);
    expect(checkSetupDesign(board(catchUp), multi(3, GameModes.Competitive)).checks.effectsTwoOrThree).toBe(false);
    // Any other stat keeps two or three
    const thin = duelSetup({ sharedStats: [stat("Supplies", { effectOnPoints: ["+10 when rested"] })] });
    expect(checkSetupDesign(thin, multi(2, GameModes.Competitive)).checks.effectsTwoOrThree).toBe(false);
  });

  it("finds a sacrifice or reward that names a bonus, a risk or a maybe", () => {
    const bonus = soloSetup({ sharedStats: [stat("Followers", { optionsToSacrifice: "Can risk 10 followers for a +20 bonus." })] });
    expect(checkSetupDesign(bonus, solo)).toMatchObject({ checks: { sacrificeNoBonus: false }, counts: { sacrificeTextsWithBonus: 1 } });
    const maybe = soloSetup({ playerStats: [stat("Courage", { optionsToGainAsReward: "Might regain courage by resting." })] });
    expect(checkSetupDesign(maybe, solo).checks.sacrificeNoBonus).toBe(false);
    for (const hedged of ["Risk losing one contact.", "A chance to regain 10% energy.", "Potentially regain one ally.", "Gain +5 courage."]) {
      const setup = soloSetup({ playerStats: [stat("Courage", { optionsToSacrifice: hedged })] });
      expect(checkSetupDesign(setup, solo).checks.sacrificeNoBonus).toBe(false);
    }
  });

  it("passes a certain cost in the stat's own units, whatever words describe what is spent", () => {
    const certain = [
      // Setup doc A5's worked example: "risky" describes the favor, the loss is certain
      "Ask one friend for a risky favor; they leave the list until an old-friends thread.",
      // A stat counted in points spends its own unit
      "Spend 10 Influence Points to call in a debt.",
      // A permissive "may" is no maybe
      "An applicant may take a beat to offer quiet attention.",
    ];
    for (const text of certain) {
      const setup = soloSetup({ playerStats: [stat("Friends", { optionsToSacrifice: text, optionsToGainAsReward: text })] });
      expect(checkSetupDesign(setup, solo).checks.sacrificeNoBonus).toBe(true);
    }
  });

  it("counts the visible player stats that can be spent or earned", () => {
    const setup = soloSetup({
      playerStats: [stat("Courage"), stat("Rank", { optionsToSacrifice: "None", optionsToGainAsReward: "None." }), stat("Secret", { isVisible: false })],
    });
    expect(checkSetupDesign(setup, solo).counts).toMatchObject({ visiblePlayerStats: 2, spendablePlayerStats: 1 });
  });

  it("finds progress meters, but not the contest's scoreboard", () => {
    const meter = soloSetup({ sharedStats: [stat("Reform Progress", { tooltip: "How close the reforms are." })] });
    expect(checkSetupDesign(meter, solo)).toMatchObject({ checks: { noProgressMeter: false }, counts: { progressLikeStats: 1 } });
    expect(checkSetupDesign(duelSetup(), multi(2, GameModes.Competitive)).checks.noProgressMeter).toBe(true);
  });

  it("counts tooltips that disclaim", () => {
    const setup = soloSetup({ sharedStats: [stat("Supplies", { tooltip: "Food and water; it does not track morale." })] });
    expect(checkSetupDesign(setup, solo).counts.tooltipDisclaimers).toBe(1);
  });

  it("finds switch and thread instructions that restate the engine", () => {
    const echo = soloSetup({ guidelines: { ...(soloSetup().guidelines as Loose), switchAndThreadInstructions: ["Threads last 2-4 beats, and the last beat decides the milestone."] } });
    expect(checkSetupDesign(echo, solo).checks.noEngineEcho).toBe(false);
    expect(checkSetupDesign(soloSetup(), solo).checks.noEngineEcho).toBe(true);
  });
});

describe("checkSetupDesign: steering (proposal 7)", () => {
  const withInstructions = (switchAndThreadInstructions: string[], extra: Loose = {}) =>
    soloSetup({ guidelines: { ...(soloSetup().guidelines as Loose), switchAndThreadInstructions, ...extra } });

  it("counts the instructions that name a stat, an outcome, the opening, the finale or a turn", () => {
    const { checks, counts } = checkSetupDesign(soloSetup(), solo);
    expect(checks.triggerRules).toBe(true);
    expect(counts.triggerInstructions).toBe(3);
    expect(checkSetupDesign(withInstructions(["Keep scenes short.", "Vary the mood."]), solo).checks.triggerRules).toBe(false);
  });

  it("checks that a stat an instruction sets a threshold on exists", () => {
    expect(checkSetupDesign(soloSetup(), solo).checks.triggerStatsExist).toBe(true);
    expect(checkSetupDesign(withInstructions(["When Morale drops below 20%, the crew mutinies."]), solo).checks.triggerStatsExist).toBe(false);
    expect(checkSetupDesign(withInstructions(["Keep scenes short."]), solo).checks).not.toHaveProperty("triggerStatsExist");
  });

  it("passes an alternation rule only when it names the story's own thread types", () => {
    expect(checkSetupDesign(withInstructions(["Alternate between action and social threads."]), solo).checks.noGenericAlternation).toBe(false);
    expect(checkSetupDesign(withInstructions(["Alternate harbour chase and tavern talk threads."]), solo).checks.noGenericAlternation).toBe(true);
  });

  it("reads thread types written as 'Name (kind, beats)'", () => {
    const loose = withInstructions([], { typesOfThreads: ["Harbour chase (challenge, 3): outrun the tide", "Tavern talk"] });
    expect(checkSetupDesign(loose, solo).counts).toMatchObject({ threadTypes: 2, threadTypesShaped: 1 });
  });

  it("wants an implication that names a value and a thread it forces or offers", () => {
    expect(checkSetupDesign(soloSetup(), solo).checks.triggerImplications).toBe(true);
    const vague = soloSetup({ sharedStats: [stat("Supplies", { narrativeImplications: ["Low supplies make the crew grumpy."] })], playerStats: [] });
    expect(checkSetupDesign(vague, solo).checks.triggerImplications).toBe(false);
  });

  it("counts the rules that name one of the setup's own stats (proposal 9's problem: 7 of 56 setups have one)", () => {
    // "When Supplies falls below 30%…" names a stat; the opening rule and the turn-13 rule name none
    const { checks, counts } = checkSetupDesign(soloSetup(), solo);
    expect(counts.rulesNamingStat).toBe(1);
    expect(checks.ruleNamesStat).toBe(true);
    // An opposites stat is named by either side
    const sides = soloSetup({
      sharedStats: [stat("Harbour Master's Voice|Guild's Voice", { type: "opposites" })],
      guidelines: { ...(soloSetup().guidelines as Loose), switchAndThreadInstructions: ["When the guild's voice leads by 20, the next thread is a contest."] },
    });
    expect(checkSetupDesign(sides, solo).counts.rulesNamingStat).toBe(1);
    const none = checkSetupDesign(withInstructions(["The first thread is about the missing ferry."]), solo);
    expect(none.checks.ruleNamesStat).toBe(false);
    expect(none.counts.rulesNamingStat).toBe(0);
  });

  it("counts the implications that steer (a value, a thread and a force or offer) among all, for a pooled share", () => {
    // One steering implication on each of the two stats
    expect(checkSetupDesign(soloSetup(), solo).counts).toMatchObject({ implications: 2, steeringImplications: 2 });
    const mixed = soloSetup({
      sharedStats: [stat("Supplies", { narrativeImplications: ["Low supplies make the crew grumpy.", "Below 20%: the next switch forces a thread about food."] })],
      playerStats: [stat("Courage", { id: "player_courage", narrativeImplications: [] })],
    });
    expect(checkSetupDesign(mixed, solo).counts).toMatchObject({ implications: 2, steeringImplications: 1 });
  });
});

describe("checkSetupDesign: facts (proposal 11) and example copies (proposal 5)", () => {
  it("counts hook facts and facts that are only pronouns", () => {
    const { checks, counts } = checkSetupDesign(soloSetup(), solo);
    expect(counts).toMatchObject({ hookFacts: 2, pronounOnlyFacts: 1 });
    expect(checks.noPronounOnlyFacts).toBe(false);
  });

  it("finds eight-word runs of the prompt's example in the setup", () => {
    const example = "Premise: spirits. Energy: Below 30% applies -15 points when interacting with human NPCs due to visible weakness.";
    const copied = soloSetup({ sharedStats: [stat("Stamina", { effectOnPoints: ["Below 30% applies -15 points when interacting with human NPCs", "+10 when rested"] })] });
    expect(checkSetupDesign(copied, solo, example)).toMatchObject({ checks: { noExampleCopy: false } });
    expect(checkSetupDesign(copied, solo, example).counts.exampleCopyRuns).toBeGreaterThan(0);
    expect(checkSetupDesign(soloSetup(), solo, example).checks.noExampleCopy).toBe(true);
    expect(checkSetupDesign(soloSetup(), solo).checks).not.toHaveProperty("noExampleCopy");
  });

  it("counts the worked example's names in a setup whose premise doesn't carry them (setup doc B13 goblinLeak)", () => {
    const leaky = soloSetup({
      sharedStats: [stat("Public Support")],
      playerStats: [stat("Energy", { id: "player_energy" })],
      storyElements: [{ id: "gruk", name: "Gruk", facts: ["Leads the goblins of the harbour.", "Pronouns: he/him.", "Owes Mia a favor."] }],
    });
    // Public Support and Energy as stat names; Gruk, goblins and Mia anywhere
    expect(checkSetupDesign(leaky, solo)).toMatchObject({ checks: { noExampleNameLeak: false }, counts: { exampleNameLeaks: 5 } });
    // A premise that carries a name makes it no leak
    const premise = "Gruk leads the goblins, and Mia rallies Public Support while saving her Energy.";
    expect(checkSetupDesign(leaky, { ...solo, premise }).counts.exampleNameLeaks).toBe(0);
    // Reported on every setup, with or without the prompt's example, so a production reference has its own rate
    expect(checkSetupDesign(soloSetup(), solo)).toMatchObject({ checks: { noExampleNameLeak: true }, counts: { exampleNameLeaks: 0 } });
  });

  it("counts round 1b's renamed example stat (Fervor, for round 1's Energy) as a leak too", () => {
    const renamed = soloSetup({ playerStats: [stat("Fervor", { id: "player_fervor" })] });
    expect(checkSetupDesign(renamed, solo).counts.exampleNameLeaks).toBe(1);
    expect(checkSetupDesign(renamed, { ...solo, premise: "An activist whose fervor burns out." }).counts.exampleNameLeaks).toBe(0);
  });

  it("counts an example stat name only as a stat's name, and a name word only as a whole word", () => {
    const ordinary = soloSetup({
      playerStats: [stat("Stamina", { id: "player_stamina", tooltip: "Energy for the crossing and public support at the docks." })],
      storyElements: [{ id: "mira", name: "Mira Holt", facts: ["Hobgoblins haunt her dreams.", "Pronouns: she/her.", "Owes the guild a debt."] }],
    });
    expect(checkSetupDesign(ordinary, solo).counts.exampleNameLeaks).toBe(0);
  });

  it("reads the example block out of a setup prompt", () => {
    const prompt = "Intro.\nEXAMPLE STAT SETUPS\n\nPremise: spirits\n- Energy\n\nCharacter Selection Instructions\n\nMore.";
    expect(exampleBlock(prompt)).toBe("EXAMPLE STAT SETUPS\n\nPremise: spirits\n- Energy\n\n");
    expect(exampleBlock("A prompt without examples.")).toBeUndefined();
    expect(exampleBlock("WORKED EXAMPLE (a different premise)\nGoblins.")).toBe("WORKED EXAMPLE (a different premise)\nGoblins.");
  });

  it("does not throw on a malformed reply", () => {
    for (const output of [{}, { guidelines: "x", sharedStats: "x", player1: null }, { player1: { outcomes: [null, 3] } }]) {
      expect(() => checkSetupDesign(output, multi(2, GameModes.Competitive))).not.toThrow();
    }
  });
});
