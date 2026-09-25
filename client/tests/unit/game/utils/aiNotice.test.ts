import {
  beatAiNoticeVariant,
  gameAiNoticeVariant,
  sessionOpeningBeatIndex,
  shouldRemindAtThreadChange,
  startsNewThread,
  threadKeyOf,
} from "../../../../src/game/utils/aiNotice";

const titled = (...titles: string[]) => titles.map((title) => ({ title }));

describe("gameAiNoticeVariant", () => {
  it("uses the child-friendly notice for read-with-kids stories only", () => {
    expect(gameAiNoticeVariant("read-with-kids")).toBe("kids");
    expect(gameAiNoticeVariant("vent-about-reality")).toBe("session");
    expect(gameAiNoticeVariant(undefined)).toBe("session");
  });
});

describe("sessionOpeningBeatIndex", () => {
  it("is 0 before the story's first beat exists", () => {
    expect(sessionOpeningBeatIndex([])).toBe(0);
  });

  it("is the latest beat when the player still has to choose on it", () => {
    expect(
      sessionOpeningBeatIndex([{ choice: 1 }, { choice: 0 }, { choice: -1 }])
    ).toBe(2);
  });

  it("is the beat being written when the latest beat already has a choice", () => {
    expect(sessionOpeningBeatIndex([{ choice: 1 }, { choice: 0 }])).toBe(2);
  });
});

describe("beatAiNoticeVariant", () => {
  const history = titled(
    "Arrival",
    "The Night Market (1/2)",
    "The Night Market (2/2)",
    "The Old Mill (1/2)"
  );

  it("shows the session notice on the session's opening beat and on the first paint", () => {
    expect(beatAiNoticeVariant("enjoy-fiction", history, 0, 0)).toBe("session");
    expect(beatAiNoticeVariant("enjoy-fiction", history, 3, 3)).toBe("session");
    expect(beatAiNoticeVariant("enjoy-fiction", history, null, 3)).toBe(
      "session"
    );
  });

  it("uses the child-friendly session notice in read-with-kids stories", () => {
    expect(beatAiNoticeVariant("read-with-kids", history, 0, 0)).toBe("kids");
  });

  it("shows the session notice on a pending beat the session opened on", () => {
    expect(beatAiNoticeVariant("enjoy-fiction", history, 4, 4)).toBe("session");
  });

  it("prefers the session notice when the opening beat also starts a thread", () => {
    expect(beatAiNoticeVariant("vent-about-reality", history, 1, 1)).toBe(
      "session"
    );
  });

  it("reminds at each later thread start in vent and future-self stories", () => {
    for (const category of [
      "vent-about-reality",
      "see-your-future-self",
    ] as const) {
      expect(beatAiNoticeVariant(category, history, 1, 0)).toBe("reminder");
      expect(beatAiNoticeVariant(category, history, 3, 0)).toBe("reminder");
    }
  });

  it("shows nothing while a thread continues, on a pending beat, or in other stories", () => {
    expect(beatAiNoticeVariant("vent-about-reality", history, 2, 0)).toBe(
      undefined
    );
    expect(beatAiNoticeVariant("vent-about-reality", history, 4, 0)).toBe(
      undefined
    );
    expect(beatAiNoticeVariant("enjoy-fiction", history, 1, 0)).toBe(
      undefined
    );
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
