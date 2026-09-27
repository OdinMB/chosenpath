import { describe, expect, it } from "@jest/globals";
import { SetupStatusTracker } from "../../../src/stories/setupStatus.js";

describe("SetupStatusTracker", () => {
  it("is queued while a setup runs and ready once its story is stored", () => {
    const tracker = new SetupStatusTracker();
    tracker.start("story-1");

    expect(tracker.statusOf("story-1", false)).toEqual({ status: "queued" });
    tracker.finish("story-1");
    expect(tracker.statusOf("story-1", true)).toEqual({ status: "ready" });
  });

  it("reports a failed setup with its reason, even when a story file was written before it failed", () => {
    const tracker = new SetupStatusTracker();
    tracker.start("story-1");
    tracker.fail("story-1", "setup_failed");

    expect(tracker.statusOf("story-1", false)).toEqual({ status: "failed", reason: "setup_failed" });
    expect(tracker.statusOf("story-1", true)).toEqual({ status: "failed", reason: "setup_failed" });
  });

  it("reports a story neither stored nor being set up as lost", () => {
    expect(new SetupStatusTracker().statusOf("story-9", false)).toEqual({
      status: "failed",
      reason: "setup_lost",
    });
  });

  it("reports a stored story it never tracked (a template story, or one from before a restart) as ready", () => {
    expect(new SetupStatusTracker().statusOf("story-9", true)).toEqual({ status: "ready" });
  });

  it("forgets the oldest failures past its cap; a forgotten one reads as lost, still failed", () => {
    const tracker = new SetupStatusTracker(2);
    ["a", "b", "c"].forEach((id) => {
      tracker.start(id);
      tracker.fail(id, "setup_failed");
    });

    expect(tracker.statusOf("a", false)).toEqual({ status: "failed", reason: "setup_lost" });
    expect(tracker.statusOf("b", false)).toEqual({ status: "failed", reason: "setup_failed" });
    expect(tracker.statusOf("c", false)).toEqual({ status: "failed", reason: "setup_failed" });
  });

  it("clears an earlier failure when the same id is set up again", () => {
    const tracker = new SetupStatusTracker();
    tracker.start("story-1");
    tracker.fail("story-1", "setup_failed");
    tracker.start("story-1");

    expect(tracker.statusOf("story-1", false)).toEqual({ status: "queued" });
  });
});
