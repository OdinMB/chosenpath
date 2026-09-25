import {
  gameAiNoticeVariant,
  shouldRemindAtThreadChange,
  startsNewThread,
  threadKeyOf,
} from "../../../../src/game/utils/aiNotice";

const titled = (...titles: string[]) => titles.map((title) => ({ title }));

describe("gameAiNoticeVariant", () => {
  it("uses the child-friendly notice for read-with-kids stories only", () => {
    expect(gameAiNoticeVariant("read-with-kids")).toBe("kids");
    expect(gameAiNoticeVariant("vent-about-reality")).toBe("default");
    expect(gameAiNoticeVariant(undefined)).toBe("default");
  });
});

describe("threadKeyOf", () => {
  it("reads the thread title from a thread beat's title", () => {
    expect(threadKeyOf({ title: "The Night Market (2/4)" })).toBe(
      "the night market"
    );
  });

  it("has no thread for switches, intros and the ending", () => {
    expect(threadKeyOf({ title: "Which way now?" })).toBeUndefined();
    expect(threadKeyOf({ title: "The End" })).toBeUndefined();
    expect(threadKeyOf(undefined)).toBeUndefined();
  });
});

describe("startsNewThread", () => {
  it("is true when the latest beat opens a thread after a switch or another thread", () => {
    expect(startsNewThread(titled("A choice", "The Night Market (1/3)"))).toBe(
      true
    );
    expect(
      startsNewThread(titled("The Night Market (3/3)", "The Old Mill (1/2)"))
    ).toBe(true);
    expect(startsNewThread(titled("The Night Market (1/3)"))).toBe(true);
  });

  it("is false while a thread continues, and outside threads", () => {
    expect(
      startsNewThread(titled("The Night Market (1/3)", "The Night Market (2/3)"))
    ).toBe(false);
    expect(startsNewThread(titled("The Night Market (3/3)", "A choice"))).toBe(
      false
    );
    expect(startsNewThread([])).toBe(false);
  });
});

describe("shouldRemindAtThreadChange", () => {
  const newThread = titled("A choice", "The Night Market (1/3)");

  it("reminds in vent and future-self stories when a new thread starts", () => {
    expect(shouldRemindAtThreadChange("vent-about-reality", newThread)).toBe(true);
    expect(shouldRemindAtThreadChange("see-your-future-self", newThread)).toBe(
      true
    );
  });

  it("does not remind in other stories", () => {
    expect(shouldRemindAtThreadChange("enjoy-fiction", newThread)).toBe(false);
    expect(shouldRemindAtThreadChange(undefined, newThread)).toBe(false);
  });
});
