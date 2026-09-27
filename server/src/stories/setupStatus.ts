import type {
  StorySetupFailureReason,
  StoryStatusInfo,
} from "core/types/api.js";

/*
 * What happened to each custom story's setup in this process, for the
 * client's status polling (GET /stories/:id/status). A setup runs in the
 * background after POST /stories answered "queued"; when it fails for good
 * its DB entries are deleted, so without this record nothing would tell the
 * client to stop waiting.
 *
 * Game sessions and the story cache live in this process too, so a restart
 * loses every setup in flight: an id that is neither being set up here nor
 * stored reads as failed ("setup_lost") rather than queued forever.
 */

/** Failures kept for polling; past this the oldest are forgotten and read as lost. */
export const MAX_FAILED_SETUPS = 5000;

export class SetupStatusTracker {
  private readonly generating = new Set<string>();
  private readonly failed = new Map<string, StorySetupFailureReason>();

  constructor(private readonly maxFailed = MAX_FAILED_SETUPS) {}

  /** A setup starts for this story id. */
  start(storyId: string): void {
    this.failed.delete(storyId);
    this.generating.add(storyId);
  }

  /** The setup ended with the story stored. */
  finish(storyId: string): void {
    this.generating.delete(storyId);
  }

  /** The setup failed for good. */
  fail(storyId: string, reason: StorySetupFailureReason): void {
    this.generating.delete(storyId);
    this.failed.delete(storyId);
    this.failed.set(storyId, reason);
    while (this.failed.size > this.maxFailed) {
      const oldest = this.failed.keys().next().value;
      if (oldest === undefined) break;
      this.failed.delete(oldest);
    }
  }

  /** The status the client sees; `stored` is whether the story's state exists. */
  statusOf(storyId: string, stored: boolean): StoryStatusInfo {
    const reason = this.failed.get(storyId);
    if (reason) return { status: "failed", reason };
    if (stored) return { status: "ready" };
    if (this.generating.has(storyId)) return { status: "queued" };
    return { status: "failed", reason: "setup_lost" };
  }
}

export const setupStatusTracker = new SetupStatusTracker();
