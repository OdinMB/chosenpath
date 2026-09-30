import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { OperationErrorEvent, QueueableOperation } from "../../../../src/game/queue.js";
import { BaseQueueProcessor } from "../../../../src/game/services/QueueProcessor.js";

/*
 * The queue's failure path: an operation that throws is reported
 * (operationError), unless its kind has a resend budget, in which case it is
 * queued once more first (a failed turn, GameQueueProcessor). The budget
 * counts sends, so a failure never loops.
 */

type TestOperation = QueueableOperation & { gameId: string; type: string; input: { label: string } };

class TestQueue extends BaseQueueProcessor<TestOperation> {
  /** Every send, in order: the label and which send it was */
  readonly sent: Array<{ label: string; sends: number }> = [];
  /** How many sends of each label fail before one succeeds */
  failures = new Map<string, number>();
  budget = 0;

  protected resendsFor = (operation: TestOperation) => (operation.type === "resent" ? this.budget : 0);

  protected getQueueId(operation: TestOperation): string {
    return operation.gameId;
  }

  protected async processOperation(operation: TestOperation): Promise<void> {
    this.sent.push({ label: operation.input.label, sends: operation.sends ?? 1 });
    // A turn takes a while: whatever the game queues meanwhile waits behind it
    await new Promise((resolve) => setImmediate(resolve));
    const left = this.failures.get(operation.input.label) ?? 0;
    if (left > 0) {
      this.failures.set(operation.input.label, left - 1);
      throw new Error(`${operation.input.label} failed`);
    }
  }
}

/** Lets the queue run until nothing is queued (each operation hops through setImmediate). */
async function drained(): Promise<void> {
  for (let i = 0; i < 50; i++) await new Promise((resolve) => setImmediate(resolve));
}

let queue: TestQueue;
let errors: OperationErrorEvent[];

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  queue = new TestQueue();
  errors = [];
  queue.events.on("operationError", (event: OperationErrorEvent) => errors.push(event));
});

afterEach(async () => {
  await queue.stop();
  jest.restoreAllMocks();
});

const add = (type: string, label: string) => queue.addOperation({ gameId: "game-1", type, input: { label } });

describe("BaseQueueProcessor: the failure path", () => {
  it("reports a failed operation once when its kind has no resend budget", async () => {
    queue.budget = 1;
    queue.failures.set("choice", 5);
    await add("other", "choice");
    await drained();

    expect(queue.sent).toEqual([{ label: "choice", sends: 1 }]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ gameId: "game-1", error: "choice failed" });
  });

  it("sends a failed operation once more within its budget, and reports nothing when the resend succeeds", async () => {
    queue.budget = 1;
    queue.failures.set("turn", 1);
    await add("resent", "turn");
    await drained();

    expect(queue.sent).toEqual([
      { label: "turn", sends: 1 },
      { label: "turn", sends: 2 },
    ]);
    expect(errors).toEqual([]);
  });

  it("reports the failure after the last send the budget allows, and never sends it again", async () => {
    queue.budget = 1;
    queue.failures.set("turn", 10);
    await add("resent", "turn");
    await drained();

    expect(queue.sent).toEqual([
      { label: "turn", sends: 1 },
      { label: "turn", sends: 2 },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ gameId: "game-1", error: "turn failed" });
  });

  it("sends nothing again without a budget, as before", async () => {
    queue.failures.set("turn", 1);
    await add("resent", "turn");
    await drained();

    expect(queue.sent).toEqual([{ label: "turn", sends: 1 }]);
    expect(errors).toHaveLength(1);
  });

  it("queues the resend behind what the game already had queued", async () => {
    queue.budget = 1;
    queue.failures.set("turn", 1);
    await add("resent", "turn");
    await add("other", "image");
    await drained();

    expect(queue.sent).toEqual([
      { label: "turn", sends: 1 },
      { label: "image", sends: 1 },
      { label: "turn", sends: 2 },
    ]);
    expect(errors).toEqual([]);
  });

  it("counts an operation as unfinished from when it is queued until it completes", async () => {
    await add("other", "image");
    expect(queue.hasUnfinished("game-1")).toBe(true);
    expect(queue.hasUnfinished("game-2")).toBe(false);

    await drained();
    expect(queue.hasUnfinished("game-1")).toBe(false);
  });

  it("counts nothing once an operation's last send has failed, by the time its failure is reported", async () => {
    queue.budget = 1;
    queue.failures.set("turn", 10);
    const whenReported: boolean[] = [];
    queue.events.on("operationError", () => whenReported.push(queue.hasUnfinished("game-1")));
    await add("resent", "turn");
    await drained();

    expect(queue.sent).toHaveLength(2);
    expect(whenReported).toEqual([false]);
  });

  it("counts only the operations the caller asks about", async () => {
    await add("other", "image");

    expect(queue.hasUnfinished("game-1", (operation) => operation.type === "resent")).toBe(false);
    expect(queue.hasUnfinished("game-1", (operation) => operation.type === "other")).toBe(true);
  });

  it("logs the resend with the error's class, never its message", async () => {
    const warn = console.warn as jest.MockedFunction<typeof console.warn>;
    queue.budget = 1;
    queue.failures.set("turn", 1);
    await add("resent", "turn");
    await drained();

    const lines = warn.mock.calls.map((call) => String(call[0]));
    expect(lines.some((line) => line.includes("sending it once more") && line.includes("Error"))).toBe(true);
    expect(lines.join("\n")).not.toContain("turn failed");
  });
});
