import { randomUUID } from "crypto";
import type { QueueableOperation, QueueEvents } from "../types/queue.js";
import EventEmitter from "events";

export abstract class BaseQueueProcessor<
  TOperation extends QueueableOperation,
  TState
> {
  private operations: Map<string, TOperation> = new Map();
  private queues: Map<string, string[]> = new Map();
  private processing: boolean = false;
  private processingItems: Set<string> = new Set();
  public events: EventEmitter & {
    emit: <K extends keyof QueueEvents>(
      event: K,
      arg: Parameters<QueueEvents[K]>[0]
    ) => boolean;
  };

  constructor() {
    this.events = new EventEmitter() as typeof this.events;
  }

  async addOperation(
    operation: Omit<TOperation, keyof QueueableOperation>
  ): Promise<string> {
    const id = randomUUID();
    const fullOperation = {
      id,
      status: "pending" as const,
      createdAt: new Date(),
      ...operation,
    } as TOperation;

    this.operations.set(id, fullOperation);

    const queueId = this.getQueueId(fullOperation);
    if (!this.queues.has(queueId)) {
      console.log(`[Queue] Creating new queue ${queueId.slice(-5)}`);
      this.queues.set(queueId, []);
    }
    this.queues.get(queueId)!.push(id);
    console.log(
      `[Queue] Added ${(fullOperation as any).type} operation ${id.slice(
        -5
      )} to queue ${queueId.slice(-5)}`
    );

    if (!this.processing) {
      console.log("[Queue] Starting processor");
      this.start();
    } else {
      this.events.emit("newOperation");
    }

    return id;
  }

  async getOperation(operationId: string): Promise<TOperation | null> {
    return this.operations.get(operationId) || null;
  }

  async start(): Promise<void> {
    if (this.processing) return;

    this.processing = true;
    this.processQueues().catch((error) => {
      console.error("Queue processor error:", error);
      this.processing = false;
    });
  }

  async stop(): Promise<void> {
    this.processing = false;
  }

  protected abstract getQueueId(operation: TOperation): string;
  protected abstract processOperation(operation: TOperation): Promise<void>;

  private async processQueues(): Promise<void> {
    console.log("[Queue] Process queues started");
    while (this.processing) {
      const queueIds = Array.from(this.queues.keys());
      console.log(`[Queue] Processing ${queueIds.length} queues`);

      await Promise.all(
        queueIds.map(async (queueId) => {
          if (this.processingItems.has(queueId)) {
            console.log(`[Queue] Queue ${queueId} is already processing`);
            return;
          }

          const queue = this.queues.get(queueId)!;
          if (queue.length === 0) return;

          console.log(
            `[Queue] Processing queue ${queueId.slice(-5)} with ${
              queue.length
            } items`
          );
          await this.processQueue(queueId);
        })
      );

      if (this.allQueuesEmpty()) {
        console.log("[Queue] All queues empty, waiting for new operations");
        await new Promise<void>((resolve) => {
          const handler = () => {
            this.events.removeListener("newOperation", handler);
            resolve();
          };
          this.events.once("newOperation", handler);
        });
      }
    }
  }

  private async processQueue(queueId: string): Promise<void> {
    this.processingItems.add(queueId);

    try {
      const queue = this.queues.get(queueId)!;
      const operationId = queue[0];
      const operation = this.operations.get(operationId)!;

      console.log(
        `[Queue] Processing ${
          (operation as any).type
        } operation ${operationId.slice(-5)} from queue ${queueId.slice(-5)}`
      );
      operation.status = "processing";
      operation.startedAt = new Date();

      try {
        await this.processOperation(operation);

        operation.status = "completed";
        operation.completedAt = new Date();
        console.log(
          `[Queue] Completed ${
            (operation as any).type
          } operation ${operationId.slice(-5)}`
        );
      } catch (error) {
        operation.status = "failed";
        operation.completedAt = new Date();
        operation.error =
          error instanceof Error ? error.message : String(error);

        console.error(
          `[Queue] Failed ${
            (operation as any).type
          } operation ${operationId.slice(-5)}:`,
          operation.error
        );
        this.events.emit("operationError", {
          queueId,
          operationId,
          error: operation.error,
        });
      }

      queue.shift();
      if (queue.length === 0) {
        console.log(`[Queue] Queue ${queueId.slice(-5)} is now empty`);
        this.queues.delete(queueId);
      }
    } finally {
      this.processingItems.delete(queueId);
    }
  }

  private allQueuesEmpty(): boolean {
    return Array.from(this.queues.values()).every(
      (queue) => queue.length === 0
    );
  }
}
