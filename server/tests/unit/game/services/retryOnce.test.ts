import { jest } from "@jest/globals";
import { UnusableResultError, withOneRetry } from "../../../../src/game/services/retryOnce.js";

type Result = { value: string; problem: string | null };

/** An attempt that returns the given results in turn, recording the problem each call is told. */
function attempts(...results: Result[]) {
  const told: (string | undefined)[] = [];
  const attempt = jest.fn(async (previousProblem?: string) => {
    told.push(previousProblem);
    const next = results[told.length - 1];
    if (!next) throw new Error("called too often");
    return next;
  });
  return { attempt, told };
}

const problemOf = (result: Result) => result.problem;

describe("withOneRetry", () => {
  it("makes one call when the first result is usable", async () => {
    const { attempt, told } = attempts({ value: "first", problem: null });

    await expect(withOneRetry(attempt, problemOf, "story setup")).resolves.toEqual({ value: "first", problem: null });
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(told).toEqual([undefined]);
  });

  it("makes a second call, told the first problem, when the first result has one", async () => {
    const { attempt, told } = attempts({ value: "first", problem: "no shared outcome" }, { value: "second", problem: null });

    await expect(withOneRetry(attempt, problemOf, "story setup")).resolves.toEqual({ value: "second", problem: null });
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(told).toEqual([undefined, "no shared outcome"]);
  });

  it("throws when the second result has a problem too, keeping the problem off the message", async () => {
    const { attempt } = attempts({ value: "first", problem: "no outcomes" }, { value: "second", problem: "no shared outcome" });

    const failure = withOneRetry(attempt, problemOf, "story setup");

    await expect(failure).rejects.toBeInstanceOf(UnusableResultError);
    await expect(failure).rejects.toMatchObject({
      message: "Failed to generate a usable story setup",
      problem: "no shared outcome",
    });
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("does not retry a call that fails outright", async () => {
    const attempt = jest.fn(async (): Promise<Result> => {
      throw new Error("model call failed");
    });

    await expect(withOneRetry(attempt, problemOf, "story setup")).rejects.toThrow("model call failed");
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});
