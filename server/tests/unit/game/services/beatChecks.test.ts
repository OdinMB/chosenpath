import { describe, expect, it, jest } from "@jest/globals";
import type { SetOfBeatGenerationSchema } from "core/types/index.js";
import { checkedBeatReply, paragraphsOf, shortTextProblem, withBeatProblem } from "../../../../src/game/services/beatChecks.js";
import { beatGeneration, beatSet, PARAGRAPH, SIX_PARAGRAPHS } from "../../../helpers/textFixtures.js";

/*
 * The retry for a turn that comes back as one short paragraph (about 3% of
 * Luna medium turns, on every form the eval ran): the text a player would
 * see, paragraph by paragraph as the client splits it, and one more call
 * told the problem. A second short reply is used: a short turn is better
 * than a failed one.
 */

beforeEach(() => {
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const oneParagraph = (players = 1): SetOfBeatGenerationSchema =>
  beatSet(players, Object.fromEntries(Array.from({ length: players }, (_, i) => [`player${i + 1}`, beatGeneration({ text: PARAGRAPH })])));
const full = (players = 1): SetOfBeatGenerationSchema =>
  beatSet(players, Object.fromEntries(Array.from({ length: players }, (_, i) => [`player${i + 1}`, beatGeneration({ text: SIX_PARAGRAPHS })])));

describe("paragraphsOf: the paragraphs a player sees", () => {
  it("splits on blank lines and on single newlines, as the client does", () => {
    expect(paragraphsOf("One.\n\nTwo.\nThree.")).toEqual(["One.", "Two.", "Three."]);
  });

  it("joins an image line to the paragraph after it", () => {
    expect(paragraphsOf('[image id=gruk source=story desc="Gruk"]\nGruk waits.\n\nThe square fills.')).toEqual([
      '[image id=gruk source=story desc="Gruk"] Gruk waits.',
      "The square fills.",
    ]);
  });

  it("drops blank paragraphs", () => {
    expect(paragraphsOf("\n\n  \nOnly one.\n\n")).toEqual(["Only one."]);
  });
});

describe("shortTextProblem", () => {
  it("names a player whose text is one paragraph", () => {
    expect(shortTextProblem(oneParagraph())).toBe(
      "the text for player1 is a single paragraph; write every player's text as five or six paragraphs of three to five sentences each"
    );
  });

  it("names every short player in a group, and none when every text has paragraphs", () => {
    const reply = full(2);
    reply.player2 = beatGeneration({ text: PARAGRAPH });
    expect(shortTextProblem(reply)).toContain("the text for player2 is a single paragraph");
    expect(shortTextProblem(full(2))).toBeUndefined();
  });

  it("counts an empty text as short", () => {
    expect(shortTextProblem(beatSet(1, { player1: beatGeneration({ text: "" }) }))).toContain("player1");
  });
});

describe("checkedBeatReply", () => {
  function model(...replies: SetOfBeatGenerationSchema[]) {
    const prompts: string[] = [];
    const invoke = jest.fn(async (prompt: string) => {
      prompts.push(prompt);
      const reply = replies[prompts.length - 1];
      if (!reply) throw new Error("called too often");
      return reply;
    });
    return { invoke, prompts };
  }

  it("uses a reply with paragraphs after one call", async () => {
    const { invoke } = model(full());
    await expect(checkedBeatReply("THE PROMPT", invoke)).resolves.toEqual(full());
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("calls once more, told the problem, when a text comes back as one short paragraph", async () => {
    const { invoke, prompts } = model(oneParagraph(), full());

    const reply = await checkedBeatReply("THE PROMPT", invoke);

    expect(prompts).toEqual(["THE PROMPT", withBeatProblem("THE PROMPT", shortTextProblem(oneParagraph()) ?? "")]);
    expect(prompts[1]).toBe(`THE PROMPT\n\nYour previous reply could not be used: ${shortTextProblem(oneParagraph())}. Write the beats again.`);
    expect(reply).toEqual(full());
  });

  it("uses the second reply even when it is short too: the turn never fails for it", async () => {
    const lines: string[] = [];
    const second = oneParagraph();
    second.player1 = beatGeneration({ text: `${PARAGRAPH} Again.` });
    const { invoke } = model(oneParagraph(), second);

    await expect(checkedBeatReply("THE PROMPT", invoke, (line) => lines.push(line))).resolves.toEqual(second);
    expect(invoke).toHaveBeenCalledTimes(2);
    // Counts and no text in the log
    expect(lines).toHaveLength(2);
    expect(lines.join("\n")).not.toContain(PARAGRAPH.slice(0, 20));
  });
});
