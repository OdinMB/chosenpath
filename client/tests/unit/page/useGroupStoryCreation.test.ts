import type { CreateStoryFromTemplateRequest } from "core/types/api";
import {
  clampGroupCount,
  groupStartRequest,
  seatCardsPath,
  startSequentially,
} from "../../../src/page/hooks/useGroupStoryCreation";

/*
 * "Start several groups": the same World started once per group, one start
 * after another through the ordinary route, so each counts against the
 * signed-in user's text-start limit and a refusal stops the rest.
 */

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../src/config", () =>
  jest.requireActual("../../__mocks__/client/config")
);

const SETTINGS: CreateStoryFromTemplateRequest = {
  templateId: "template-1",
  playerCount: 3,
  maxTurns: 10,
  generateImages: true,
  pregenerateBeats: false,
  difficultyLevel: { modifier: 0, title: "Normal" },
};

describe("startSequentially", () => {
  it("starts each one after the previous one finished, in order", async () => {
    const order: string[] = [];
    let running = 0;
    let next = 0;
    const start = jest.fn(async () => {
      running += 1;
      expect(running).toBe(1);
      const id = `story-${++next}`;
      await Promise.resolve();
      order.push(id);
      running -= 1;
      return id;
    });

    await expect(startSequentially(3, start)).resolves.toEqual([
      "story-1",
      "story-2",
      "story-3",
    ]);
    expect(order).toEqual(["story-1", "story-2", "story-3"]);
    expect(start).toHaveBeenCalledTimes(3);
  });

  it("stops at the first refusal and returns what started before it", async () => {
    const start = jest
      .fn<Promise<string>, []>()
      .mockResolvedValueOnce("story-1")
      .mockResolvedValueOnce("story-2")
      .mockRejectedValueOnce({ status: "rate_limited" })
      .mockResolvedValue("never");

    await expect(startSequentially(5, start)).resolves.toEqual([
      "story-1",
      "story-2",
    ]);
    expect(start).toHaveBeenCalledTimes(3);
  });

  it("returns nothing when the first start is refused", async () => {
    const start = jest.fn().mockRejectedValue(new Error("ceiling"));

    await expect(startSequentially(4, start)).resolves.toEqual([]);
    expect(start).toHaveBeenCalledTimes(1);
  });
});

describe("groupStartRequest", () => {
  it("starts every group without unique images, whatever the form said", () => {
    const { request } = groupStartRequest(SETTINGS, 4);

    expect(request).toEqual({ ...SETTINGS, generateImages: false });
    expect(SETTINGS.generateImages).toBe(true);
  });

  it("keeps the number of groups within 2 to 12", () => {
    expect(groupStartRequest(SETTINGS, 4).count).toBe(4);
    expect(groupStartRequest(SETTINGS, 1).count).toBe(2);
    expect(groupStartRequest(SETTINGS, 0).count).toBe(2);
    expect(groupStartRequest(SETTINGS, 13).count).toBe(12);
    expect(groupStartRequest(SETTINGS, 40).count).toBe(12);
    expect(clampGroupCount(Number.NaN)).toBe(2);
    expect(clampGroupCount(5.4)).toBe(5);
  });
});

describe("seatCardsPath", () => {
  it("preselects the started stories on the seat-card page", () => {
    expect(seatCardsPath(["a-1", "b-2"])).toBe("/users/seat-cards?stories=a-1,b-2");
  });
});
