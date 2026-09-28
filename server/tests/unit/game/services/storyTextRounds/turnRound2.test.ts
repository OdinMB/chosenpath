import { describe, expect, it } from "@jest/globals";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { Story } from "core/models/Story.js";
import type { Beat, BeatOption, ThreadAnalysis } from "core/types/index.js";
import { beatStep } from "../../../../../src/game/services/storyTextSteps.js";
import {
  TURN_ROUND2_TEXT,
  sacrificeRewardLine,
  turnRound2Request,
  type TurnRound2Form,
} from "../../../../../src/game/services/storyTextRounds/turnRound2.js";
import { endedChapter, flavorSwitch, outcome, roundStory, topicSwitch } from "../../../../helpers/roundStories.js";
import { beatGeneration, challengeOptions, threadAnalysis, type ThreadKind } from "../../../../helpers/textFixtures.js";
import { countOf, descriptionsOf, find } from "../storyTextRewrite/rewriteChecks.js";

const GUILD = "player1_guild_reform";
const ENCLAVE = "player1_enclave_trust";
const OUTCOMES = { player1: [outcome(GUILD, { milestones: ["Sir Bram listened"] }), outcome(ENCLAVE)] };
const DIRECTIONS: [string, string][] = [
  ["Petition the Guild", GUILD],
  ["Win over the enclave", ENCLAVE],
  ["Print the pamphlet", GUILD],
];

const occurrences = (text: string, passage: string) => text.split(passage).length - 1;
const json = (schema: Parameters<typeof toJsonSchema>[0]) => toJsonSchema(schema) as Record<string, unknown>;
const descriptions = (schema: Parameters<typeof toJsonSchema>[0]) => descriptionsOf(toJsonSchema(schema)).join("\n");
const propertiesOf = (value: unknown) => Object.keys((value as { properties: Record<string, unknown> }).properties);

function firstTurn(kind: "topic" | "flavor" = "topic"): Story {
  const phase = kind === "topic" ? topicSwitch(DIRECTIONS, 0) : flavorSwitch(GUILD, "How does Rikkit answer the Guild?", 0);
  return roundStory({ turns: 0, maxTurns: 20, playerOutcomes: OUTCOMES, phases: [phase] });
}

/** The switch turn after a four-beat chapter on the guild outcome */
function switchAfterChapter(): Story {
  return roundStory({
    turns: 5,
    maxTurns: 20,
    playerOutcomes: OUTCOMES,
    phases: [topicSwitch(DIRECTIONS, 0), endedChapter(GUILD, 4, 1, "The Guild hears the petition"), topicSwitch(DIRECTIONS, 5)],
  });
}

/** Step `done + 1` of a `duration`-beat chapter of this kind on the guild outcome, after the opening switch */
function chapterStep(kind: ThreadKind, done: number, duration = 3, history?: Beat[]): Story {
  const analysis = threadAnalysis(kind, duration, 1);
  const chapter: ThreadAnalysis = {
    ...analysis,
    threads: analysis.threads.map((t) => ({
      ...t,
      outcomeId: GUILD,
      progression: t.progression.map((step, i) => ({ ...step, resolution: i < done ? (kind === "exploration" ? ("resolution1" as const) : ("favorable" as const)) : null })),
    })),
  };
  const story = roundStory({ turns: 1 + done, maxTurns: 20, playerOutcomes: OUTCOMES, phases: [topicSwitch(DIRECTIONS, 0), chapter] });
  if (!history) return story;
  const state = story.getState();
  return Story.create({ ...state, players: { player1: { ...state.players.player1, beatHistory: history } } });
}

/** The ending: a first chapter on the guild outcome, a switch, and the last chapter on the enclave outcome */
function ending(): Story {
  return roundStory({
    turns: 6,
    maxTurns: 6,
    playerOutcomes: OUTCOMES,
    phases: [topicSwitch(DIRECTIONS, 0), endedChapter(GUILD, 2, 1, "The Guild hears the petition"), topicSwitch(DIRECTIONS, 3), endedChapter(ENCLAVE, 2, 4, "The enclave sends Gruk")],
  });
}

const STORIES: [string, () => Story][] = [
  ["first turn (topic)", () => firstTurn()],
  ["first turn (flavor)", () => firstTurn("flavor")],
  ["switch after a chapter", switchAfterChapter],
  ["challenge step", () => chapterStep("challenge", 1)],
  ["challenge opening", () => chapterStep("challenge", 0)],
  ["challenge last step", () => chapterStep("challenge", 2)],
  ["exploration step", () => chapterStep("exploration", 1)],
  ["ending", ending],
];
const FORMS: TurnRound2Form[] = ["round2", "paragraphs"];

describe("turnRound2Request builds", () => {
  it.each(FORMS.flatMap((form) => STORIES.map(([name, make]) => [form, name, make] as const)))("%s form, %s: every anchor found, a schema that converts", (form, _name, make) => {
    const request = turnRound2Request(make(), form);
    expect(() => toJsonSchema(request.schema)).not.toThrow();
    expect(request.prompt).toContain("======= CURRENT GAME STATE =======");
  });

  it("is single-player only in round 2 (groups are round 3's B10)", () => {
    const group = roundStory({ players: 2, turns: 0, maxTurns: 20, phases: [topicSwitch(DIRECTIONS, 0, ["player1", "player2"])] });
    expect(() => turnRound2Request(group, "round2")).toThrow(/single-player/);
  });
});

describe("every turn (B3 rows 5, 6, 10 and 16; B5)", () => {
  it.each(STORIES)("%s: no multiplayer mechanics, the fourth wall with game words and readouts, the prose style block once", (_name, make) => {
    const { prompt } = turnRound2Request(make(), "round2");
    expect(prompt).not.toContain("How beats work mechanically");
    expect(prompt).not.toContain("Don't use terms like 'NPC', 'player character', 'stat', 'story beat'");
    expect(occurrences(prompt, TURN_ROUND2_TEXT.fourthWallStart)).toBe(1);
    expect(occurrences(prompt, TURN_ROUND2_TEXT.gameWords)).toBe(1);
    expect(occurrences(prompt, TURN_ROUND2_TEXT.proseStyleStart)).toBe(1);
    expect(prompt).not.toContain("Ensure options align with the coordination pattern");
    expect(prompt.indexOf(TURN_ROUND2_TEXT.proseStyleStart)).toBeLessThan(prompt.indexOf("\nText\n"));
  });

  it("names the lever exception only where levers exist: not in switches, exploration chapters or the ending (found reading the requests)", () => {
    const exception = "Sacrifice and reward options are the one exception";
    const consequence = "(Except for mentioning the stat that is sacrificed or gained as a reward in sacrifice and reward options.)";
    expect(turnRound2Request(chapterStep("challenge", 1), "round2").prompt).toContain(exception);
    expect(turnRound2Request(chapterStep("challenge", 1), "round2").prompt).toContain(consequence);
    for (const story of [firstTurn(), switchAfterChapter(), chapterStep("exploration", 1), ending()]) {
      const { prompt } = turnRound2Request(story, "round2");
      expect(prompt).not.toContain(exception);
      expect(prompt).not.toContain(consequence);
    }
    // The ending has no options or interludes for the fourth wall to cover
    expect(turnRound2Request(ending(), "round2").prompt).toContain("- Don't break the fourth wall in the text: no game words");
  });

  it("gives an exploration chapter no point rules: its options have no roll, and the old scale would contradict the field (found reading the requests)", () => {
    const { prompt } = turnRound2Request(chapterStep("exploration", 1), "round2");
    expect(prompt).not.toContain("- For challenge options, define how the option affects the likelihood");
    expect(prompt).not.toContain("--- basePoints:");
    expect(turnRound2Request(chapterStep("challenge", 1), "round2").prompt).toContain("- For challenge options, define how the option affects the likelihood");
  });

  it("separates the prose style block from the image rules before it", () => {
    expect(turnRound2Request(chapterStep("challenge", 1), "round2").prompt).toContain(`\n\n${TURN_ROUND2_TEXT.proseStyleStart}`);
  });

  it("keeps the held-out tics out of the prompt and the schema: the path ahead, and scenery that waits", () => {
    for (const [, make] of STORIES) {
      const request = turnRound2Request(make(), "round2");
      const all = `${request.prompt}\n${descriptions(request.schema)}`.toLowerCase();
      expect(all).not.toContain("path ahead");
      expect(all).not.toContain("hall waits");
    }
  });

  it("states the last paragraph's job in the prompt, and drops the text field's copy of the old rule", () => {
    const request = turnRound2Request(chapterStep("challenge", 1), "round2");
    expect(occurrences(request.prompt, TURN_ROUND2_TEXT.lastParagraphStart)).toBe(1);
    expect(request.prompt).not.toContain("Never mention or even refer to the player's options and choices.");
    expect(descriptions(request.schema)).not.toContain("Never introduce, talk about, or even hint at the player's options");
  });

  it("narrates stat changes by their effect, never as a readout", () => {
    const { prompt } = turnRound2Request(chapterStep("challenge", 1), "round2");
    expect(prompt).toContain(TURN_ROUND2_TEXT.statChangesNarrated);
    expect(prompt).not.toContain("statChanges you just applied");
  });

  it("asks for two to four interludes, capped at four", () => {
    const request = turnRound2Request(chapterStep("challenge", 1), "round2");
    expect(request.prompt).toContain("Create two to four interludes.");
    expect(request.prompt).not.toContain("exactly 3 interludes");
    const interludes = find(json(request.schema), ["properties", "player1", "properties", "interludes"]);
    expect(countOf(interludes)).toEqual({ maxItems: 4 });
    expect(descriptions(request.schema)).toContain("Two to four snippets");
    expect(descriptions(request.schema)).not.toContain("exactly 3 snippets");
  });

  it("drops the text field's milestone line (the switch turn's prompt carries it) and words the first paragraph from the second turn on", () => {
    const text = descriptions(turnRound2Request(chapterStep("challenge", 1), "round2").schema);
    expect(text).not.toContain("If a milestone was added to a player's outcome");
    expect(text).toContain("From the second turn on: start exactly where the previous beat for this player ended");
    expect(text).not.toContain("- Start exactly where the previous beat for this player ended.");
  });

  it("plants sparingly: the hook rule replaces the curiosity hint, and world building stops asking for one", () => {
    const request = turnRound2Request(chapterStep("challenge", 1), "round2");
    expect(request.prompt).toContain(TURN_ROUND2_TEXT.hooksStart);
    expect(request.prompt).not.toContain("Plan a hint about a detail in the world");
    expect(descriptions(request.schema)).not.toContain("Plan a detail that makes the player curious");
  });
});

describe("the first turn (B3 row 3, B7)", () => {
  it("opens in a scene and drops the previous-beat lines and the brochure requirements", () => {
    const { prompt } = turnRound2Request(firstTurn(), "round2");
    expect(prompt).toContain(TURN_ROUND2_TEXT.firstTurnStart);
    expect(prompt).toContain("DON'T ADD ANY NEW STORY ELEMENTS OR NEW FACTS.");
    expect(prompt).toContain("--- Add the element ids of the elements that you introduce");
    for (const gone of [
      "Required: Introduce the player itself.",
      "Required: Introduce the other players",
      "Required: Introduce or at least hint at the outcomes",
      "Find a good balance between introducing the overall setup",
      "Let's just give the player a proper introduction",
      "The first item must always be the players performing the action that they chose in the previous beat",
      "Results of the player's actions depend on the resolution of the previous beat.",
      "continue exactly where the previous beat for this player ended",
      "Just return an empty list.",
    ]) {
      expect(prompt).not.toContain(gone);
    }
  });

  it("tells the opening scene in the second person, like every beat (the smoke's first turn narrated its character by name)", () => {
    const { prompt } = turnRound2Request(firstTurn(), "round2");
    expect(prompt).toContain("told in the second person like every beat");
    expect(prompt).not.toContain("the player character is doing something");
    expect(prompt).toContain("steps out of the alley and looks straight at you");
  });

  it("stages the opening of a flavor first switch", () => {
    expect(turnRound2Request(firstTurn("flavor"), "round2").prompt).toContain(TURN_ROUND2_TEXT.flavorOpening);
    expect(turnRound2Request(firstTurn(), "round2").prompt).not.toContain(TURN_ROUND2_TEXT.flavorOpening);
  });

  it("asks for no previous decision in the plan: there is none on the first turn (found reading the requests)", () => {
    const text = descriptions(turnRound2Request(firstTurn(), "round2").schema);
    expect(text).toContain(TURN_ROUND2_TEXT.firstTurnNoDecision);
    expect(text).not.toContain("The action that the player decided to do at the end of the previous beat");
    expect(descriptions(turnRound2Request(switchAfterChapter(), "round2").schema)).toContain("The action that the player decided to do at the end of the previous beat");
  });

  it("writes no stat changes and no stats list; code stores both empty", () => {
    const request = turnRound2Request(firstTurn(), "round2");
    const root = propertiesOf(json(request.schema));
    expect(root).not.toContain("statChanges");
    expect(root).not.toContain("statsAffectingDecisionConsequences");
    const assembled = request.assemble?.({ newMilestones: "", multiplayerCoordination: "", player1: { text: "x" } }) as Record<string, unknown>;
    expect(assembled.statChanges).toEqual([]);
    expect(assembled.statsAffectingDecisionConsequences).toEqual([]);
  });
});

describe("switch turns (B3 rows 4, 12, 13, 16, 18; B7; B1's milestone)", () => {
  it("gives the event a full paragraph, never called a milestone, then pulls the story on", () => {
    const { prompt } = turnRound2Request(switchAfterChapter(), "round2");
    expect(prompt).toContain(TURN_ROUND2_TEXT.milestoneParagraphStart);
    expect(prompt).toContain(TURN_ROUND2_TEXT.afterChapter);
    expect(prompt.indexOf(TURN_ROUND2_TEXT.milestoneParagraphStart)).toBeLessThan(prompt.indexOf(TURN_ROUND2_TEXT.afterChapter));
    expect(prompt).not.toContain("Spend at least a full paragraph on narrating the milestone");
    expect(prompt).not.toContain("Since a thread was just resolved, describe the resolution of the thread in detail.");
  });

  it("maps the directions and the stances, without ids, and drops the lines that contradict them", () => {
    for (const story of [firstTurn(), switchAfterChapter()]) {
      const { prompt } = turnRound2Request(story, "round2");
      expect(prompt).toContain(TURN_ROUND2_TEXT.topicSwitch);
      expect(prompt).toContain(TURN_ROUND2_TEXT.flavorSwitchStart);
      expect(prompt).not.toContain("Remember that topic switches already have their options defined");
      expect(prompt).not.toContain("For topic switches: Present options that let the player choose");
      expect(prompt).not.toContain("Don't give the player an opportunity to leave the scene");
      expect(prompt).not.toContain("Remember: In these switches, players decided what is supposed to happen next.");
      expect(prompt).not.toContain("- Relationship to other switches:");
    }
  });

  it("offers no sacrifice or reward in a switch: the lines go, and the option fields say normal", () => {
    const request = turnRound2Request(switchAfterChapter(), "round2");
    expect(request.prompt).not.toContain("Define if the option is a sacrifice");
    const text = descriptions(request.schema);
    expect(text).toContain(TURN_ROUND2_TEXT.explorationNormal);
    expect(text).not.toContain("There can only ever be a total of zero or one sacrifice/reward option");
    expect(text).not.toContain("Don't allow the player to leave the scene");
  });

  it("writes one milestone sentence; code files it on the chapter's outcome", () => {
    const request = turnRound2Request(switchAfterChapter(), "round2");
    expect(request.prompt).toContain(TURN_ROUND2_TEXT.newMilestoneStart);
    expect(request.prompt).not.toContain("NEW MILESTONES: To resolve the previous set of threads");
    const root = propertiesOf(json(request.schema));
    expect(root).toContain("milestone");
    expect(root).not.toContain("newMilestones");
    const assembled = request.assemble?.({ statChanges: [], milestone: "Sir Bram tears the petition in half.", player1: {} }) as Record<string, unknown>;
    expect(assembled.newMilestones).toEqual([{ type: "newMilestone", outcomeGroup: "player1", outcome: GUILD, newMilestone: "Sir Bram tears the petition in half." }]);
    expect("milestone" in assembled).toBe(false);
  });

  it("leaves the milestone to the game's safety net when the sentence is blank", () => {
    const request = turnRound2Request(switchAfterChapter(), "round2");
    const assembled = request.assemble?.({ statChanges: [], milestone: "  ", player1: {} }) as Record<string, unknown>;
    expect(assembled.newMilestones).toEqual([]);
  });
});

describe("challenge and contest chapter turns (B6)", () => {
  it("asks for three ways to act, the reward exception, the computed lever line and no double sacrifice", () => {
    const { prompt } = turnRound2Request(chapterStep("challenge", 1), "round2");
    expect(prompt).toContain(TURN_ROUND2_TEXT.threeWaysStart);
    expect(prompt).toContain(TURN_ROUND2_TEXT.rewardException);
    expect(prompt).toContain("Sacrifice or reward: one fits this turn if a stat allows it.");
    expect(prompt).toContain(TURN_ROUND2_TEXT.noDoubleSacrifice);
    expect(prompt).not.toContain("That said: if it makes sense for a stat to have an influence");
    expect(prompt).not.toContain("--- basePoints:");
  });

  it("states base points, bonuses and certain sacrifices in their fields, at most two bonuses", () => {
    const request = turnRound2Request(chapterStep("challenge", 1), "round2");
    const text = descriptions(request.schema);
    expect(text).toContain(TURN_ROUND2_TEXT.basePoints);
    expect(text).toContain(TURN_ROUND2_TEXT.bonusEffect);
    expect(text).toContain(TURN_ROUND2_TEXT.bonuses);
    expect(text).toContain(TURN_ROUND2_TEXT.certainLever);
    expect(text).not.toContain("2 most relevant stats");
    expect(text).not.toContain("Many beats are better without any sacrifice or reward options");
    expect(text).not.toContain("Remember that both sacrifices and rewards are certain and not just risks");
    const options = find(json(request.schema), ["properties", "player1", "properties", "options", "items", "anyOf", "1", "properties", "modifiersToSuccessRate"]);
    expect(countOf(options)).toEqual({ maxItems: 2 });
  });
});

describe("exploration chapter turns (B3 row 12, B7)", () => {
  it("orders the options by the step's resolutions and offers no lever or strength triad", () => {
    const { prompt } = turnRound2Request(chapterStep("exploration", 1), "round2");
    expect(prompt).toContain(TURN_ROUND2_TEXT.explorationOrder);
    expect(prompt).not.toContain("Define if the option is a sacrifice");
    expect(prompt).not.toContain(TURN_ROUND2_TEXT.threeWaysStart);
    expect(prompt).not.toContain("Sacrifice or reward:");
  });
});

describe("a chapter's first step (B3 row 9)", () => {
  it("shows the switch turn's last paragraph, which the chapter's first beat continues", () => {
    const opening = chapterStep("challenge", 0);
    const state = opening.getState();
    const history = state.players.player1.beatHistory;
    const withText = Story.create({
      ...state,
      players: { player1: { ...state.players.player1, beatHistory: [{ ...history[0], text: "First paragraph.\n\n[image id=x source=story desc=\"X\"]Gruk waits at the gate. 'Now,' he says." }] } },
    });
    const { prompt } = turnRound2Request(withText, "round2");
    expect(prompt).toContain("PREVIOUS BEAT (the switch), last paragraph for Test Player:\nGruk waits at the gate. 'Now,' he says.");
    expect(turnRound2Request(chapterStep("challenge", 1), "round2").prompt).not.toContain("PREVIOUS BEAT (the switch)");
  });
});

describe("the ending (B8, B1's milestone)", () => {
  it("answers each outcome in a field written first, with no options, interludes, plan or title", () => {
    const request = turnRound2Request(ending(), "round2");
    const player = find(json(request.schema), ["properties", "player1"]);
    expect(propertiesOf(player)).toEqual(["outcomeEndings", "text", "summary"]);
    expect(countOf(find(player, ["properties", "outcomeEndings"]))).toEqual({ maxItems: 6 });
    expect(propertiesOf(json(request.schema))).toEqual(["statChanges", "milestone", "player1"]);
  });

  it("says in the context that no decision follows the ending (found reading the requests)", () => {
    expect(turnRound2Request(ending(), "round2").prompt).toContain(TURN_ROUND2_TEXT.endingNoDecision);
    expect(turnRound2Request(chapterStep("challenge", 1), "round2").prompt).not.toContain(TURN_ROUND2_TEXT.endingNoDecision);
  });

  it("carries the ending rules and drops the lines that ask for options, interludes, a plan or an open end", () => {
    const { prompt } = turnRound2Request(ending(), "round2");
    expect(prompt).toContain(TURN_ROUND2_TEXT.endingRulesStart);
    expect(prompt).toContain(TURN_ROUND2_TEXT.endingClose);
    for (const gone of [
      "Touch on each individual and shared outcome",
      "For shared outcomes, touch on how the outcome affects the other players.",
      "Tie the ending to the individual and shared outcomes",
      "How to make sure that the text follows the principle of 'Show Don't Tell'?",
      "Title: The End",
      "Interludes\nare little snippets",
      "Use the list of 'show don't tell' instructions that you generated in the plan",
      TURN_ROUND2_TEXT.lastParagraphStart,
      "1. IDENTIFY STATS AND STORY ELEMENTS",
    ]) {
      expect(prompt).not.toContain(gone);
    }
    expect(prompt).toContain("Stay in the scene.\n- Most of the beat text should be about the ending");
    expect(descriptions(turnRound2Request(ending(), "round2").schema)).not.toContain("Don't define or narrate the resolution of the beat");
  });

  it("shows every past choice, not only the last one", () => {
    const { prompt } = turnRound2Request(ending(), "round2");
    expect(occurrences(prompt, "  Chosen option: player1 option")).toBe(6);
    expect(prompt).toContain("- Beat 1: player1 summary 0\n  Chosen option: player1 option 0.0 (Result: Favorable)");
  });

  it("assembles today's stored shape: empty options and interludes, The End, an empty plan, the milestone on the last chapter's outcome", () => {
    const request = turnRound2Request(ending(), "round2");
    const answers = [{ outcomeId: GUILD, resolution: "favorable", basis: "Two milestones" }];
    const assembled = request.assemble?.({ statChanges: [], milestone: "Gruk walks Rikkit home.", player1: { outcomeEndings: answers, text: "The end text.", summary: "It ends." } }) as Record<string, Record<string, unknown>>;
    expect(assembled.player1).toMatchObject({
      title: "The End",
      text: "The end text.",
      summary: "It ends.",
      options: [],
      interludes: [],
      outcomeEndings: answers,
      plan: { establishedFacts: [], newGameElements: [], newIntroductionsOfStoryElements: [] },
    });
    expect(assembled.newMilestones).toEqual([{ type: "newMilestone", outcomeGroup: "player1", outcome: ENCLAVE, newMilestone: "Gruk walks Rikkit home." }]);
    expect(assembled.statsAffectingDecisionConsequences).toEqual([]);
    expect(assembled.multiplayerCoordination).toBe("");
    // The game applies the assembled reply without throwing (turn doc B8.5)
    expect(() => beatStep.apply(ending(), assembled as never)).not.toThrow();
  });
});

describe("the paragraph arm (B9 item 2)", () => {
  it("states the count at the text field and once in the context, and nowhere else", () => {
    for (const [, make] of STORIES) {
      const request = turnRound2Request(make(), "paragraphs");
      const all = `${request.prompt}\n${descriptions(request.schema)}`;
      expect(all).not.toContain("These are a lot of instructions");
      expect(occurrences(descriptions(request.schema), TURN_ROUND2_TEXT.paragraphCount)).toBe(1);
      expect(occurrences(all, "5-6 paragraphs")).toBe(1);
    }
  });

  it("changes nothing else against the round-2 form", () => {
    const story = chapterStep("challenge", 1);
    const [base, arm] = (["round2", "paragraphs"] as const).map((form) => turnRound2Request(story, form));
    expect(arm.prompt).toBe(base.prompt.replace(`\n\n${TURN_ROUND2_TEXT.shoutedCount}`, ""));
  });
});

function challengeBeat(levers: BeatOption["resourceType"][] = []): Beat {
  const options = challengeOptions().map((o, i) => ({ ...o, resourceType: levers[i] ?? "normal" }));
  return { ...beatGeneration({ options }), choice: 0, resolution: "favorable" };
}

function switchBeat(): Beat {
  return { ...beatGeneration(), choice: 0, resolution: null };
}

describe("sacrificeRewardLine (B6's computed rate)", () => {
  it("fits when none was offered in the player's last two challenge turns, naming the last one and the other kind", () => {
    const history = [challengeBeat(["sacrifice"]), switchBeat(), challengeBeat(), challengeBeat()];
    expect(sacrificeRewardLine(chapterStep("challenge", 1, 3, history), "player1")).toBe(
      "Sacrifice or reward: one fits this turn if a stat allows it (the last one offered was a sacrifice, 4 turns ago; prefer a reward)."
    );
  });

  it("is none when one of the last two challenge turns offered one; switch turns don't count", () => {
    const history = [challengeBeat(), challengeBeat(["normal", "reward"]), switchBeat()];
    expect(sacrificeRewardLine(chapterStep("challenge", 1, 3, history), "player1")).toBe("Sacrifice or reward: none this turn.");
  });

  it("fits without a preference when none was ever offered", () => {
    expect(sacrificeRewardLine(chapterStep("challenge", 1, 3, [switchBeat(), challengeBeat()]), "player1")).toBe("Sacrifice or reward: one fits this turn if a stat allows it.");
  });

  it("prints in the request as computed", () => {
    const history = [challengeBeat(["reward"]), challengeBeat()];
    expect(turnRound2Request(chapterStep("challenge", 1, 3, history), "round2").prompt).toContain("--- Sacrifice or reward: none this turn.");
  });
});
