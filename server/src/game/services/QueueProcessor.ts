import { randomUUID } from "crypto";
import type {
  QueueableOperation,
  QueueEvents,
  OperationErrorEvent,
} from "../queue.js";
import EventEmitter from "events";
import { Logger } from "@common/logger.js";

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
    const operationId = randomUUID();
    const fullOperation = {
      ...operation,
      id: operationId,
      status: "pending",
      createdAt: new Date(),
    } as TOperation;

    this.operations.set(operationId, fullOperation);

    const queueId = this.getQueueId(fullOperation);
    if (!this.queues.has(queueId)) {
      this.queues.set(queueId, []);
    }

    const queue = this.queues.get(queueId)!;
    queue.push(operationId);

    Logger.Queue.log(`Added operation ${operationId} to queue ${queueId}`);

    if (!this.processing) {
      Logger.Queue.log("Starting processor");
      this.start();
    } else {
      this.events.emit("newOperation");
    }

    return operationId;
  }

  async getOperation(operationId: string): Promise<TOperation | null> {
    return this.operations.get(operationId) || null;
  }

  async start(): Promise<void> {
    if (this.processing) return;

    this.processing = true;
    this.processQueues().catch((error) => {
      Logger.Queue.error("Queue processor error:", error);
      this.processing = false;
    });
  }

  async stop(): Promise<void> {
    this.processing = false;
  }

  protected abstract getQueueId(operation: TOperation): string;
  protected abstract processOperation(operation: TOperation): Promise<void>;

  /**
   * Centralized error handler for all operations
   * This method is called whenever an operation fails
   */
  protected handleOperationError(operation: TOperation, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    const details = error instanceof Error ? (error as any).cause : undefined;

    // Log the error (fix argument count)
    Logger.Queue.error(
      `Failed ${(operation as any).type} operation ${operation.id.slice(
        -5
      )}: ${errorMessage}`
    );
    if (stack) {
      Logger.Queue.error(`Stack trace: ${stack}`);
    }

    // Update operation status
    operation.status = "failed";
    operation.completedAt = new Date();
    operation.error = errorMessage;

    // Create error event with detailed information
    const errorEvent: OperationErrorEvent = {
      queueId: this.getQueueId(operation),
      operationId: operation.id,
      gameId: (operation as any).gameId,
      operationType: (operation as any).type,
      error: errorMessage,
      details: details ? String(details) : undefined,
      stack,
    };

    // Emit error event
    this.events.emit("operationError", errorEvent);
  }

  private async processQueues(): Promise<void> {
    Logger.Queue.log("Process queues started");
    while (this.processing) {
      const queueIds = Array.from(this.queues.keys());
      Logger.Queue.log(`Processing ${queueIds.length} queues`);

      await Promise.all(
        queueIds.map(async (queueId) => {
          if (this.processingItems.has(queueId)) {
            Logger.Queue.log(`Queue ${queueId} is already processing`);
            return;
          }

          const queue = this.queues.get(queueId)!;
          if (queue.length === 0) return;

          Logger.Queue.log(
            `Processing queue ${queueId.slice(-5)} with ${queue.length} items`
          );
          await this.processQueue(queueId);
        })
      );

      if (this.allQueuesEmpty()) {
        Logger.Queue.log("All queues empty, waiting for new operations");
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

      Logger.Queue.log(
        `Processing ${(operation as any).type} operation ${operationId.slice(
          -5
        )} from queue ${queueId.slice(-5)}`
      );
      operation.status = "processing";
      operation.startedAt = new Date();

      try {
        await this.processOperation(operation);

        operation.status = "completed";
        operation.completedAt = new Date();
        Logger.Queue.log(
          `Completed ${(operation as any).type} operation ${operationId.slice(
            -5
          )}`
        );
      } catch (error) {
        // Use the centralized error handler
        this.handleOperationError(operation, error);
      }

      queue.shift();
      if (queue.length === 0) {
        Logger.Queue.log(`Queue ${queueId.slice(-5)} is now empty`);
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
