import { describe, expect, it, jest } from "@jest/globals";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import type { Story } from "core/models/Story.js";
import { GameModes, type KidsBand, type StoryState } from "core/types/index.js";
import {
  KIDS_AGES_ANCHORS,
  KIDS_AGES_SETUP_TEXT,
  KIDS_AGES_TEXT,
  kidsAgesBand,
  kidsAgesSetupRequest,
  kidsAgesShortTextCount,
  kidsAgesTurnRequest,
} from "../../../../../src/game/services/storyTextRounds/kidsAges.js";
import {
  KIDS_CONTEXT,
  KIDS_FIELD_IMAGE_DISTRIBUTION,
  KIDS_FIELD_IMAGE_LATE,
  KIDS_IMAGE_DISTRIBUTION,
  KIDS_TEXT_COUNT,
  kidsFieldCount,
  kidsRepeat,
  kidsRules,
} from "../../../../../src/game/services/kidsTurnRules.js";
import { beatStep, setupStep } from "../../../../../src/game/services/storyTextSteps.js";
import { callLimitsOf, requestFor, requestText } from "../../../../../src/evals/textModelEval/variants.js";
import { productionCallLimits } from "../../../../../src/shared/llm/chatModel.js";
import { endingBeat, firstSwitchBeat, laterSwitchBeat, threadBeat } from "../../../../helpers/promptStories.js";

/*
 * Read-with-kids turns and setups by the children's age band (eval only; the
 * owner's decision of 2026-10-01: "this should depend on the age range that
 * should be part of kids stories settings"). The variant is production's turn
 * with the band's kids lines on a read-with-kids story of every player count
 * (the youngest child's band: 3-5, 6-8, 9-12; 6-8's text where no age is
 * recorded), and production's setup with a third visible player stat for the
 * 9-12 band; production's requests byte for byte everywhere else.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const json = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(toJsonSchema(schema));
const inJson = (text: string) => JSON.stringify(text).slice(1, -1);
const occurrences = (text: string, passage: string) => text.split(passage).length - 1;
const kids = (min: number, max = min): Partial<StoryState> => ({ category: "read-with-kids", kidAges: { min, max } });

const TURNS: [string, (overrides: Partial<StoryState>) => Story][] = [
  ["a first turn", (o) => firstSwitchBeat(1, o)],
  ["a chapter step", (o) => threadBeat(1, o)],
  ["a switch turn after a chapter", (o) => laterSwitchBeat(1, o)],
  ["an ending", (o) => endingBeat(1, o)],
  ["a group's chapter step", (o) => threadBeat(2, o)],
  ["a group's switch turn", (o) => laterSwitchBeat(3, o)],
  ["a group's ending", (o) => endingBeat(2, o)],
];
const SINGLE = TURNS.filter(([name]) => !name.startsWith("a group"));
const IMAGES: [string, Partial<StoryState>][] = [
  ["no images", {}],
  ["generated images", { generateImages: true }],
  ["a template's image library", { templateId: "tpl-kids" }],
];

/** The variant's request with each band passage put back as production's grown-up turn has it. */
function backToGrownUp(prompt: string, schemaJson: string, band: KidsBand, who: string): { prompt: string; schemaJson: string } {
  const text = KIDS_AGES_TEXT[band];
  const A = KIDS_AGES_ANCHORS;
  const swaps: [string, string][] = [
    [text.context, A.context],
    [`\n${text.rules(who)}\n\n${text.repeat(who)}`, `\n\n${A.repeat}`],
    [text.image.prompt, A.imagePrompt],
  ];
  const fieldSwaps: [string, string][] = [
    [text.fieldCount(who), A.fieldCount],
    [text.repeat(who), A.repeat],
    [text.image.field, A.fieldImage],
    [text.image.late, A.fieldLate],
  ];
  return {
    prompt: swaps.reduce((p, [from, to]) => p.split(from).join(to), prompt),
    schemaJson: fieldSwaps.reduce((s, [from, to]) => s.split(inJson(from)).join(inJson(to)), schemaJson),
  };
}

describe("the band a story's turns are written for", () => {
  it("is the youngest child's, and 6-8's where the story records no age", () => {
    expect(kidsAgesBand(threadBeat(1, kids(4)))).toBe("3-5");
    expect(kidsAgesBand(threadBeat(1, kids(5, 9)))).toBe("3-5");
    expect(kidsAgesBand(threadBeat(1, kids(7)))).toBe("6-8");
    expect(kidsAgesBand(threadBeat(1, kids(10)))).toBe("9-12");
    expect(kidsAgesBand(threadBeat(1, { category: "read-with-kids" }))).toBe("6-8");
    // A story saved before the setting, its premise's age as readingAge
    expect(kidsAgesBand(threadBeat(1, { category: "read-with-kids", readingAge: "5" }))).toBe("3-5");
  });
});

describe("the 6-8 band is production's kids turn word for word", () => {
  it("in production's own constants", () => {
    const text = KIDS_AGES_TEXT["6-8"];
    for (const who of ["a child aged 7", "a young child"]) {
      expect(text.rules(who)).toBe(kidsRules(who));
      expect(text.repeat(who)).toBe(kidsRepeat(who));
      expect(text.fieldCount(who)).toBe(kidsFieldCount(who));
    }
    expect(text.context).toBe(KIDS_CONTEXT);
    expect(text.shortTextCount).toBe(KIDS_TEXT_COUNT);
    expect(text.image.prompt).toBe(KIDS_IMAGE_DISTRIBUTION);
    expect(text.image.field).toBe(KIDS_FIELD_IMAGE_DISTRIBUTION);
    expect(text.image.late).toBe(KIDS_FIELD_IMAGE_LATE);
  });

  it.each(SINGLE)("so a single player's %s at 6-8, or with no age, is production's request byte for byte, with and without images", (_, build) => {
    for (const [, images] of IMAGES) {
      for (const setting of [kids(7), kids(6, 8), { category: "read-with-kids" as const }]) {
        const story = build({ ...setting, ...images });
        const request = kidsAgesTurnRequest(story);
        expect(request.prompt).toBe(beatStep.request(story).prompt);
        expect(json(request.schema)).toBe(json(beatStep.request(story).schema));
      }
    }
  });
});

describe("the variant on a read-with-kids story", () => {
  const cases: [KidsBand, Partial<StoryState>, string][] = [
    ["3-5", kids(4), "a child aged 4"],
    ["3-5", kids(5, 9), "a child aged 5-9"],
    ["6-8", kids(7), "a child aged 7"],
    ["9-12", kids(10), "a child aged 10"],
  ];

  it.each(TURNS)("%s: the band's count, rules block and repeat once, and nothing else changed from production's grown-up turn", (_, build) => {
    for (const [band, setting, who] of cases) {
      for (const [, images] of IMAGES) {
        const story = build({ ...setting, ...images });
        const text = KIDS_AGES_TEXT[band];
        const request = kidsAgesTurnRequest(story);
        expect(request.prompt).not.toContain("5-6 paragraphs");
        expect(occurrences(request.prompt, text.context)).toBe(1);
        expect(occurrences(request.prompt, text.rules(who))).toBe(1);
        expect(occurrences(request.prompt, text.repeat(who))).toBe(1);
        const schemaJson = json(request.schema);
        expect(schemaJson).not.toContain("5-6 paragraphs");
        expect(occurrences(schemaJson, inJson(text.fieldCount(who)))).toBeGreaterThan(0);
        if (images.generateImages || images.templateId) expect(request.prompt).toContain(text.image.prompt);
        // Put back, it is production's grown-up turn: the same story without its category
        const grownUp = beatStep.request(story.clone({ category: undefined }));
        const back = backToGrownUp(request.prompt, schemaJson, band, who);
        expect(back.prompt).toBe(grownUp.prompt);
        expect(back.schemaJson).toBe(json(grownUp.schema));
      }
    }
  });

  it("asks the 3-5 band for very short turns in a small child's words, and the 9-12 band for a chapter book's page", () => {
    const young = KIDS_AGES_TEXT["3-5"].rules("a child aged 4");
    expect(young).toContain("2-3 very short paragraphs of 1-3 sentences each, about 40 to 90 words");
    expect(young).toContain("about 4 to 8 words");
    expect(young).toContain("options and interludes");
    const older = KIDS_AGES_TEXT["9-12"].rules("a child aged 10");
    expect(older).toContain("4-5 paragraphs of 2-4 sentences each, about 150 to 230 words");
    expect(older).toContain("about 8 to 15 words");
    expect(older).toContain("options and interludes");
  });

  it("never puts a picture on a band's last paragraph", () => {
    expect(KIDS_AGES_TEXT["3-5"].image.field).toContain("the second paragraph only if there are three. Never put an image tag on the last paragraph.");
    expect(KIDS_AGES_TEXT["9-12"].image.field).toContain("one on the third paragraph. Never put an image tag on the last paragraph.");
  });

  it("asks a retry for the band's count, every player count; nothing on another story", () => {
    expect(kidsAgesShortTextCount(threadBeat(1, kids(4)))).toBe(KIDS_AGES_TEXT["3-5"].shortTextCount);
    expect(kidsAgesShortTextCount(threadBeat(2, kids(7)))).toBe(KIDS_TEXT_COUNT);
    expect(kidsAgesShortTextCount(threadBeat(3, kids(10)))).toBe("four or five paragraphs of two to four sentences each");
    expect(kidsAgesShortTextCount(threadBeat(1))).toBeUndefined();
  });
});

describe("the eval variant's turns", () => {
  it("sends the request with production's turn limits for the player count, and names the band's retry count on a kids story", () => {
    for (const [players, story] of [
      [1, threadBeat(1, kids(4))],
      [2, threadBeat(2, kids(10))],
      [1, threadBeat(1, kids(7))],
    ] as const) {
      const request = requestFor("kidsAges", { role: "beat", story });
      expect(requestText(request)).toBe(kidsAgesTurnRequest(story).prompt);
      expect(callLimitsOf(request)).toEqual(productionCallLimits("beat", players));
      expect("shortTextCount" in request && request.shortTextCount).toBe(kidsAgesShortTextCount(story));
    }
    // Another story: production's request and production's retry count (none of its own)
    const plain = requestFor("kidsAges", { role: "beat", story: threadBeat(1) });
    expect(requestText(plain)).toBe(requestText(requestFor("adopted", { role: "beat", story: threadBeat(1) })));
    expect("shortTextCount" in plain).toBe(false);
  });

  it("covers turns and setups only", () => {
    expect(() => requestFor("kidsAges", { role: "switch", story: threadBeat(1, kids(4)) })).toThrow(/does not cover role switch/);
  });
});

describe("production's request byte for byte on every other story", () => {
  it.each(TURNS)("%s", (_, build) => {
    const story = build({});
    expect(kidsAgesTurnRequest(story).prompt).toBe(beatStep.request(story).prompt);
    expect(json(kidsAgesTurnRequest(story).schema)).toBe(json(beatStep.request(story).schema));
    const learning = build({ category: "learn-something" });
    expect(kidsAgesTurnRequest(learning).prompt).toBe(beatStep.request(learning).prompt);
  });
});

describe("the setup's kids budget by band", () => {
  const MOUSE = "Create an age-appropriate story.\n\nHow old is the child?: 10\n\nAdditional context: a field mouse";
  const setups: [number, (typeof GameModes)[keyof typeof GameModes], number][] = [
    [1, GameModes.SinglePlayer, 10],
    [2, GameModes.Cooperative, 25],
    [3, GameModes.Competitive, 25],
  ];

  it.each(setups)("%s player(s): a third visible player stat at 9-12, and nothing else changed", (players, mode, turns) => {
    const request = kidsAgesSetupRequest(MOUSE, players as 1 | 2 | 3, mode, turns, "story", { kids: true, kidAges: { min: 10, max: 10 } });
    const production = setupStep.request(MOUSE, players as 1 | 2 | 3, mode, turns, "story", { kids: true });
    const { budget, inventory, field } = KIDS_AGES_SETUP_TEXT;
    expect(occurrences(request.prompt, budget.to)).toBe(1);
    expect(occurrences(request.prompt, inventory.to)).toBe(1);
    expect(request.prompt).not.toContain(budget.from);
    expect(json(request.schema)).toContain(inJson(field.to));
    expect(request.prompt.split(budget.to).join(budget.from).split(inventory.to).join(inventory.from)).toBe(production.prompt);
    expect(json(request.schema).split(inJson(field.to)).join(inJson(field.from))).toBe(json(production.schema));
    // The reply is assembled as production assembles it
    expect(typeof request.assemble).toBe("function");
  });

  it("is the eval's kidsAges variant on a setup input, with production's setup limits", () => {
    const withoutAges = { premise: MOUSE, playerCount: 1 as const, gameMode: GameModes.SinglePlayer, maxTurns: 10, kids: true };
    const request = requestFor("kidsAges", { role: "setup", setup: { ...withoutAges, kidAges: { min: 10, max: 10 } } });
    expect(requestText(request)).toBe(kidsAgesSetupRequest(MOUSE, 1, GameModes.SinglePlayer, 10, "story", { kids: true, kidAges: { min: 10, max: 10 } }).prompt);
    expect(callLimitsOf(request)).toEqual(productionCallLimits("setup", 1));
    expect(requestText(requestFor("kidsAges", { role: "setup", setup: withoutAges }))).toBe(requestText(requestFor("adopted", { role: "setup", setup: withoutAges })));
  });

  it("is production's kids setup byte for byte below 9-12 and without an age, and production's setup on any other story", () => {
    for (const options of [{ kids: true, kidAges: { min: 4, max: 4 } }, { kids: true, kidAges: { min: 7, max: 10 } }, { kids: true }, {}, { kidAges: { min: 10, max: 10 } }]) {
      const request = kidsAgesSetupRequest(MOUSE, 1, GameModes.SinglePlayer, 10, "story", options);
      const production = setupStep.request(MOUSE, 1, GameModes.SinglePlayer, 10, "story", { kids: options.kids });
      expect(request.prompt).toBe(production.prompt);
      expect(json(request.schema)).toBe(json(production.schema));
    }
  });
});
