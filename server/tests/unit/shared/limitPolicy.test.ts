import { describe, expect, it } from "@jest/globals";
import {
  choiceLimitKey,
  storyStartLimit,
} from "../../../src/shared/limitPolicy.js";
import {
  accountKey,
  addressKey,
  seatKey,
} from "../../../src/shared/rateLimiter.js";

const ADDRESS = "198.51.100.23";
const SEAT = { storyId: "story-1", playerSlot: "player2" };

describe("storyStartLimit", () => {
  it("counts a start without an account against the address, images or not", () => {
    for (const images of [true, false]) {
      expect(storyStartLimit(undefined, images, ADDRESS)).toEqual({
        key: addressKey(ADDRESS),
        action: "initialize_story",
      });
    }
  });

  it("counts a signed-in start without images against the account's text allowance", () => {
    expect(storyStartLimit("user-1", false, ADDRESS)).toEqual({
      key: accountKey("user-1"),
      action: "initialize_story_text",
    });
  });

  it("counts a signed-in start with images against the account's image allowance", () => {
    expect(storyStartLimit("user-1", true, ADDRESS)).toEqual({
      key: accountKey("user-1"),
      action: "initialize_story_images",
    });
  });
});

describe("choiceLimitKey", () => {
  it("counts a choice in a story an account started by its seat", () => {
    expect(choiceLimitKey("account", SEAT, ADDRESS)).toBe(
      seatKey(SEAT.storyId, SEAT.playerSlot)
    );
  });

  it("counts a choice in a story started without an account by its address", () => {
    expect(choiceLimitKey("anonymous", SEAT, ADDRESS)).toBe(addressKey(ADDRESS));
  });

  it("falls back to the address without a seat or a known origin", () => {
    expect(choiceLimitKey("account", undefined, ADDRESS)).toBe(addressKey(ADDRESS));
    expect(choiceLimitKey(undefined, SEAT, ADDRESS)).toBe(addressKey(ADDRESS));
  });
});
