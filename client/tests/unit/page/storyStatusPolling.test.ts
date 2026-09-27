import type { StoryStatusInfo } from "core/types/api";
import {
  MAX_CONSECUTIVE_POLL_ERRORS,
  pollStoryStatus,
} from "../../../src/page/hooks/storyStatusPolling";

type Answer = StoryStatusInfo | Error;

/** Runs a poll against scripted answers; scheduled polls run when `tick` is called. */
function scriptedPoll(answers: Answer[], cancelledAfter = Infinity) {
  const scheduled: Array<() => void> = [];
  const delays: number[] = [];
  const events: string[] = [];
  let checks = 0;
  const done = pollStoryStatus({
    check: async () => {
      const answer = answers[Math.min(checks, answers.length - 1)];
      checks += 1;
      if (answer instanceof Error) throw answer;
      return answer as StoryStatusInfo;
    },
    schedule: (next, delayMs) => {
      delays.push(delayMs);
      scheduled.push(next);
    },
    delayFor: () => 10000,
    isCancelled: () => checks >= cancelledAfter,
    onReady: () => events.push("ready"),
    onFailed: (reason) => events.push(`failed:${reason}`),
  });
  return {
    done,
    events,
    delays,
    checks: () => checks,
    async tick() {
      const next = scheduled.shift();
      next?.();
      await new Promise((resolve) => setImmediate(resolve));
    },
    pending: () => scheduled.length,
  };
}

describe("pollStoryStatus", () => {
  it("stops at ready", async () => {
    const poll = scriptedPoll([{ status: "queued" }, { status: "ready" }]);
    await poll.done;
    expect(poll.pending()).toBe(1);

    await poll.tick();

    expect(poll.events).toEqual(["ready"]);
    expect(poll.pending()).toBe(0);
    expect(poll.delays).toEqual([10000]);
  });

  it("stops at a failed setup and passes its reason on", async () => {
    const poll = scriptedPoll([{ status: "failed", reason: "setup_failed" }]);
    await poll.done;

    expect(poll.events).toEqual(["failed:setup_failed"]);
    expect(poll.pending()).toBe(0);
  });

  it("reads a failed status without a reason as a failed setup", async () => {
    const poll = scriptedPoll([{ status: "failed" }]);
    await poll.done;

    expect(poll.events).toEqual(["failed:setup_failed"]);
  });

  it("keeps polling through a failed request, and gives up after repeated ones", async () => {
    const poll = scriptedPoll([new Error("offline")]);
    await poll.done;
    for (let i = 1; i < MAX_CONSECUTIVE_POLL_ERRORS; i += 1) {
      expect(poll.events).toEqual([]);
      await poll.tick();
    }

    expect(poll.checks()).toBe(MAX_CONSECUTIVE_POLL_ERRORS);
    expect(poll.events).toEqual(["failed:unreachable"]);
    expect(poll.pending()).toBe(0);
  });

  it("counts only consecutive failed requests", async () => {
    const poll = scriptedPoll([
      new Error("offline"),
      new Error("offline"),
      { status: "queued" },
      new Error("offline"),
      new Error("offline"),
      { status: "ready" },
    ]);
    await poll.done;
    for (let i = 0; i < 5; i += 1) await poll.tick();

    expect(poll.events).toEqual(["ready"]);
  });

  it("does nothing more once cancelled (the player went back or tried again)", async () => {
    const poll = scriptedPoll([{ status: "queued" }, { status: "failed", reason: "setup_failed" }], 1);
    await poll.done;
    await poll.tick();

    expect(poll.events).toEqual([]);
    expect(poll.pending()).toBe(0);
  });
});
