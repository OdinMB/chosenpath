import { describe, expect, it, jest } from "@jest/globals";
import type { SetOfBeatGenerationSchema } from "core/types/index.js";
import {
  beatReplyProblem,
  checkedBeatReply,
  missingOptionsProblem,
  paragraphsOf,
  shortTextProblem,
  withBeatProblem,
} from "../../../../src/game/services/beatChecks.js";
import { UnusableResultError } from "../../../../src/game/services/retryOnce.js";
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
/** Every player's beat with paragraphs and no options (the reply of 1 in 64 production turns on 2026-09-30). */
const noOptions = (players = 1): SetOfBeatGenerationSchema =>
  beatSet(players, Object.fromEntries(Array.from({ length: players }, (_, i) => [`player${i + 1}`, beatGeneration({ text: SIX_PARAGRAPHS, options: [] })])));

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

describe("missingOptionsProblem: a turn a player can't go on from", () => {
  it("names a player whose beat has no options", () => {
    expect(missingOptionsProblem(noOptions())).toBe("the beat for player1 has no options; write three options for every player's beat");
  });

  it("names every player without options in a group, and none when every beat has options", () => {
    const reply = full(3);
    reply.player2 = beatGeneration({ options: [] });
    reply.player3 = beatGeneration({ options: [] });
    expect(missingOptionsProblem(reply)).toBe("the beats for player2 and player3 have no options; write three options for every player's beat");
    expect(missingOptionsProblem(full(2))).toBeUndefined();
  });

  it("counts options the reply left out altogether", () => {
    const reply = full();
    delete (reply.player1 as Partial<typeof reply.player1>).options;
    expect(missingOptionsProblem(reply)).toContain("player1");
  });

  it("never asks the ending for options: the game shows none there", () => {
    expect(missingOptionsProblem(noOptions(2), { ending: true })).toBeUndefined();
  });
});

describe("beatReplyProblem", () => {
  it("states each problem a reply has, the short text first", () => {
    const reply = oneParagraph();
    reply.player1 = beatGeneration({ text: PARAGRAPH, options: [] });
    expect(beatReplyProblem(reply)).toBe(`${shortTextProblem(reply)}; ${missingOptionsProblem(reply)}`);
    expect(beatReplyProblem(oneParagraph())).toBe(shortTextProblem(oneParagraph()));
    expect(beatReplyProblem(noOptions())).toBe(missingOptionsProblem(noOptions()));
    expect(beatReplyProblem(full())).toBeUndefined();
    expect(beatReplyProblem(noOptions(), { ending: true })).toBeUndefined();
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

  it("uses the first reply when the retry's call fails outright: a usable short turn never fails for the retry", async () => {
    const lines: string[] = [];
    const invoke = jest.fn(async (prompt: string) => {
      if (prompt === "THE PROMPT") return oneParagraph();
      throw Object.assign(new Error(`Request timed out; the reply began ${PARAGRAPH}`), { name: "APIConnectionTimeoutError" });
    });

    await expect(checkedBeatReply("THE PROMPT", invoke, (line) => lines.push(line))).resolves.toEqual(oneParagraph());
    expect(invoke).toHaveBeenCalledTimes(2);
    // The error's class, never its message, which can quote the reply
    expect(lines[1]).toContain("APIConnectionTimeoutError");
    expect(lines.join("\n")).not.toContain(PARAGRAPH.slice(0, 20));
  });

  it("calls once more, told the problem, when a beat comes back with no options, and uses the retry's options", async () => {
    const lines: string[] = [];
    const { invoke, prompts } = model(noOptions(), full());

    await expect(checkedBeatReply("THE PROMPT", invoke, (line) => lines.push(line))).resolves.toEqual(full());
    expect(prompts).toEqual(["THE PROMPT", withBeatProblem("THE PROMPT", missingOptionsProblem(noOptions()) ?? "")]);
    expect(lines).toEqual(["A beat came back with no options; asking once more"]);
  });

  it("uses an ending without options after one call", async () => {
    const { invoke } = model(noOptions());
    await expect(checkedBeatReply("THE PROMPT", invoke, () => undefined, { ending: true })).resolves.toEqual(noOptions());
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("tells the retry both problems when a beat is short and has no options", async () => {
    const both = oneParagraph();
    both.player1 = beatGeneration({ text: PARAGRAPH, options: [] });
    const { invoke, prompts } = model(both, full());

    await expect(checkedBeatReply("THE PROMPT", invoke, () => undefined)).resolves.toEqual(full());
    expect(prompts[1]).toBe(withBeatProblem("THE PROMPT", beatReplyProblem(both) ?? ""));
  });

  it("fails the turn when the retry has no options either: nobody could go on from it, and the game sends a failed turn once more", async () => {
    const lines: string[] = [];
    const { invoke } = model(noOptions(), noOptions());

    const reply = checkedBeatReply("THE PROMPT", invoke, (line) => lines.push(line));
    await expect(reply).rejects.toBeInstanceOf(UnusableResultError);
    await expect(checkedBeatReply("THE PROMPT", model(noOptions(), noOptions()).invoke, () => undefined)).rejects.toMatchObject({
      message: "Failed to generate a usable beat",
      problem: missingOptionsProblem(noOptions()),
    });
    expect(lines).toEqual(["A beat came back with no options; asking once more", "A beat came back with no options again; the turn fails"]);
  });

  it("keeps a short first reply that has options when the retry comes back without any", async () => {
    const lines: string[] = [];
    const { invoke } = model(oneParagraph(), noOptions());

    await expect(checkedBeatReply("THE PROMPT", invoke, (line) => lines.push(line))).resolves.toEqual(oneParagraph());
    expect(lines[1]).toBe("A beat's retry came back with no options; using the first reply");
  });

  it("fails the turn when a beat without options gets a retry whose call fails outright: the first reply can't be played", async () => {
    const lines: string[] = [];
    const timeout = Object.assign(new Error(`Request timed out; the reply began ${PARAGRAPH}`), { name: "APIConnectionTimeoutError" });
    const invoke = jest.fn(async (prompt: string) => {
      if (prompt === "THE PROMPT") return noOptions();
      throw timeout;
    });

    await expect(checkedBeatReply("THE PROMPT", invoke, (line) => lines.push(line))).rejects.toBe(timeout);
    expect(lines[1]).toBe("A beat's retry failed (APIConnectionTimeoutError); the first reply has no options, so the turn fails");
  });
});
